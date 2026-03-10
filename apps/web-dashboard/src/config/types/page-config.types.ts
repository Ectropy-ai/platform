/**
 * Dashboard Page Configuration Types
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Enable declarative, config-driven dashboard pages that can be
 * easily modified without code changes. Supports:
 * - Role-based dashboard configurations
 * - Feature flag integration
 * - Dynamic section rendering
 * - Shared data requirements
 *
 * Architecture Pattern: Configuration-as-Code
 * - Pages defined as JSON/TypeScript config objects
 * - Rendered by ConfigDrivenPage component
 * - Uses DashboardLayout template
 *
 * @see apps/web-dashboard/src/components/templates/ConfigDrivenPage.tsx
 * @see .roadmap/features/foundation-layer/README.md
 */

import { ReactNode } from 'react';
import { GridSize } from '@mui/material';

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * User roles supported by the platform
 */
export type UserRole =
  | 'architect'
  | 'engineer'
  | 'contractor'
  | 'owner'
  | 'admin'
  | 'manufacturer'
  | 'inspector'
  | 'viewer';

/**
 * Feature flags that control functionality visibility
 */
export type FeatureFlag =
  | 'enableSpeckle'
  | 'enableWebSockets'
  | 'enableAIAnalysis'
  | 'enableVoiceInput'
  | 'enableFileAttachments'
  | 'enableGovernance'
  | 'enableMCPChat'
  | 'enableSEPPAChat'
  | 'enableEngineeringTasks'
  | 'enableStructuralAlerts'
  | 'enableManufacturerProducts'
  | 'enableDemoMode'
  | 'enableAdvancedAnalytics'
  | 'enableExportFeatures'
  | 'enableNotifications'
  | 'enableMultiTenant';

/**
 * Data sources that can be required by a page
 */
export type DataSource =
  | 'projects'
  | 'elements'
  | 'proposals'
  | 'votes'
  | 'users'
  | 'tasks'
  | 'alerts'
  | 'products'
  | 'streams'
  | 'analysisResults'
  | 'systemStats'
  | 'auditLogs';

/**
 * HTTP methods for actions
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

/**
 * Icon identifiers (mapped to MUI icons in renderer)
 */
export type IconId =
  | 'Dashboard'
  | 'ViewInAr'
  | 'Analytics'
  | 'Upload'
  | 'Assignment'
  | 'Build'
  | 'Engineering'
  | 'Warning'
  | 'People'
  | 'Settings'
  | 'Gavel'
  | 'AccountBalance'
  | 'Timeline'
  | 'Inventory'
  | 'CheckCircle'
  | 'Schedule'
  | 'AttachMoney'
  | 'Description'
  | 'Notifications'
  | 'Security'
  | 'Speed'
  | 'Storage';

/**
 * Navigation item in sidebar
 */
export interface NavigationItemConfig {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Icon identifier */
  icon: IconId;
  /** Route path */
  path: string;
  /** Feature flag that controls visibility */
  featureFlag?: FeatureFlag;
  /** Badge count (for notifications, etc.) */
  badge?: number | 'dynamic';
  /** Sub-items for nested navigation */
  children?: NavigationItemConfig[];
}

/**
 * Sidebar configuration
 */
export interface SidebarConfig {
  /** Navigation items */
  items: NavigationItemConfig[];
  /** Logo configuration */
  logo?: {
    text: string;
    icon?: string;
  };
  /** Footer content */
  footer?: {
    text: string;
    version?: string;
  };
}

/**
 * Layout configuration
 */
export interface LayoutConfig {
  /** Template to use */
  template: 'DashboardLayout' | 'FullWidthLayout' | 'SplitPaneLayout';
  /** Sidebar configuration */
  sidebar: SidebarConfig;
  /** Header configuration */
  header?: {
    showSearch?: boolean;
    showNotifications?: boolean;
    showUserMenu?: boolean;
    actions?: ActionConfig[];
  };
}

// ============================================================================
// SECTION TYPES
// ============================================================================

/**
 * Grid sizing for responsive layouts
 */
export interface GridConfig {
  xs?: GridSize;
  sm?: GridSize;
  md?: GridSize;
  lg?: GridSize;
  xl?: GridSize;
}

/**
 * Base section configuration
 */
