/**
 * Page Configurations - Central Export
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * All dashboard page configurations are exported from this file.
 * Use these configs with ConfigDrivenPage component to render dashboards.
 *
 * @example
 * ```typescript
 * import { ownerDashboardConfig } from './config/pages';
 * import { ConfigDrivenPage } from './components/templates/ConfigDrivenPage';
 *
 * function OwnerDashboard() {
 *   return <ConfigDrivenPage config={ownerDashboardConfig} />;
 * }
 * ```
 */

// Page configurations
export { ownerDashboardConfig } from './owner.config';
export { architectDashboardConfig } from './architect.config';
export { engineerDashboardConfig } from './engineer.config';
export { contractorDashboardConfig } from './contractor.config';
export { adminDashboardConfig } from './admin.config';

// Re-export types for convenience
export type { DashboardPageConfig } from '../types/page-config.types';

// Page config registry for dynamic loading
import { ownerDashboardConfig } from './owner.config';
import { architectDashboardConfig } from './architect.config';
import { engineerDashboardConfig } from './engineer.config';
import { contractorDashboardConfig } from './contractor.config';
import { adminDashboardConfig } from './admin.config';
import type { DashboardPageConfig, UserRole } from '../types/page-config.types';

/**
 * Registry of all page configurations
 */
export const PAGE_CONFIG_REGISTRY: Record<string, DashboardPageConfig> = {
  'owner-dashboard': ownerDashboardConfig,
  'architect-dashboard': architectDashboardConfig,
  'engineer-dashboard': engineerDashboardConfig,
  'contractor-dashboard': contractorDashboardConfig,
  'admin-dashboard': adminDashboardConfig,
};

/**
 * Get page config by role
 */
export function getPageConfigByRole(role: UserRole): DashboardPageConfig | undefined {
  const roleToConfig: Record<UserRole, string> = {
    owner: 'owner-dashboard',
    architect: 'architect-dashboard',
    engineer: 'engineer-dashboard',
    contractor: 'contractor-dashboard',
    admin: 'admin-dashboard',
    manufacturer: 'contractor-dashboard', // Use contractor dashboard for now
    inspector: 'engineer-dashboard', // Use engineer dashboard for now
    viewer: 'owner-dashboard', // Use owner dashboard (read-only view)
  };

  const configId = roleToConfig[role];
  return configId ? PAGE_CONFIG_REGISTRY[configId] : undefined;
}

/**
 * Get all page configs
 */
export function getAllPageConfigs(): DashboardPageConfig[] {
  return Object.values(PAGE_CONFIG_REGISTRY);
}

/**
 * Get page config by ID
 */
export function getPageConfigById(id: string): DashboardPageConfig | undefined {
  return PAGE_CONFIG_REGISTRY[id];
}
