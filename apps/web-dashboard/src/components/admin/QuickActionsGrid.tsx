/**
 * Quick Actions Grid Component
 *
 * Phase: 2 - Tier 0 Platform Dashboard
 * Roadmap: .roadmap/phase-1-user-provisioning.md
 *
 * Reusable admin quick actions grid for platform administrators.
 * Provides shortcuts to common admin tasks.
 *
 * Used in:
 * - PlatformDashboard.tsx (Tier 0 landing page for platform admins)
 * - AdminDashboard.tsx (full admin dashboard)
 */

import React from 'react';
import { Box, Typography, Button, Stack, Paper } from '@mui/material';
import { Settings, SupervisorAccount, Security, Storage, TrendingUp } from '@mui/icons-material';

interface QuickActionsGridProps {
  onUserManagement?: () => void;
  onPlatformConfig?: () => void;
  onSecuritySettings?: () => void;
  onDatabaseMaintenance?: () => void;
  onAnalyticsDashboard?: () => void;
}

/**
 * Quick Actions Grid
 *
 * Displays common admin actions:
 * 1. User Management
 * 2. Platform Configuration
 * 3. Security Settings
 * 4. Database Maintenance
 * 5. Analytics Dashboard
 */
const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  onUserManagement,
  onPlatformConfig,
  onSecuritySettings,
  onDatabaseMaintenance,
  onAnalyticsDashboard,
}) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Settings color='primary' />
        <Typography variant='h6'>Quick Actions</Typography>
      </Box>
      <Stack spacing={2}>
        <Button
          variant='outlined'
          fullWidth
          startIcon={<SupervisorAccount />}
          onClick={onUserManagement}
        >
          User Management
        </Button>
        <Button variant='outlined' fullWidth startIcon={<Settings />} onClick={onPlatformConfig}>
          Platform Configuration
        </Button>
        <Button variant='outlined' fullWidth startIcon={<Security />} onClick={onSecuritySettings}>
          Security Settings
        </Button>
        <Button
          variant='outlined'
          fullWidth
          startIcon={<Storage />}
          onClick={onDatabaseMaintenance}
        >
          Database Maintenance
        </Button>
        <Button
          variant='outlined'
          fullWidth
          startIcon={<TrendingUp />}
          onClick={onAnalyticsDashboard}
        >
          Analytics Dashboard
        </Button>
      </Stack>
    </Paper>
  );
};

export default QuickActionsGrid;
