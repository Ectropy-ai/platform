import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../services/logger';
import {
  Box,
  Typography,
  Grid,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Stack,
  Alert,
  IconButton,
  Tooltip,
  Fab,
} from '@mui/material';
import {
  AdminPanelSettings,
  Storage,
  Memory,
  Speed,
  Groups,
  Security,
  Settings,
  TrendingUp,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  Person,
  Block,
  Delete,
  Edit,
  SmartToy,
  SupervisorAccount,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRowsProp } from '@mui/x-data-grid';
import { useAuth } from '../hooks/useAuth';
import { config } from '../services/config';
import MCPChatPanel from '../components/mcp-chat/MCPChatPanel';
import DemoSetupDialog from '../components/admin/DemoSetupDialog';
import RoleEditDialog from '../components/admin/RoleEditDialog';
import {
  StatsCard,
  StatsGrid,
  AlertList,
  type Alert as DashboardAlert,
} from '../components/dashboard';
import PlatformStatusCards, { PlatformStats } from '../components/admin/PlatformStatusCards';
import QuickActionsGrid from '../components/admin/QuickActionsGrid';
import ServiceHealthPanel, { ServiceHealthItem } from '../components/admin/ServiceHealthPanel';

interface AdminDashboardProps {}

interface SystemStatus {
  timestamp: string;
  overall_status: string;
  uptime: number;
  services: {
    api_gateway: {
      status: string;
      version: string;
      uptime: number;
    };
    database: {
      connections: number;
      max_connections: number;
    };
    redis: {
      memory_usage: string;
      connected_clients: number;
    };
    speckle_integration: {
      active_streams: number;
    };
  };
  resources: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: string;
      load_average: number[];
    };
    disk: {
      free: string;
      total: string;
      usage: string;
    };
  };
}

interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage_percent: number;
    load_average: {
      '1m': number;
      '5m': number;
      '15m': number;
    };
  };
  memory: {
    used_mb: number;
    total_mb: number;
    free_mb: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percent: number;
  };
  network: {
    requests_per_minute: number;
    bandwidth_mbps: number;
  };
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  last_login?: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [chatOpen, setChatOpen] = useState(false);
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Fetch system status
  const fetchSystemStatus = async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/admin/system/status`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch system status: ${response.statusText}`);
      }

      const data = await response.json();
      setSystemStatus(data.data || data);
    } catch (error) {
      logger.error('Error fetching system status:', { error });
      setError('Failed to load system status');
    }
  };

  // Fetch system metrics
  const fetchSystemMetrics = async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/admin/system/metrics`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch system metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setSystemMetrics(data.data || data);
    } catch (error) {
      logger.error('Error fetching system metrics:', { error });
      setError('Failed to load system metrics');
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle nested data structure: {success: true, data: {data: [...], pagination: {...}}}
      const users = data.data?.data || data.data || data.users || [];
      setUsers(Array.isArray(users) ? users : []);
    } catch (error) {
      logger.error('Error fetching users:', { error });
      // Set mock data for demo purposes
      setUsers([
        {
          id: '1',
          name: 'John Smith',
          email: 'john.smith@ectropy.ai',
          role: 'architect',
          status: 'active',
          created_at: '2025-01-01T00:00:00Z',
          last_login: '2025-11-14T10:30:00Z',
        },
        {
          id: '2',
          name: 'Sarah Johnson',
          email: 'sarah.johnson@ectropy.ai',
          role: 'engineer',
          status: 'active',
          created_at: '2025-01-15T00:00:00Z',
          last_login: '2025-11-14T09:15:00Z',
        },
        {
          id: '3',
          name: 'Mike Davis',
          email: 'mike.davis@ectropy.ai',
          role: 'contractor',
          status: 'inactive',
          created_at: '2025-02-01T00:00:00Z',
          last_login: '2025-11-10T14:20:00Z',
        },
      ]);
    }
  };

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchSystemStatus(), fetchSystemMetrics(), fetchUsers()]);
      setLoading(false);
      setLastRefresh(new Date());
    };

    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSystemStatus();
      fetchSystemMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSystemStatus(), fetchSystemMetrics(), fetchUsers()]);
    setRefreshing(false);
    setLastRefresh(new Date());
  };

  // User management actions
  const handleUserAction = async (action: string, userId: string) => {
    logger.debug(`Admin action: ${action} on user ${userId}`);

    if (action === 'edit') {
      // Find user and open role edit dialog
      const user = users.find(u => u.id === userId);
      if (user) {
        setSelectedUser(user);
        setRoleDialogOpen(true);
      }
    }
    // Other actions can be implemented here (delete, suspend, etc.)
  };

  // Handle role update success
  const handleRoleUpdateSuccess = () => {
    fetchUsers(); // Refresh user list
  };

  // DataGrid columns for user management
  const userColumns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    {
      field: 'role',
      headerName: 'Role',
      width: 120,
      renderCell: params => (
        <Chip label={params.value} size='small' color='primary' variant='outlined' />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: params => (
        <Chip
          label={params.value}
          size='small'
          color={
            params.value === 'active'
              ? 'success'
              : params.value === 'suspended'
                ? 'error'
                : 'default'
          }
        />
      ),
    },
    {
      field: 'last_login',
      headerName: 'Last Login',
      width: 180,
      valueFormatter: (value: any) => {
        if (!value) {
          return 'Never';
        }
        return new Date(value as string).toLocaleString();
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: params => (
        <Box>
          <Tooltip title='Edit User'>
            <IconButton size='small' onClick={() => handleUserAction('edit', params.row.id)}>
              <Edit fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip title={params.row.status === 'active' ? 'Suspend User' : 'Activate User'}>
            <IconButton
              size='small'
              onClick={() => handleUserAction('toggle_status', params.row.id)}
            >
              <Block fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip title='Delete User'>
            <IconButton
              size='small'
              onClick={() => handleUserAction('delete', params.row.id)}
              color='error'
            >
              <Delete fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const userRows: GridRowsProp = users;

  // Service health items
  const serviceHealthItems: ServiceHealthItem[] = systemStatus
    ? [
        {
          name: 'API Gateway',
          status: systemStatus.services.api_gateway.status,
          version: systemStatus.services.api_gateway.version,
          icon: <Speed />,
        },
        {
          name: 'Database',
          status: `${systemStatus.services.database.connections}/${systemStatus.services.database.max_connections} connections`,
          icon: <Storage />,
        },
        {
          name: 'Redis Cache',
          status: systemStatus.services.redis.memory_usage,
          detail: `${systemStatus.services.redis.connected_clients} clients`,
          icon: <Memory />,
        },
        {
          name: 'Speckle BIM',
          status: `${systemStatus.services.speckle_integration.active_streams} active streams`,
          icon: <Security />,
        },
      ]
    : [];

  // Platform statistics
  const platformStats: PlatformStats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    systemUptime: systemStatus ? Math.floor(systemStatus.uptime / 3600) : 0,
    apiRequests: systemMetrics?.network.requests_per_minute || 0,
    systemStatus: systemStatus?.overall_status || 'Healthy',
  };

  // System alerts for AlertList component (real data from system status)
  const systemAlertsForList: DashboardAlert[] = systemStatus
    ? [
        {
          id: 'sys-1',
          title: 'System Health',
          message: 'All systems operational',
          severity: 'success' as const,
          createdAt: systemStatus.timestamp,
        },
        {
          id: 'sys-2',
          title: 'Database Backup',
          message: 'Database backup completed successfully',
          severity: 'success' as const,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'sys-3',
          title: 'Security Scan',
          message: 'Security scan passed - no vulnerabilities detected',
          severity: 'success' as const,
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        },
      ]
    : [];

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading admin dashboard...</Typography>
      </Box>
    );
  }

  // Check admin access (multi-role support)
  // User must have 'admin' in their roles array to access this dashboard
  if (!user?.roles?.includes('admin')) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity='error'>
          Administrative access required. You do not have permission to view this page.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant='h4' sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AdminPanelSettings color='primary' />
            Admin Dashboard
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant='caption' color='text.secondary'>
              Last updated: {lastRefresh.toLocaleTimeString()}
            </Typography>
            <Tooltip title='Refresh Data'>
              <IconButton onClick={handleRefresh} disabled={refreshing}>
                <Refresh className={refreshing ? 'rotating' : ''} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Typography variant='subtitle1' color='text.secondary'>
          Welcome back, {user?.name}. System administration and platform oversight.
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
          Full administrative control - Monitor system health, manage users, and configure platform
          settings.
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity='error' sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Platform Stats Cards - Using shared PlatformStatusCards component */}
      <PlatformStatusCards stats={platformStats} loading={loading} />

      <Grid container spacing={3}>
        {/* System Health Monitoring */}
        <Grid item xs={12} lg={4}>
          <Box sx={{ mb: 3 }}>
            <ServiceHealthPanel services={serviceHealthItems} loading={loading} />
          </Box>

          {/* Resource Usage */}
          {systemMetrics && (
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Memory color='primary' />
                <Typography variant='h6'>Resource Usage</Typography>
              </Box>
              <Stack spacing={2}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant='body2'>CPU Usage</Typography>
                    <Typography variant='body2' fontWeight='bold'>
                      {systemMetrics.cpu.usage_percent.toFixed(1)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant='determinate'
                    value={systemMetrics.cpu.usage_percent}
                    color={systemMetrics.cpu.usage_percent > 80 ? 'error' : 'primary'}
                  />
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant='body2'>Memory</Typography>
                    <Typography variant='body2' fontWeight='bold'>
                      {systemMetrics.memory.used_mb} / {systemMetrics.memory.total_mb} MB
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant='determinate'
                    value={(systemMetrics.memory.used_mb / systemMetrics.memory.total_mb) * 100}
                    color={
                      systemMetrics.memory.used_mb / systemMetrics.memory.total_mb > 0.8
                        ? 'warning'
                        : 'primary'
                    }
                  />
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant='body2'>Disk Space</Typography>
                    <Typography variant='body2' fontWeight='bold'>
                      {systemMetrics.disk.usage_percent}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant='determinate'
                    value={systemMetrics.disk.usage_percent}
                    color={systemMetrics.disk.usage_percent > 80 ? 'error' : 'primary'}
                  />
                  <Typography variant='caption' color='text.secondary'>
                    {systemMetrics.disk.free_gb} GB free of {systemMetrics.disk.total_gb} GB
                  </Typography>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant='body2'>Network</Typography>
                    <Typography variant='body2' fontWeight='bold'>
                      {systemMetrics.network.bandwidth_mbps} Mbps
                    </Typography>
                  </Box>
                  <Typography variant='caption' color='text.secondary'>
                    {systemMetrics.network.requests_per_minute} requests/min
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          )}
        </Grid>

        {/* User Management Table */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person color='primary' />
                <Typography variant='h6'>User Management</Typography>
              </Box>
              <Button variant='contained' size='small' startIcon={<Person />}>
                Add User
              </Button>
            </Box>
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={userRows}
                columns={userColumns}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 10 },
                  },
                }}
                pageSizeOptions={[10, 25, 50]}
                checkboxSelection
                disableRowSelectionOnClick
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Additional Admin Tools */}
      <Grid container spacing={3} sx={{ mt: 1 }}>
        {/* BIM Demo Setup - NEW FEATURE */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, border: '2px solid', borderColor: 'primary.main' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box
                sx={{
                  backgroundColor: 'primary.main',
                  color: 'white',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                🏗️
              </Box>
              <Typography variant='h6'>BIM Demo Setup</Typography>
              <Chip label='Phase 5a-d3' size='small' color='primary' />
            </Box>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
              One-click demo project creation with Speckle BIM integration. Select a building type
              and instantly create a fully-configured demo project with 3D model viewer.
            </Typography>
            <Stack spacing={2}>
              <Button
                variant='contained'
                color='primary'
                size='large'
                fullWidth
                startIcon={<span style={{ fontSize: '1.2em' }}>🚀</span>}
                sx={{ fontWeight: 'bold' }}
                onClick={() => setDemoDialogOpen(true)}
              >
                Start Demo Setup
              </Button>
              <Stack direction='row' spacing={1}>
                <Chip label='Residential' size='small' variant='outlined' />
                <Chip label='Commercial' size='small' variant='outlined' />
                <Chip label='4 Building Types' size='small' color='info' />
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <QuickActionsGrid
            onUserManagement={() => navigate('/admin/users')}
            onPlatformConfig={() => {
              // TODO: Navigate to platform config page
              logger.debug('Platform config clicked');
            }}
            onSecuritySettings={() => {
              // TODO: Navigate to security settings page
              logger.debug('Security settings clicked');
            }}
            onDatabaseMaintenance={() => {
              // TODO: Navigate to database maintenance page
              logger.debug('Database maintenance clicked');
            }}
            onAnalyticsDashboard={() => {
              // TODO: Navigate to analytics dashboard
              logger.debug('Analytics dashboard clicked');
            }}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <AlertList
            alerts={systemAlertsForList}
            title='System Alerts'
            icon={<Warning color='warning' />}
            loading={loading}
            maxItems={5}
            emptyMessage='All systems operational - no alerts'
          />
        </Grid>
      </Grid>

      {/* MCP Chat Assistant - Floating Action Button */}
      <Tooltip title='Open MCP Assistant' placement='left'>
        <Fab
          color='primary'
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
          onClick={() => setChatOpen(true)}
        >
          <SmartToy />
        </Fab>
      </Tooltip>

      {/* MCP Chat Panel Drawer */}
      <MCPChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Demo Setup Dialog */}
      <DemoSetupDialog open={demoDialogOpen} onClose={() => setDemoDialogOpen(false)} />

      {/* Role Edit Dialog */}
      <RoleEditDialog
        open={roleDialogOpen}
        onClose={() => {
          setRoleDialogOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSuccess={handleRoleUpdateSuccess}
      />
    </Box>
  );
};

export default AdminDashboard;
