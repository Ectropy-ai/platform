/**
 * ConfigDrivenPage - Template-Driven Dashboard Renderer
 *
 * ENTERPRISE TEMPLATE-DRIVEN ARCHITECTURE (2026-01-23)
 *
 * Purpose: Render dashboard pages from declarative configuration objects.
 * Eliminates code duplication across role-based dashboards by providing
 * a single, reusable rendering engine.
 *
 * Features:
 * - Config-driven section rendering
 * - Feature flag integration
 * - Automatic data fetching
 * - Loading/error states
 * - Action handling
 *
 * @see apps/web-dashboard/src/config/types/page-config.types.ts
 * @see apps/web-dashboard/src/config/pages/
 */

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Skeleton,
  Alert,
  AlertTitle,
  CircularProgress,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  ViewInAr,
  Analytics,
  Upload,
  Assignment,
  Build,
  Engineering,
  Warning,
  People,
  Settings,
  Gavel,
  AccountBalance,
  Timeline,
  Inventory,
  CheckCircle,
  Schedule,
  AttachMoney,
  Description,
  Notifications,
  Security,
  Speed,
  Storage,
  Refresh as RefreshIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

import DashboardLayout from './DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../services/logger';
import { getFeatureFlags, isFeatureEnabled } from '../../config/features/feature-flags';
import { useDashboardData } from '../../hooks/queries';

import type {
  DashboardPageConfig,
  SectionConfig,
  DataSource,
  FeatureFlag,
  IconId,
  NavigationItemConfig,
  PageContext,
  ActionConfig,
  ComponentSectionConfig,
  DataListSectionConfig,
  MetricsSectionConfig,
} from '../../config/types/page-config.types';

// ============================================================================
// ICON MAPPING
// ============================================================================

/**
 * Map icon IDs to MUI icon components
 */
const ICON_MAP: Record<IconId, React.ElementType> = {
  Dashboard: DashboardIcon,
  ViewInAr,
  Analytics,
  Upload,
  Assignment,
  Build,
  Engineering,
  Warning,
  People,
  Settings,
  Gavel,
  AccountBalance,
  Timeline,
  Inventory,
  CheckCircle,
  Schedule,
  AttachMoney,
  Description,
  Notifications,
  Security,
  Speed,
  Storage,
};

/**
 * Get icon component by ID
 */
function getIcon(iconId: IconId): React.ReactNode {
  const Icon = ICON_MAP[iconId];
  return Icon ? <Icon /> : null;
}

// ============================================================================
// PAGE CONTEXT
// ============================================================================

const PageContextValue = createContext<PageContext | null>(null);

/**
 * Hook to access page context in sections
 */
export function usePageContext(): PageContext {
  const context = useContext(PageContextValue);
  if (!context) {
    throw new Error('usePageContext must be used within ConfigDrivenPage');
  }
  return context;
}

// ============================================================================
// DATA FETCHING - Now handled by React Query hooks via useDashboardData
// ============================================================================

// ============================================================================
// SECTION RENDERERS
// ============================================================================

/**
 * Render loading skeleton based on section type
 */
function SectionSkeleton({ config }: { config: SectionConfig }): React.ReactElement {
  const skeletonType = config.loading?.skeleton || 'card';
  const minHeight = config.minHeight || 200;

  switch (skeletonType) {
    case 'table':
      return (
        <Box>
          <Skeleton variant='rectangular' height={40} sx={{ mb: 1 }} />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant='rectangular' height={52} sx={{ mb: 0.5 }} />
          ))}
        </Box>
      );
    case 'chart':
      return <Skeleton variant='rectangular' height={minHeight} />;
    case 'viewer':
      return (
        <Box
          sx={{
            height: minHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.100',
            borderRadius: 1,
          }}
        >
          <CircularProgress />
        </Box>
      );
    case 'card':
    default:
      return <Skeleton variant='rectangular' height={minHeight} sx={{ borderRadius: 1 }} />;
  }
}

