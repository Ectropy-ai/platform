/**
 * Platform Dashboard (Tier 0) - Landing page for all authenticated users
 *
 * Phase: 2 - Tier 0 Platform Dashboard
 * Roadmap: .roadmap/phase-1-user-provisioning.md
 *
 * Tiered Dashboard Architecture:
 * - Tier 0: Platform Dashboard (no projects) - THIS FILE
 * - Tier 1: Projects List (has projects, none selected)
 * - Tier 2: Project Workspace (project opened)
 *
 * Purpose: Eliminate dead screens by showing contextually relevant landing page
 * - @luh.tech admins see: platform status + user mgmt + demo CTA + quick actions
 * - Non-admins see: welcome + demo CTA + account info
 * - NO BIM viewer (only shown in Tier 2 when project opened)
 * - NO element counts, budget widgets (only in Tier 2 project context)
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Paper, Container, Stack, Chip, Grid } from '@mui/material';
import { BusinessCenter, ViewInAr, Add } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { config } from '../services/config';
import { logger } from '../services/logger';
import DemoSetupDialog from '../components/admin/DemoSetupDialog';
import PlatformStatusCards, { PlatformStats } from '../components/admin/PlatformStatusCards';
import QuickActionsGrid from '../components/admin/QuickActionsGrid';
import ServiceHealthPanel, { ServiceHealthItem } from '../components/admin/ServiceHealthPanel';
import { UsageWidget } from '../components/dashboard';

interface PlatformDashboardProps {}

/**
 * Platform Dashboard Component
 *
 * Renders different views based on user type:
 * - Platform Admins (@luh.tech): Full platform oversight + user management
 * - Regular Users: Welcome + demo CTA + account info
 */
const PlatformDashboard: React.FC<PlatformDashboardProps> = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    totalUsers: 0,
    activeUsers: 0,
    systemUptime: 0,
    apiRequests: 0,
    systemStatus: 'Loading...',
  });
  const [serviceHealth, setServiceHealth] = useState<ServiceHealthItem[]>([]);

  // Check if user is platform admin (from Phase 1 backend)
  const isPlatformAdmin = user?.is_platform_admin || false;

  // Fetch platform data for admins
  useEffect(() => {
    if (!isPlatformAdmin) {
      setLoading(false);
      return;
    }

    const fetchPlatformData = async () => {
      try {
        // Fetch system status
        const statusResponse = await fetch(`${config.apiBaseUrl}/api/admin/system/status`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const data = statusData.data || statusData;

          // Update platform stats
          setPlatformStats({
            totalUsers: 0, // TODO: Add user count from API
            activeUsers: 0,
            systemUptime: data.uptime ? Math.floor(data.uptime / 3600) : 0,
            apiRequests: 0, // Will be updated from metrics
            systemStatus: data.overall_status || 'Healthy',
          });

          // Update service health
          if (data.services) {
            setServiceHealth([
              {
                name: 'API Gateway',
                status: data.services.api_gateway?.status || 'unknown',
                version: data.services.api_gateway?.version,
              },
              {
                name: 'Database',
                status: `${data.services.database?.connections || 0}/${data.services.database?.max_connections || 0} connections`,
              },
              {
                name: 'Redis Cache',
                status: data.services.redis?.memory_usage || 'unknown',
                detail: `${data.services.redis?.connected_clients || 0} clients`,
              },
              {
                name: 'Speckle BIM',
                status: `${data.services.speckle_integration?.active_streams || 0} active streams`,
              },
            ]);
          }
        }

        // Fetch system metrics for API requests
        const metricsResponse = await fetch(`${config.apiBaseUrl}/api/admin/system/metrics`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          const data = metricsData.data || metricsData;

          setPlatformStats(prev => ({
            ...prev,
            apiRequests: data.network?.requests_per_minute || 0,
          }));
        }
      } catch (error) {
        logger.error('Failed to fetch platform data', error as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlatformData();
  }, [isPlatformAdmin]);

  if (!user) {
    return null;
  }

  return (
    <Container maxWidth='xl' sx={{ py: 4 }}>
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant='h3' gutterBottom>
          Welcome back, {user.firstName || user.name}
        </Typography>
        <Typography variant='body1' color='text.secondary'>
          {isPlatformAdmin
            ? 'Platform Administrator - Full system access and oversight'
            : 'Ectropy Platform - Construction collaboration made simple'}
        </Typography>
      </Box>

      {/* Primary Actions */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant='h5' gutterBottom>
          Get Started
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <Button
            variant='contained'
            size='large'
            startIcon={<Add />}
            onClick={() => setDemoDialogOpen(true)}
            sx={{ flex: 1 }}
          >
            Create Demo Project
          </Button>
          <Button
            variant='outlined'
            size='large'
            startIcon={<BusinessCenter />}
            onClick={() => navigate('/projects')}
            sx={{ flex: 1 }}
          >
            View All Projects
          </Button>
          <Button
            variant='outlined'
            size='large'
            startIcon={<ViewInAr />}
            onClick={() => navigate('/viewer')}
            sx={{ flex: 1 }}
          >
            BIM Viewer
          </Button>
        </Stack>
      </Paper>

      {/* Platform Admin Section */}
      {isPlatformAdmin && (
        <Box sx={{ mb: 3 }}>
          <Typography variant='h5' gutterBottom sx={{ mb: 2 }}>
            Platform Administration
          </Typography>

          {/* Platform Status Cards */}
          <Box sx={{ mb: 3 }}>
            <PlatformStatusCards stats={platformStats} loading={loading} />
          </Box>

          {/* Service Health & Quick Actions */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <ServiceHealthPanel services={serviceHealth} loading={loading} />
            </Grid>
            <Grid item xs={12} md={4}>
              <QuickActionsGrid
                onUserManagement={() => navigate('/admin/users')}
                onPlatformConfig={() => {
                  // TODO: Navigate to platform config page
                  logger.info('Platform config clicked');
                }}
                onSecuritySettings={() => {
                  // TODO: Navigate to security settings page
                  logger.info('Security settings clicked');
                }}
                onDatabaseMaintenance={() => {
                  // TODO: Navigate to database maintenance page
                  logger.info('Database maintenance clicked');
                }}
                onAnalyticsDashboard={() => {
                  // TODO: Navigate to analytics dashboard
                  logger.info('Analytics dashboard clicked');
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <UsageWidget />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Account Info & Usage Section (Non-Admins) */}
      {!isPlatformAdmin && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={8}>
            <Typography variant='h5' gutterBottom>
              Account Information
            </Typography>
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant='caption' color='text.secondary'>
                    Email
                  </Typography>
                  <Typography variant='body1'>{user.email}</Typography>
                </Box>
                <Box>
                  <Typography variant='caption' color='text.secondary'>
                    Roles
                  </Typography>
                  <Stack direction='row' spacing={1} sx={{ mt: 0.5 }}>
                    {(Array.isArray(user.roles) ? user.roles : []).map(role => (
                      <Chip
                        key={role}
                        label={role}
                        size='small'
                        color='primary'
                        variant='outlined'
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <UsageWidget />
          </Grid>
        </Grid>
      )}

      {/* Recent Projects Section (Future) */}
      {/* TODO: Phase 2 - Add recent projects section if user has projects */}

      {/* Demo Setup Dialog */}
      <DemoSetupDialog open={demoDialogOpen} onClose={() => setDemoDialogOpen(false)} />
    </Container>
  );
};

export default PlatformDashboard;
