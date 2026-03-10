/**
 * ==============================================================================
 * CONSOLE DASHBOARD PAGE
 * ==============================================================================
 * Overview dashboard with key metrics, tenant counts, and system health.
 * Uses real data from backend APIs - no placeholder data.
 * ==============================================================================
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Button,
  Skeleton,
} from '@mui/material';
import {
  Business,
  People,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  TrendingUp,
  Speed,
  PersonAdd,
} from '@mui/icons-material';

import { consoleApi } from '../services/console-api';
import type { SystemHealthResponse, UserListResponse } from '../types/console.types';

// ==============================================================================
// Stat Card Component
// ==============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  loading?: boolean;
  error?: boolean;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading,
  error,
  onClick,
}) => (
  <Card
    sx={{
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': onClick
        ? {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3)',
          }
        : {},
    }}
    onClick={onClick}
  >
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          {loading ? (
            <Skeleton variant="text" width={80} height={40} />
          ) : error ? (
            <Typography variant="h4" color="error.main">
              --
            </Typography>
          ) : (
            <Typography variant="h4" fontWeight={600}>
              {value}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            p: 1,
            borderRadius: 1,
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
      </Box>
      {trend && !loading && !error && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
          <TrendingUp
            sx={{
              fontSize: 16,
              color: trend.value >= 0 ? 'success.main' : 'error.main',
            }}
          />
          <Typography
            variant="caption"
            color={trend.value >= 0 ? 'success.main' : 'error.main'}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
);

// ==============================================================================
// Health Status Component
// ==============================================================================

interface HealthStatusProps {
  health: SystemHealthResponse | undefined;
  loading: boolean;
  error: boolean;
}

const HealthStatus: React.FC<HealthStatusProps> = ({ health, loading, error }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'degraded':
        return 'warning';
      case 'critical':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle fontSize="small" />;
      case 'degraded':
        return <Warning fontSize="small" />;
      case 'critical':
        return <ErrorIcon fontSize="small" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Health
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Health
          </Typography>
          <Alert severity="error">Unable to fetch system health</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">System Health</Typography>
          <Chip
            label={health.overall.toUpperCase()}
            color={getStatusColor(health.overall) as 'success' | 'warning' | 'error' | 'default'}
            size="small"
          />
        </Box>

        {/* Services */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Services
          </Typography>
          <Grid container spacing={1}>
            {Object.entries(health.services).map(([name, service]) => (
              <Grid item xs={6} key={name}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    borderRadius: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {getStatusIcon(service.status)}
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                    {name.replace(/([A-Z])/g, ' $1').trim()}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Metrics */}
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Metrics
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">CPU</Typography>
                <Typography variant="caption">{health.metrics.cpuUsagePercent}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={health.metrics.cpuUsagePercent}
                color={health.metrics.cpuUsagePercent > 80 ? 'error' : 'primary'}
              />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">Memory</Typography>
                <Typography variant="caption">{health.metrics.memoryUsagePercent}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={health.metrics.memoryUsagePercent}
                color={health.metrics.memoryUsagePercent > 80 ? 'error' : 'primary'}
              />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption">Disk</Typography>
                <Typography variant="caption">{health.metrics.diskUsagePercent}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={health.metrics.diskUsagePercent}
                color={health.metrics.diskUsagePercent > 80 ? 'error' : 'primary'}
              />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Pending Users Component
// ==============================================================================

interface PendingUsersProps {
  users: UserListResponse | undefined;
  loading: boolean;
  error: boolean;
  onViewAll: () => void;
}

const PendingUsers: React.FC<PendingUsersProps> = ({ users, loading, error, onViewAll }) => {
  const pendingUsers = users?.users.filter((u) => !u.isAuthorized) || [];

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Pending Authorization</Typography>
          {pendingUsers.length > 0 && (
            <Chip label={pendingUsers.length} color="warning" size="small" />
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            Unable to fetch users
          </Alert>
        ) : pendingUsers.length === 0 ? (
          <Alert severity="success" icon={<CheckCircle />}>
            No users pending authorization
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {pendingUsers.slice(0, 5).map((user) => (
              <Box
                key={user.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1.5,
                  borderRadius: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                }}
              >
                <PersonAdd fontSize="small" color="warning" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {user.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.tenant?.name || 'No tenant'}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 2 }}
          onClick={onViewAll}
        >
          {pendingUsers.length > 5
            ? `View All (${pendingUsers.length})`
            : 'Manage Users'}
        </Button>
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Dashboard Page
// ==============================================================================

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Fetch tenants
  const tenantsQuery = useQuery({
    queryKey: ['console', 'tenants', 'summary'],
    queryFn: () => consoleApi.getTenants({ limit: 100 }),
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch users
  const usersQuery = useQuery({
    queryKey: ['console', 'users', 'summary'],
    queryFn: () => consoleApi.getUsers({ limit: 100 }),
    refetchInterval: 60000,
  });

  // Fetch system health
  const healthQuery = useQuery({
    queryKey: ['console', 'health'],
    queryFn: () => consoleApi.getSystemHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const tenants = tenantsQuery.data?.data;
  const users = usersQuery.data?.data;
  const health = healthQuery.data?.data;

  // Calculate stats
  const activeTenants = tenants?.tenants.filter((t) => t.status === 'ACTIVE').length || 0;
  const trialTenants = tenants?.tenants.filter((t) => t.status === 'TRIAL').length || 0;
  const authorizedUsers = users?.users.filter((u) => u.isAuthorized).length || 0;
  const pendingUsers = users?.users.filter((u) => !u.isAuthorized).length || 0;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={600} gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Platform overview and key metrics
        </Typography>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Tenants"
            value={tenants?.pagination.total ?? '--'}
            subtitle={`${activeTenants} active, ${trialTenants} trial`}
            icon={<Business />}
            loading={tenantsQuery.isLoading}
            error={tenantsQuery.isError}
            onClick={() => navigate('/tenants')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Users"
            value={users?.pagination.total ?? '--'}
            subtitle={`${authorizedUsers} authorized`}
            icon={<People />}
            loading={usersQuery.isLoading}
            error={usersQuery.isError}
            onClick={() => navigate('/users')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending Authorization"
            value={pendingUsers}
            subtitle="Users awaiting approval"
            icon={<PersonAdd />}
            loading={usersQuery.isLoading}
            error={usersQuery.isError}
            onClick={() => navigate('/users?filter=pending')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Requests/min"
            value={health?.metrics.requestsPerMinute ?? '--'}
            subtitle={`${health?.metrics.errorRate ?? '--'}% error rate`}
            icon={<Speed />}
            loading={healthQuery.isLoading}
            error={healthQuery.isError}
            onClick={() => navigate('/monitoring')}
          />
        </Grid>
      </Grid>

      {/* Health and Pending Users */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <HealthStatus
            health={health}
            loading={healthQuery.isLoading}
            error={healthQuery.isError}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <PendingUsers
            users={users}
            loading={usersQuery.isLoading}
            error={usersQuery.isError}
            onViewAll={() => navigate('/users')}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
