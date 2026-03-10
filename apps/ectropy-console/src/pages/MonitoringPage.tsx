/**
 * ==============================================================================
 * MONITORING PAGE
 * ==============================================================================
 * System monitoring page with Grafana embeds and native metrics.
 * Hybrid approach: Embed Grafana for complex visualizations, native for key metrics.
 * ==============================================================================
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Button,
  Tabs,
  Tab,
  Link,
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  OpenInNew,
  Refresh,
  Speed,
  Memory,
  Storage,
  NetworkCheck,
} from '@mui/icons-material';

import { consoleApi } from '../services/console-api';
import type { HealthStatus } from '../types/console.types';

// ==============================================================================
// Health Status Display
// ==============================================================================

const getStatusConfig = (status: HealthStatus) => {
  switch (status) {
    case 'healthy':
      return { color: 'success' as const, icon: <CheckCircle />, label: 'Healthy' };
    case 'degraded':
      return { color: 'warning' as const, icon: <Warning />, label: 'Degraded' };
    case 'critical':
      return { color: 'error' as const, icon: <ErrorIcon />, label: 'Critical' };
    default:
      return { color: 'default' as const, icon: null, label: 'Unknown' };
  }
};

// ==============================================================================
// Service Health Card
// ==============================================================================

interface ServiceCardProps {
  name: string;
  status: HealthStatus;
  responseTimeMs: number | null;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ name, status, responseTimeMs }) => {
  const config = getStatusConfig(status);

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="body1" fontWeight={500} sx={{ textTransform: 'capitalize' }}>
            {name.replace(/([A-Z])/g, ' $1').trim()}
          </Typography>
          <Chip
            label={config.label}
            color={config.color}
            size="small"
          />
        </Box>
        {responseTimeMs !== null && (
          <Typography variant="caption" color="text.secondary">
            Response time: {responseTimeMs}ms
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Metrics Card
// ==============================================================================

interface MetricsCardProps {
  title: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  threshold?: { warning: number; critical: number };
}

const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit,
  icon,
  threshold,
}) => {
  let color: 'primary' | 'warning' | 'error' = 'primary';
  if (threshold) {
    if (value >= threshold.critical) color = 'error';
    else if (value >= threshold.warning) color = 'warning';
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={600} color={`${color}.main`}>
              {value}
              <Typography component="span" variant="body2" color="text.secondary">
                {unit}
              </Typography>
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              backgroundColor: `${color}.main`,
              color: `${color}.contrastText`,
              opacity: 0.8,
            }}
          >
            {icon}
          </Box>
        </Box>
        {threshold && (
          <LinearProgress
            variant="determinate"
            value={Math.min(value, 100)}
            color={color}
          />
        )}
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Grafana Embed Component
// ==============================================================================

interface GrafanaEmbedProps {
  dashboardUrl: string;
  title: string;
}

const GrafanaEmbed: React.FC<GrafanaEmbedProps> = ({ dashboardUrl, title }) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{title}</Typography>
          <Link
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            Open in Grafana
            <OpenInNew fontSize="small" />
          </Link>
        </Box>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: 400,
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: 'background.default',
          }}
        >
          {loading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <CircularProgress />
            </Box>
          )}
          {error ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 2,
              }}
            >
              <Alert severity="warning">
                Unable to load Grafana dashboard. Ensure Grafana is configured for embedding.
              </Alert>
              <Button
                variant="outlined"
                href={dashboardUrl}
                target="_blank"
                startIcon={<OpenInNew />}
              >
                Open in Grafana
              </Button>
            </Box>
          ) : (
            <iframe
              src={`${dashboardUrl}&kiosk`}
              width="100%"
              height="100%"
              frameBorder="0"
              title={title}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              style={{ border: 'none' }}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Monitoring Page
// ==============================================================================

const MonitoringPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState(0);

  // Fetch system health
  const healthQuery = useQuery({
    queryKey: ['console', 'health'],
    queryFn: () => consoleApi.getSystemHealth(),
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  const health = healthQuery.data?.data;
  const overallConfig = health ? getStatusConfig(health.overall) : null;

  // Grafana dashboard URLs - configurable via environment variable
  // Set VITE_GRAFANA_BASE_URL in .env (e.g., https://grafana.ectropy.ai or /grafana)
  const grafanaBaseUrl = import.meta.env.VITE_GRAFANA_BASE_URL || '/grafana';
  const grafanaDashboards = [
    {
      url: `${grafanaBaseUrl}/d/api-gateway/api-gateway-metrics`,
      title: 'API Gateway Metrics',
    },
    {
      url: `${grafanaBaseUrl}/d/mcp-server/mcp-server-metrics`,
      title: 'MCP Server Metrics',
    },
    {
      url: `${grafanaBaseUrl}/d/enterprise-health/enterprise-health`,
      title: 'Enterprise Health Overview',
    },
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Monitoring
          </Typography>
          <Typography variant="body1" color="text.secondary">
            System health and performance metrics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {health && overallConfig && (
            <Chip
              label={`System: ${overallConfig.label}`}
              color={overallConfig.color}
            />
          )}
          <Button
            variant="outlined"
            startIcon={healthQuery.isFetching ? <CircularProgress size={16} /> : <Refresh />}
            onClick={() => healthQuery.refetch()}
            disabled={healthQuery.isFetching}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Overview" />
          <Tab label="Grafana Dashboards" />
        </Tabs>
      </Box>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Box>
          {healthQuery.isError ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              Failed to fetch system health. Please check the API connection.
            </Alert>
          ) : healthQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : health ? (
            <>
              {/* Key Metrics */}
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                System Metrics
              </Typography>
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricsCard
                    title="CPU Usage"
                    value={health.metrics.cpuUsagePercent}
                    unit="%"
                    icon={<Speed />}
                    threshold={{ warning: 70, critical: 90 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricsCard
                    title="Memory Usage"
                    value={health.metrics.memoryUsagePercent}
                    unit="%"
                    icon={<Memory />}
                    threshold={{ warning: 80, critical: 95 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricsCard
                    title="Disk Usage"
                    value={health.metrics.diskUsagePercent}
                    unit="%"
                    icon={<Storage />}
                    threshold={{ warning: 80, critical: 90 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <MetricsCard
                    title="Requests/min"
                    value={health.metrics.requestsPerMinute}
                    unit=""
                    icon={<NetworkCheck />}
                  />
                </Grid>
              </Grid>

              {/* Service Health */}
              <Typography variant="h6" gutterBottom>
                Service Health
              </Typography>
              <Grid container spacing={3}>
                {Object.entries(health.services).map(([name, service]) => (
                  <Grid item xs={12} sm={6} md={4} key={name}>
                    <ServiceCard
                      name={name}
                      status={service.status}
                      responseTimeMs={service.responseTimeMs}
                    />
                  </Grid>
                ))}
              </Grid>

              {/* Alerts Summary */}
              <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
                Alert Summary
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ backgroundColor: 'rgba(244, 67, 54, 0.1)' }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="error.main" fontWeight={600}>
                        {health.alerts.critical}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Critical Alerts
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ backgroundColor: 'rgba(255, 152, 0, 0.1)' }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="warning.main" fontWeight={600}>
                        {health.alerts.warning}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Warning Alerts
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Card sx={{ backgroundColor: 'rgba(41, 182, 246, 0.1)' }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h3" color="info.main" fontWeight={600}>
                        {health.alerts.info}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Info Alerts
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          ) : null}
        </Box>
      )}

      {/* Grafana Dashboards Tab */}
      {activeTab === 1 && (
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            Grafana dashboards require proper embedding configuration. If dashboards don't load,
            click "Open in Grafana" to view in a new tab.
          </Alert>
          <Grid container spacing={3}>
            {grafanaDashboards.map((dashboard) => (
              <Grid item xs={12} key={dashboard.url}>
                <GrafanaEmbed dashboardUrl={dashboard.url} title={dashboard.title} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default MonitoringPage;