export interface BaseSectionConfig {
  /** Unique section identifier */
  id: string;
  /** Section title (optional) */
  title?: string;
  /** Grid sizing */
  grid: GridConfig;
  /** Feature flag that controls visibility */
  featureFlag?: FeatureFlag;
  /** Minimum height in pixels */
  minHeight?: number;
  /** Loading state configuration */
  loading?: {
    skeleton?: 'card' | 'table' | 'chart' | 'viewer';
    message?: string;
  };
}

/**
 * Component section - renders a specific React component
 */
export interface ComponentSectionConfig extends BaseSectionConfig {
  type: 'component';
  /** Component identifier */
  component:
    | 'SpeckleBIMViewer'
    | 'AIAnalysisPanel'
    | 'GovernancePanel'
    | 'MCPChatPanel'
    | 'SEPPAChatPanel'
    | 'ProjectSelector'
    | 'ElementPropertiesPanel'
    | 'SystemHealthPanel'
    | 'UserManagementPanel'
    | 'AuditLogViewer'
    | 'MetricsChart'
    | 'NotificationCenter';
  /** Props to pass to component */
  props?: Record<string, unknown>;
}

/**
 * Data list section - renders a list/table of data
 */
export interface DataListSectionConfig extends BaseSectionConfig {
  type: 'data-list';
  /** Data source to use */
  dataSource: DataSource;
  /** Columns to display */
  columns: ColumnConfig[];
  /** Available row actions */
  actions?: ('view' | 'edit' | 'delete' | 'select')[];
  /** Pagination configuration */
  pagination?: {
    enabled: boolean;
    pageSize: number;
    pageSizeOptions?: number[];
  };
  /** Filtering configuration */
  filters?: FilterConfig[];
  /** Sorting configuration */
  sorting?: {
    enabled: boolean;
    defaultField?: string;
    defaultDirection?: 'asc' | 'desc';
  };
  /** Empty state message */
  emptyMessage?: string;
}

/**
 * Column configuration for data lists
 */
export interface ColumnConfig {
  /** Field name in data object */
  field: string;
  /** Header label */
  header: string;
  /** Column width */
  width?: number | string;
  /** Cell renderer type */
  type?: 'text' | 'date' | 'status' | 'currency' | 'progress' | 'avatar' | 'chip' | 'actions';
  /** Format string (for dates, numbers) */
  format?: string;
  /** Status color mapping */
  statusColors?: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'>;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Whether column is hidden by default */
  hidden?: boolean;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  /** Field to filter on */
  field: string;
  /** Filter label */
  label: string;
  /** Filter type */
  type: 'text' | 'select' | 'date' | 'dateRange' | 'multiSelect';
  /** Options for select/multiSelect */
  options?: { value: string; label: string }[];
  /** Data source for dynamic options */
  optionsSource?: DataSource;
}

/**
 * Metrics section - renders metric cards/stats
 */
export interface MetricsSectionConfig extends BaseSectionConfig {
  type: 'metrics';
  /** Metrics to display */
  metrics: MetricConfig[];
  /** Layout for metrics */
  layout?: 'grid' | 'row' | 'column';
}

/**
 * Individual metric configuration
 */
