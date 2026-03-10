/**
 * Feature Flags Configuration
 *
 * ENTERPRISE FEATURE FLAG SYSTEM (2026-01-23)
 *
 * Purpose: Centralized feature flag management for:
 * - Progressive feature rollout
 * - A/B testing
 * - Environment-specific features
 * - Demo mode controls
 *
 * Architecture:
 * - Static flags defined here
 * - Runtime flags from API/environment
 * - Feature flag context for React components
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 */

import { FeatureFlag } from '../types/page-config.types';

// ============================================================================
// FEATURE FLAG DEFINITIONS
// ============================================================================

/**
 * Feature flag metadata
 */
export interface FeatureFlagDefinition {
  /** Flag identifier */
  id: FeatureFlag;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Default value */
  defaultValue: boolean;
  /** Environment variable override */
  envVar?: string;
  /** Minimum role required */
  minRole?: string;
  /** Feature category */
  category: 'core' | 'ai' | 'integration' | 'experimental' | 'admin';
  /** Rollout percentage (0-100) */
  rolloutPercentage?: number;
  /** Dependencies on other flags */
  dependencies?: FeatureFlag[];
}

/**
 * All feature flag definitions
 */
export const FEATURE_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  // Core Features
  {
    id: 'enableSpeckle',
    name: 'Speckle BIM Viewer',
    description: 'Enable 3D BIM model viewing via Speckle integration',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_SPECKLE',
    category: 'core',
  },
  {
    id: 'enableWebSockets',
    name: 'WebSocket Connections',
    description: 'Enable real-time updates via WebSocket connections',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_WEBSOCKETS',
    category: 'core',
  },
  {
    id: 'enableGovernance',
    name: 'DAO Governance',
    description: 'Enable proposal and voting system for project decisions',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_GOVERNANCE',
    category: 'core',
  },
  {
    id: 'enableNotifications',
    name: 'Notifications',
    description: 'Enable in-app notification system',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_NOTIFICATIONS',
    category: 'core',
  },
  {
    id: 'enableExportFeatures',
    name: 'Export Features',
    description: 'Enable data export to CSV, PDF, etc.',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_EXPORT',
    category: 'core',
  },

  // AI Features
  {
    id: 'enableAIAnalysis',
    name: 'AI Analysis',
    description: 'Enable AI-powered model analysis (cost, compliance, quality)',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_AI_ANALYSIS',
    category: 'ai',
  },
  {
    id: 'enableMCPChat',
    name: 'MCP Assistant',
    description: 'Enable MCP-powered chat assistant for deliverable submission',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_MCP_CHAT',
    category: 'ai',
  },
  {
    id: 'enableSEPPAChat',
    name: 'SEPPA Assistant',
    description: 'Enable Claude-powered SEPPA assistant for construction PM support',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_SEPPA_CHAT',
    category: 'ai',
  },
  {
    id: 'enableVoiceInput',
    name: 'Voice Input',
    description: 'Enable voice-to-text input via Whisper API',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_VOICE_INPUT',
    category: 'ai',
    rolloutPercentage: 0, // Not yet implemented
  },

  // Integration Features
  {
    id: 'enableFileAttachments',
    name: 'File Attachments',
    description: 'Enable file uploads and attachments in chat/forms',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_FILE_ATTACHMENTS',
    category: 'integration',
    rolloutPercentage: 0, // Not yet implemented
  },
  {
    id: 'enableEngineeringTasks',
    name: 'Engineering Tasks',
    description: 'Enable task management for engineers with /api/v1/tasks endpoint',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_ENGINEERING_TASKS',
    category: 'integration',
    // SPRINT 5 (2026-01-24): Backend API implemented in tasks.routes.ts
  },
  {
    id: 'enableStructuralAlerts',
    name: 'Structural Alerts',
    description: 'Enable structural analysis alerts with /api/v1/alerts endpoint',
    defaultValue: true,
    envVar: 'REACT_APP_ENABLE_STRUCTURAL_ALERTS',
    category: 'integration',
    // SPRINT 5 (2026-01-24): Backend API implemented in alerts.routes.ts
  },
  {
    id: 'enableManufacturerProducts',
    name: 'Manufacturer Products',
    description: 'Enable manufacturer product catalog integration',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_MANUFACTURER_PRODUCTS',
    category: 'integration',
    rolloutPercentage: 0, // Backend API returns mock data
  },
  {
    id: 'enableMultiTenant',
    name: 'Multi-Tenant Features',
    description: 'Enable multi-tenant organization management',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_MULTI_TENANT',
    category: 'integration',
    minRole: 'admin',
  },

  // Experimental Features
  {
    id: 'enableAdvancedAnalytics',
    name: 'Advanced Analytics',
    description: 'Enable advanced analytics dashboards with charts and visualizations',
    defaultValue: false,
    envVar: 'REACT_APP_ENABLE_ADVANCED_ANALYTICS',
    category: 'experimental',
    rolloutPercentage: 50,
  },
  {
    id: 'enableDemoMode',
    name: 'Demo Mode',
    description: 'Enable demo mode with sample data and guided tours',
    defaultValue: process.env.NODE_ENV === 'development',
    envVar: 'REACT_APP_ENABLE_DEMO_MODE',
    category: 'admin',
    minRole: 'admin',
  },
];

// ============================================================================
// FEATURE FLAG UTILITIES
// ============================================================================

/**
 * Get all feature flags with current values
 */
