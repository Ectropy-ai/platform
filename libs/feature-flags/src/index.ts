// Feature flags system for Ectropy platform
// Enables progressive rollout and A/B testing capabilities

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  environments?: readonly string[];
  rolloutPercentage?: number;
  conditions?: Record<string, any>;
}

export const FLAGS = {
  // Core Platform Features
  MCP_SERVER_ENABLED: {
    key: 'MCP_SERVER_ENABLED',
    enabled: process.env.FF_MCP_SERVER === 'true',
    description: 'Enable MCP server functionality',
    environments: ['alpha', 'beta', 'staging', 'production']
  },
  
  SEMANTIC_SEARCH: {
    key: 'SEMANTIC_SEARCH', 
    enabled: process.env.FF_SEMANTIC_SEARCH === 'true',
    description: 'Enable semantic search capabilities',
    environments: ['alpha', 'beta', 'staging']
  },
  
  NEW_IFC_PROCESSING: {
    key: 'NEW_IFC_PROCESSING',
    enabled: process.env.FF_NEW_IFC === 'true',
    description: 'Enable enhanced IFC processing engine',
    environments: ['alpha', 'beta']
  },
  
  // Performance Features
  ENHANCED_CACHING: {
    key: 'ENHANCED_CACHING',
    enabled: process.env.FF_ENHANCED_CACHING === 'true',
    description: 'Enable multi-tier caching system',
    environments: ['alpha', 'beta', 'staging', 'production']
  },
  
  // UI/UX Features
  NEW_DASHBOARD_UI: {
    key: 'NEW_DASHBOARD_UI',
    enabled: process.env.FF_NEW_DASHBOARD === 'true',
    description: 'Enable redesigned dashboard interface',
    environments: ['alpha', 'beta']
  },
  
  REAL_TIME_COLLABORATION: {
    key: 'REAL_TIME_COLLABORATION',
    enabled: process.env.FF_REAL_TIME_COLLAB === 'true',
    description: 'Enable real-time collaboration features',
    environments: ['alpha']
  },
  
  // Security Features
  ENHANCED_AUTH: {
    key: 'ENHANCED_AUTH',
    enabled: process.env.FF_ENHANCED_AUTH === 'true',
    description: 'Enable enhanced authentication system',
    environments: ['alpha', 'beta', 'staging', 'production']
  },
  
  // Monitoring Features
  ADVANCED_METRICS: {
    key: 'ADVANCED_METRICS',
    enabled: process.env.FF_ADVANCED_METRICS === 'true',
    description: 'Enable advanced performance metrics',
    environments: ['alpha', 'beta', 'staging', 'production']
  },
  
  // Integration Features
  SPECKLE_V2_INTEGRATION: {
    key: 'SPECKLE_V2_INTEGRATION',
    enabled: process.env.FF_SPECKLE_V2 === 'true',
    description: 'Enable Speckle v2 integration',
    environments: ['alpha', 'beta']
  },
  
  // Experimental Features
  AI_POWERED_INSIGHTS: {
    key: 'AI_POWERED_INSIGHTS',
    enabled: process.env.FF_AI_INSIGHTS === 'true',
    description: 'Enable AI-powered project insights',
    environments: ['alpha']
  }
} as const;

export type FeatureFlagKey = keyof typeof FLAGS;

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagKey: FeatureFlagKey, environment?: string): boolean {
  const flag = FLAGS[flagKey];
  
  if (!flag) {
    return false;
  }
  
  // Check environment restrictions
  if (environment && flag.environments && !flag.environments.includes(environment as any)) {
    return false;
  }
  
  return flag.enabled;
}

/**
 * Get feature flag configuration
 */
export function getFeatureFlag(flagKey: FeatureFlagKey): FeatureFlag | null {
  const flag = FLAGS[flagKey];
  return flag ? {...flag} as FeatureFlag : null;
}

/**
 * Get all enabled feature flags for an environment
 */
export function getEnabledFeatures(environment?: string): FeatureFlagKey[] {
  return Object.keys(FLAGS).filter(key => 
    isFeatureEnabled(key as FeatureFlagKey, environment)
  ) as FeatureFlagKey[];
}

/**
 * React hook for feature flags (if using React)
 */
export function useFeatureFlag(flagKey: FeatureFlagKey): boolean {
  const environment = process.env.NODE_ENV || 'development';
  return isFeatureEnabled(flagKey, environment);
}

/**
 * Feature flag middleware for Express.js
 */
export function featureFlagMiddleware(req: any, res: any, next: any) {
  req.featureFlags = {
    isEnabled: (flagKey: FeatureFlagKey) => isFeatureEnabled(flagKey),
    getFlag: (flagKey: FeatureFlagKey) => getFeatureFlag(flagKey),
    getAllEnabled: () => getEnabledFeatures()
  };
  next();
}

/**
 * Environment-specific feature flag loading
 */
export function loadEnvironmentFeatures(environment: string): Record<string, boolean> {
  const enabledFeatures: Record<string, boolean> = {};
  
  Object.entries(FLAGS).forEach(([key, flag]) => {
    if (!flag.environments || flag.environments.includes(environment as any)) {
      enabledFeatures[key] = flag.enabled;
    }
  });
  
  return enabledFeatures;
}

/**
 * Feature flag configuration for different environments
 */
export const ENVIRONMENT_CONFIGS = {
  alpha: {
    MCP_SERVER_ENABLED: true,
    SEMANTIC_SEARCH: true,
    NEW_IFC_PROCESSING: true,
    ENHANCED_CACHING: true,
    NEW_DASHBOARD_UI: true,
    REAL_TIME_COLLABORATION: true,
    ENHANCED_AUTH: true,
    ADVANCED_METRICS: true,
    SPECKLE_V2_INTEGRATION: true,
    AI_POWERED_INSIGHTS: true
  },
  
  beta: {
    MCP_SERVER_ENABLED: true,
    SEMANTIC_SEARCH: true,
    NEW_IFC_PROCESSING: true,
    ENHANCED_CACHING: true,
    NEW_DASHBOARD_UI: true,
    REAL_TIME_COLLABORATION: false,
    ENHANCED_AUTH: true,
    ADVANCED_METRICS: true,
    SPECKLE_V2_INTEGRATION: true,
    AI_POWERED_INSIGHTS: false
  },
  
  staging: {
    MCP_SERVER_ENABLED: true,
    SEMANTIC_SEARCH: true,
    NEW_IFC_PROCESSING: false,
    ENHANCED_CACHING: true,
    NEW_DASHBOARD_UI: false,
    REAL_TIME_COLLABORATION: false,
    ENHANCED_AUTH: true,
    ADVANCED_METRICS: true,
    SPECKLE_V2_INTEGRATION: false,
    AI_POWERED_INSIGHTS: false
  },
  
  production: {
    MCP_SERVER_ENABLED: true,
    SEMANTIC_SEARCH: false,
    NEW_IFC_PROCESSING: false,
    ENHANCED_CACHING: true,
    NEW_DASHBOARD_UI: false,
    REAL_TIME_COLLABORATION: false,
    ENHANCED_AUTH: true,
    ADVANCED_METRICS: true,
    SPECKLE_V2_INTEGRATION: false,
    AI_POWERED_INSIGHTS: false
  }
};

export default FLAGS;