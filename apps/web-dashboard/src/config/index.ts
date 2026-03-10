/**
 * Configuration System - Central Export
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * This module provides the complete configuration system for the web dashboard:
 * - Page configurations (declarative dashboard definitions)
 * - Feature flags (runtime feature toggles)
 * - Type definitions (TypeScript interfaces)
 *
 * @example
 * ```typescript
 * import {
 *   ownerDashboardConfig,
 *   getFeatureFlags,
 *   isFeatureEnabled,
 *   getPageConfigByRole,
 * } from './config';
 * ```
 */

// Page configurations
export * from './pages';

// Feature flags
export * from './features';

// Types
export * from './types';