export function getFeatureFlags(): Record<FeatureFlag, boolean> {
  const flags: Partial<Record<FeatureFlag, boolean>> = {};

  for (const definition of FEATURE_FLAG_DEFINITIONS) {
    // Check environment variable first
    if (definition.envVar) {
      const envValue = process.env[definition.envVar];
      if (envValue !== undefined) {
        flags[definition.id] = envValue === 'true';
        continue;
      }
    }

    // Check rollout percentage
    if (definition.rolloutPercentage !== undefined && definition.rolloutPercentage < 100) {
      // Simple deterministic rollout based on user ID hash
      // In production, this would use a proper feature flag service
      flags[definition.id] = definition.rolloutPercentage > 0 && Math.random() * 100 < definition.rolloutPercentage;
      continue;
    }

    // Use default value
    flags[definition.id] = definition.defaultValue;
  }

  return flags as Record<FeatureFlag, boolean>;
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const definition = FEATURE_FLAG_DEFINITIONS.find(d => d.id === flag);
  if (!definition) {
    console.warn(`Unknown feature flag: ${flag}`);
    return false;
  }

  // Check environment variable
  if (definition.envVar) {
    const envValue = process.env[definition.envVar];
    if (envValue !== undefined) {
      return envValue === 'true';
    }
  }

  return definition.defaultValue;
}

/**
 * Get feature flag definition
 */
export function getFeatureFlagDefinition(flag: FeatureFlag): FeatureFlagDefinition | undefined {
  return FEATURE_FLAG_DEFINITIONS.find(d => d.id === flag);
}

/**
 * Get feature flags by category
 */
export function getFeatureFlagsByCategory(category: FeatureFlagDefinition['category']): FeatureFlagDefinition[] {
  return FEATURE_FLAG_DEFINITIONS.filter(d => d.category === category);
}

/**
 * Check if feature dependencies are satisfied
 */
export function areDependenciesSatisfied(flag: FeatureFlag): boolean {
  const definition = getFeatureFlagDefinition(flag);
  if (!definition?.dependencies) {
    return true;
  }

  return definition.dependencies.every(dep => isFeatureEnabled(dep));
}

// ============================================================================
// FEATURE FLAG PRESETS
// ============================================================================

/**
 * Preset configurations for different environments/modes
 */
export const FEATURE_FLAG_PRESETS = {
  /** All features enabled (development/testing) */
  all: {
    enableSpeckle: true,
    enableWebSockets: true,
    enableGovernance: true,
    enableNotifications: true,
    enableExportFeatures: true,
    enableAIAnalysis: true,
    enableMCPChat: true,
    enableSEPPAChat: true,
    enableVoiceInput: true,
    enableFileAttachments: true,
    enableEngineeringTasks: true,
    enableStructuralAlerts: true,
    enableManufacturerProducts: true,
    enableMultiTenant: true,
    enableAdvancedAnalytics: true,
    enableDemoMode: true,
  } as Record<FeatureFlag, boolean>,

  /** Production-safe features only */
  production: {
    enableSpeckle: true,
    enableWebSockets: false,
    enableGovernance: true,
    enableNotifications: true,
    enableExportFeatures: true,
    enableAIAnalysis: true,
    enableMCPChat: true,
    enableSEPPAChat: true,
    enableVoiceInput: false,
    enableFileAttachments: false,
    enableEngineeringTasks: true, // SPRINT 5 (2026-01-24): Backend API implemented
    enableStructuralAlerts: true, // SPRINT 5 (2026-01-24): Backend API implemented
    enableManufacturerProducts: false,
    enableMultiTenant: false,
    enableAdvancedAnalytics: false,
    enableDemoMode: false,
  } as Record<FeatureFlag, boolean>,

  /** Demo mode features */
  demo: {
    enableSpeckle: true,
    enableWebSockets: false,
    enableGovernance: true,
    enableNotifications: true,
    enableExportFeatures: true,
    enableAIAnalysis: true,
    enableMCPChat: true,
    enableSEPPAChat: true,
    enableVoiceInput: false,
    enableFileAttachments: false,
    enableEngineeringTasks: true, // SPRINT 5 (2026-01-24): Backend API implemented
    enableStructuralAlerts: true, // SPRINT 5 (2026-01-24): Backend API implemented
    enableManufacturerProducts: false,
    enableMultiTenant: false,
    enableAdvancedAnalytics: true,
    enableDemoMode: true,
  } as Record<FeatureFlag, boolean>,

  /** Minimal features (MVP) */
  minimal: {
    enableSpeckle: true,
    enableWebSockets: false,
    enableGovernance: true,
    enableNotifications: false,
    enableExportFeatures: false,
    enableAIAnalysis: false,
    enableMCPChat: false,
    enableSEPPAChat: false,
    enableVoiceInput: false,
    enableFileAttachments: false,
    enableEngineeringTasks: false,
    enableStructuralAlerts: false,
    enableManufacturerProducts: false,
    enableMultiTenant: false,
    enableAdvancedAnalytics: false,
    enableDemoMode: false,
  } as Record<FeatureFlag, boolean>,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  definitions: FEATURE_FLAG_DEFINITIONS,
  presets: FEATURE_FLAG_PRESETS,
  getFeatureFlags,
  isFeatureEnabled,
  getFeatureFlagDefinition,
  getFeatureFlagsByCategory,
  areDependenciesSatisfied,
};