export interface MetricConfig {
  /** Metric identifier */
  id: string;
  /** Display label */
  label: string;
  /** Data source field or computed value */
  value: string | { source: DataSource; field: string; aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max' };
  /** Unit suffix */
  unit?: string;
  /** Icon */
  icon?: IconId;
  /** Color theme */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  /** Trend indicator */
  trend?: {
    field: string;
    positive: 'up' | 'down';
  };
  /** Feature flag */
  featureFlag?: FeatureFlag;
}

/**
 * Chart section - renders data visualizations
 */
export interface ChartSectionConfig extends BaseSectionConfig {
  type: 'chart';
  /** Chart type */
  chartType: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter';
  /** Data source */
  dataSource: DataSource;
  /** X-axis configuration */
  xAxis?: {
    field: string;
    label?: string;
    type?: 'category' | 'time' | 'linear';
  };
  /** Y-axis configuration */
  yAxis?: {
    field: string;
    label?: string;
  };
  /** Series configuration */
  series?: {
    field: string;
    label: string;
    color?: string;
  }[];
}

/**
 * Form section - renders input forms
 */
export interface FormSectionConfig extends BaseSectionConfig {
  type: 'form';
  /** Form fields */
  fields: FormFieldConfig[];
  /** Submit action */
  submitAction: ActionConfig;
  /** Validation rules */
  validation?: Record<string, ValidationRule[]>;
}

/**
 * Form field configuration
 */
export interface FormFieldConfig {
  /** Field name */
  name: string;
  /** Field label */
  label: string;
  /** Input type */
  type: 'text' | 'textarea' | 'number' | 'email' | 'password' | 'select' | 'multiSelect' | 'date' | 'checkbox' | 'switch' | 'file';
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  defaultValue?: unknown;
  /** Options for select fields */
  options?: { value: string; label: string }[];
  /** Required field */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Help text */
  helpText?: string;
  /** Grid sizing */
  grid?: GridConfig;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  type: 'required' | 'email' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: string | number;
  message: string;
}

/**
 * Custom section - renders custom content via render function
 */
export interface CustomSectionConfig extends BaseSectionConfig {
  type: 'custom';
  /** Render function identifier */
  renderer: string;
  /** Props to pass to renderer */
  props?: Record<string, unknown>;
}

/**
 * Union type for all section configurations
 */
export type SectionConfig =
  | ComponentSectionConfig
  | DataListSectionConfig
  | MetricsSectionConfig
  | ChartSectionConfig
  | FormSectionConfig
  | CustomSectionConfig;

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Action configuration for buttons and interactions
 */
export interface ActionConfig {
  /** Action identifier */
  id: string;
  /** Button label */
  label: string;
  /** Icon */
  icon?: IconId;
  /** Action type */
  type: 'api' | 'navigation' | 'modal' | 'download' | 'custom';
  /** API endpoint (for api type) */
  endpoint?: string;
  /** HTTP method */
  method?: HttpMethod;
  /** Navigation path (for navigation type) */
  path?: string;
  /** Modal configuration (for modal type) */
  modal?: {
    title: string;
    component: string;
    props?: Record<string, unknown>;
  };
  /** Button variant */
  variant?: 'contained' | 'outlined' | 'text';
  /** Button color */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  /** Feature flag */
  featureFlag?: FeatureFlag;
  /** Confirmation required */
  confirmMessage?: string;
  /** Success message */
  successMessage?: string;
  /** Refresh data after action */
  refreshData?: DataSource[];
}

// ============================================================================
// PAGE CONFIGURATION
// ============================================================================

/**
 * Complete dashboard page configuration
 */
export interface DashboardPageConfig {
  /** Unique page identifier */
  id: string;
  /** Page title */
  title: string;
  /** Page description */
  description?: string;
  /** Required role(s) to access */
  roles: UserRole[];
  /** Layout configuration */
  layout: LayoutConfig;
  /** Page sections */
  sections: SectionConfig[];
  /** Data requirements (fetched on page load) */
  dataRequirements: DataSource[];
  /** Page-level actions (header buttons) */
  actions?: ActionConfig[];
  /** Page-level feature flag */
  featureFlag?: FeatureFlag;
  /** Refresh interval in seconds (0 = no auto-refresh) */
  refreshInterval?: number;
  /** Meta information */
  meta?: {
    version: string;
    lastUpdated: string;
    author?: string;
  };
}

// ============================================================================
// REGISTRY TYPES
// ============================================================================

/**
 * Page configuration registry
 */
export interface PageConfigRegistry {
  [pageId: string]: DashboardPageConfig;
}

/**
 * Section renderer registry (maps section types to React components)
 */
export interface SectionRendererRegistry {
  component: Record<string, React.ComponentType<any>>;
  custom: Record<string, React.ComponentType<any>>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Page context provided to sections
 */
export interface PageContext {
  /** Current page configuration */
  config: DashboardPageConfig;
  /** Fetched data by source */
  data: Record<DataSource, unknown[]>;
  /** Loading states by source */
  loading: Record<DataSource, boolean>;
  /** Error states by source */
  errors: Record<DataSource, Error | null>;
  /** Feature flags */
  featureFlags: Record<FeatureFlag, boolean>;
  /** Current user */
  user: {
    id: string;
    name: string;
    email: string;
    roles: UserRole[];
  } | null;
  /** Refresh data function */
  refreshData: (source: DataSource) => Promise<void>;
  /** Execute action function */
  executeAction: (action: ActionConfig, data?: unknown) => Promise<void>;
}

/**
 * Section props passed by ConfigDrivenPage
 */
export interface SectionProps<T extends SectionConfig = SectionConfig> {
  /** Section configuration */
  config: T;
  /** Page context */
  context: PageContext;
}