/**
 * Render component section
 */
function ComponentSection({
  config,
  context,
}: {
  config: ComponentSectionConfig;
  context: PageContext;
}): React.ReactElement {
  // Dynamic component registry - expand as needed
  const COMPONENT_REGISTRY: Record<string, React.ComponentType<any>> = {
    // These would be lazy-loaded in production
    // SpeckleBIMViewer: React.lazy(() => import('../BIMViewer/SpeckleBIMViewer')),
    // etc.
  };

  const Component = COMPONENT_REGISTRY[config.component];

  if (!Component) {
    return (
      <Paper sx={{ p: 3, minHeight: config.minHeight || 200 }}>
        <Alert severity='info'>
          <AlertTitle>Component: {config.component}</AlertTitle>
          This component will be rendered here. Component registration pending.
        </Alert>
      </Paper>
    );
  }

  return <Component {...config.props} context={context} />;
}

/**
 * Render data list section
 */
function DataListSection({
  config,
  context,
}: {
  config: DataListSectionConfig;
  context: PageContext;
}): React.ReactElement {
  const data = context.data[config.dataSource] || [];
  const loading = context.loading[config.dataSource];
  const error = context.errors[config.dataSource];

  if (loading) {
    return <SectionSkeleton config={config} />;
  }

  if (error) {
    return (
      <Alert severity='error'>
        <AlertTitle>Error loading {config.dataSource}</AlertTitle>
        {error.message}
      </Alert>
    );
  }

  if (data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color='text.secondary'>
          {config.emptyMessage || `No ${config.dataSource} found`}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      {config.title && (
        <Typography variant='h6' gutterBottom>
          {config.title}
        </Typography>
      )}
      <Box sx={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {config.columns.map(col => (
                <th
                  key={col.field}
                  style={{
                    textAlign: 'left',
                    padding: '12px 8px',
                    borderBottom: '2px solid #e0e0e0',
                    fontWeight: 600,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, idx) => (
              <tr key={row.id || idx} style={{ borderBottom: '1px solid #e0e0e0' }}>
                {config.columns.map(col => (
                  <td key={col.field} style={{ padding: '12px 8px' }}>
                    {formatCellValue(row[col.field], col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Paper>
  );
}

/**
 * Format cell value based on column type
 */
function formatCellValue(
  value: unknown,
  col: { type?: string; format?: string; statusColors?: Record<string, string> },
): React.ReactNode {
  if (value === null || value === undefined) {
    return '-';
  }

  switch (col.type) {
    case 'date':
      return new Date(value as string).toLocaleDateString();
    case 'currency':
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        value as number,
      );
    case 'status':
      const color = col.statusColors?.[value as string] || 'default';
      return (
        <Box
          component='span'
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: `${color}.light`,
            color: `${color}.dark`,
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          {String(value)}
        </Box>
      );
    case 'progress':
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 60, height: 6, bgcolor: 'grey.200', borderRadius: 3 }}>
            <Box
              sx={{
                width: `${Math.min(100, value as number)}%`,
                height: '100%',
                bgcolor: 'primary.main',
                borderRadius: 3,
              }}
            />
          </Box>
          <Typography variant='caption'>{String(value)}%</Typography>
        </Box>
      );
    default:
      return String(value);
  }
}

/**
 * Render metrics section
 */
function MetricsSection({
  config,
  context,
}: {
  config: MetricsSectionConfig;
  context: PageContext;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {config.metrics
        .filter(m => !m.featureFlag || context.featureFlags[m.featureFlag])
        .map(metric => {
          let value: string | number = '-';

          if (typeof metric.value === 'string') {
            value = metric.value;
          } else if (
            typeof metric.value === 'object' &&
            metric.value.source &&
            context.data[metric.value.source]
          ) {
            const data = context.data[metric.value.source] as any[];
            const valueConfig = metric.value;
            switch (valueConfig.aggregation) {
              case 'count':
                value = data.length;
                break;
              case 'sum':
                value = data.reduce((acc, item) => acc + (item[valueConfig.field] || 0), 0);
                break;
              case 'avg':
                value =
                  data.length > 0
                    ? data.reduce((acc, item) => acc + (item[valueConfig.field] || 0), 0) /
                      data.length
                    : 0;
                break;
              default:
                value = data.length;
            }
          }

          return (
            <Box
              key={metric.id}
              sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(25% - 12px)' } }}
            >
              <Paper
                sx={{
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  bgcolor: metric.color ? `${metric.color}.light` : 'background.paper',
                }}
              >
                {metric.icon && (
                  <Box
                    sx={{ color: metric.color ? `${metric.color}.main` : 'primary.main', mb: 1 }}
                  >
                    {getIcon(metric.icon)}
                  </Box>
                )}
                <Typography variant='h4' fontWeight='bold'>
                  {typeof value === 'number' ? value.toLocaleString() : value}
                  {metric.unit && (
                    <Typography
                      component='span'
                      variant='body2'
                      color='text.secondary'
                      sx={{ ml: 0.5 }}
                    >
                      {metric.unit}
                    </Typography>
                  )}
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  {metric.label}
                </Typography>
              </Paper>
            </Box>
          );
        })}
    </Box>
  );
}

/**
 * Main section renderer
 */
function SectionRenderer({
  config,
  context,
}: {
  config: SectionConfig;
  context: PageContext;
}): React.ReactElement | null {
  // Check feature flag
  if (config.featureFlag && !context.featureFlags[config.featureFlag]) {
    return null;
  }

  switch (config.type) {
    case 'component':
      return <ComponentSection config={config} context={context} />;
    case 'data-list':
      return <DataListSection config={config} context={context} />;
    case 'metrics':
      return <MetricsSection config={config} context={context} />;
    case 'chart':
      return (
        <Paper sx={{ p: 2, minHeight: config.minHeight || 300 }}>
          <Typography variant='h6'>{config.title || 'Chart'}</Typography>
          <Alert severity='info' sx={{ mt: 2 }}>
            Chart type: {config.chartType} - Visualization pending implementation
          </Alert>
        </Paper>
      );
    case 'form':
      return (
        <Paper sx={{ p: 2 }}>
          <Typography variant='h6'>{config.title || 'Form'}</Typography>
          <Alert severity='info' sx={{ mt: 2 }}>
            Form section pending implementation
          </Alert>
        </Paper>
      );
    case 'custom':
      return (
        <Paper sx={{ p: 2 }}>
          <Typography variant='h6'>{config.title || 'Custom Section'}</Typography>
          <Alert severity='info' sx={{ mt: 2 }}>
            Custom renderer: {config.renderer}
          </Alert>
        </Paper>
      );
    default:
      return <Alert severity='warning'>Unknown section type: {(config as any).type}</Alert>;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface ConfigDrivenPageProps {
  /** Page configuration */
  config: DashboardPageConfig;
  /** Override feature flags */
  featureFlagOverrides?: Partial<Record<FeatureFlag, boolean>>;
}

/**
 * ConfigDrivenPage - Renders a dashboard page from configuration
 *
 * Updated in Sprint 3 to use React Query via useDashboardData hook
 * for enterprise-grade caching, deduplication, and optimistic updates.
 */
export const ConfigDrivenPage: React.FC<ConfigDrivenPageProps> = ({
  config,
  featureFlagOverrides,
}) => {
  const { user } = useAuth();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Use React Query for data fetching (Sprint 3 integration)
  const { data, loading, errors, refetchAll } = useDashboardData(config.dataRequirements);

  // Merge feature flags
  const featureFlags = useMemo(() => {
    const base = getFeatureFlags();
    return { ...base, ...featureFlagOverrides };
  }, [featureFlagOverrides]);

  // Auto-refresh using React Query refetch
  useEffect(() => {
    if (config.refreshInterval && config.refreshInterval > 0) {
      const interval = setInterval(() => {
        refetchAll();
      }, config.refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [config.refreshInterval, refetchAll]);

  // Execute action
  const executeAction = useCallback(
    async (action: ActionConfig, actionData?: unknown) => {
      try {
        switch (action.type) {
          case 'api':
            if (action.endpoint && action.method) {
              const response = await fetch(action.endpoint, {
                method: action.method,
                headers: { 'Content-Type': 'application/json' },
                body: actionData ? JSON.stringify(actionData) : undefined,
              });
              if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
              }
              if (action.successMessage) {
                setSnackbar({ open: true, message: action.successMessage, severity: 'success' });
              }
              if (action.refreshData) {
                // Refetch all data - React Query will handle selective invalidation
                refetchAll();
              }
            }
            break;
          case 'navigation':
            if (action.path) {
              window.location.href = action.path;
            }
            break;
          default:
            logger.warn(`Action type not implemented: ${action.type}`);
        }
      } catch (error) {
        logger.error(`Action failed: ${action.id}`, { error });
        setSnackbar({
          open: true,
          message: `Action failed: ${(error as Error).message}`,
          severity: 'error',
        });
      }
    },
    [refetchAll],
  );

  // Build page context
  const pageContext: PageContext = useMemo(
    () => ({
      config,
      data,
      loading,
      errors,
      featureFlags,
      user: user
        ? {
            id: user.id,
            name: user.name || user.email,
            email: user.email,
            roles: user.roles as any[],
          }
        : null,
      refreshData: async () => {
        await refetchAll();
      },
      executeAction,
    }),
    [config, data, loading, errors, featureFlags, user, refetchAll, executeAction],
  );

  // Check page-level feature flag
  if (config.featureFlag && !featureFlags[config.featureFlag]) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity='info'>
          <AlertTitle>Feature Not Available</AlertTitle>
          This page requires the "{config.featureFlag}" feature to be enabled.
        </Alert>
      </Box>
    );
  }

  // Build navigation items for DashboardLayout
  const navigationItems = config.layout.sidebar.items
    .filter(item => !item.featureFlag || featureFlags[item.featureFlag])
    .map(item => ({
      id: item.id,
      label: item.label,
      icon: getIcon(item.icon),
      path: item.path,
      onClick: () => {
        window.location.href = item.path;
      },
    }));

  return (
    <PageContextValue.Provider value={pageContext}>
      <DashboardLayout
        title={config.title}
        navigationItems={navigationItems}
        user={user ? { name: user.name || user.email, email: user.email } : undefined}
        headerActions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title='Refresh'>
              <IconButton onClick={() => refetchAll()} size='small'>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            {config.actions?.map(action => (
              <Button
                key={action.id}
                variant={action.variant || 'outlined'}
                color={action.color || 'primary'}
                size='small'
                startIcon={action.icon ? getIcon(action.icon) : undefined}
                onClick={() => executeAction(action)}
                disabled={action.featureFlag ? !featureFlags[action.featureFlag] : false}
              >
                {action.label}
              </Button>
            ))}
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {config.sections
            .filter(section => !section.featureFlag || featureFlags[section.featureFlag])
            .map(section => {
              // Calculate width based on grid config (approximate responsive layout)
              const getWidth = () => {
                const md = section.grid.md ?? section.grid.xs ?? 12;
                return `calc(${(Number(md) / 12) * 100}% - 24px)`;
              };
              return (
                <Box
                  key={section.id}
                  sx={{
                    width: { xs: '100%', md: getWidth() },
                    minWidth: 0,
                  }}
                >
                  <SectionRenderer config={section} context={pageContext} />
                </Box>
              );
            })}
        </Box>
      </DashboardLayout>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </PageContextValue.Provider>
  );
};

export default ConfigDrivenPage;
