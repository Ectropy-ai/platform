/**
 * UsageWidget - Trial Limits Dashboard Component
 * Phase 8.1 - Frontend Trial Limits UI
 *
 * Displays current usage and limits for:
 * - Projects (e.g., 2/3 used)
 * - Users (e.g., 3/5 used)
 * - Storage (e.g., 0.5GB/1GB used)
 * - Trial expiration date
 *
 * Shows upgrade CTA when approaching limits
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Button,
  Chip,
  Box,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import UpgradeIcon from '@mui/icons-material/TrendingUp';
import ProjectIcon from '@mui/icons-material/FolderOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutline';
import StorageIcon from '@mui/icons-material/CloudOutlined';
import CalendarIcon from '@mui/icons-material/CalendarTodayOutlined';
import { config } from '../../services/config';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface TenantUsage {
  tenantId: string;
  tier: string;
  maxProjects: number;
  currentProjects: number;
  maxUsers: number;
  currentUsers: number;
  maxStorageGb: number;
  currentStorageGb: number;
  // Phase 10: Trial expiration tracking
  trialEndsAt?: string | null; // Backend uses trialEndsAt (camelCase from DB mapping)
  trialStartedAt?: string | null;
  daysRemaining?: number | null;
  isTrialExpired?: boolean;
  // Legacy support
  trialExpiresAt?: string | null; // Alias for backward compatibility
}

interface UsageResponse {
  success: boolean;
  data: TenantUsage;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate percentage used (0-100)
 */
function calculatePercentage(current: number, max: number): number {
  if (max === 0) {
    return 0;
  }
  return Math.min(Math.round((current / max) * 100), 100);
}

/**
 * Determine if usage is approaching limit (>=90%)
 */
function isApproachingLimit(current: number, max: number): boolean {
  return calculatePercentage(current, max) >= 90;
}

/**
 * Format days until expiration
 */
function getDaysUntilExpiration(expiresAt: string): number {
  const now = new Date();
  const expiration = new Date(expiresAt);
  const diffTime = expiration.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get color based on usage percentage
 */
function getUsageColor(percentage: number): 'success' | 'warning' | 'error' {
  if (percentage >= 90) {
    return 'error';
  }
  if (percentage >= 70) {
    return 'warning';
  }
  return 'success';
}

// =============================================================================
// COMPONENT
// =============================================================================

export const UsageWidget: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage data
  useEffect(() => {
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/tenant/usage`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookies
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch usage: HTTP ${response.status}`);
      }

      const data: UsageResponse = await response.json();
      setUsage(data.data);
    } catch (err) {
      console.error('Failed to fetch tenant usage:', err);
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgradeClick = () => {
    navigate('/billing/upgrade');
  };

  // Loading state
  if (isLoading) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Box
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}
          >
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error || !usage) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Alert severity='error'>{error || 'Unable to load usage data'}</Alert>
        </CardContent>
      </Card>
    );
  }

  // Calculate percentages
  const projectsPercent = calculatePercentage(usage.currentProjects, usage.maxProjects);
  const usersPercent = calculatePercentage(usage.currentUsers, usage.maxUsers);
  const storagePercent = calculatePercentage(usage.currentStorageGb, usage.maxStorageGb);

  // Check if any limits are approaching
  const hasWarning =
    isApproachingLimit(usage.currentProjects, usage.maxProjects) ||
    isApproachingLimit(usage.currentUsers, usage.maxUsers) ||
    isApproachingLimit(usage.currentStorageGb, usage.maxStorageGb);

  // Phase 10: Trial expiration warning (use backend-calculated values if available)
  const daysUntilExpiration =
    usage.daysRemaining !== undefined && usage.daysRemaining !== null
      ? usage.daysRemaining
      : usage.trialEndsAt
        ? getDaysUntilExpiration(usage.trialEndsAt)
        : usage.trialExpiresAt
          ? getDaysUntilExpiration(usage.trialExpiresAt)
          : null;

  const isTrialExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= 7;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant='h6' component='div' sx={{ fontWeight: 600 }}>
            Usage & Limits
          </Typography>
          <Chip
            label={usage.tier}
            color={usage.tier === 'FREE' ? 'default' : 'primary'}
            size='small'
          />
        </Box>

        {/* Trial Expiration Warning */}
        {isTrialExpiringSoon && daysUntilExpiration !== null && (
          <Alert severity='warning' sx={{ mb: 2 }}>
            {daysUntilExpiration > 0 ? (
              <>
                Trial expires in {daysUntilExpiration} day{daysUntilExpiration === 1 ? '' : 's'}
              </>
            ) : (
              <>Trial expires today!</>
            )}
          </Alert>
        )}

        <Stack spacing={2.5}>
          {/* Projects Usage */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <ProjectIcon fontSize='small' sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant='body2' color='text.secondary'>
                Projects
              </Typography>
              <Typography
                variant='body2'
                sx={{
                  ml: 'auto',
                  fontWeight: 600,
                  color: `${getUsageColor(projectsPercent)}.main`,
                }}
              >
                {usage.currentProjects}/{usage.maxProjects === 999999 ? '∞' : usage.maxProjects}
              </Typography>
            </Box>
            {usage.maxProjects !== 999999 && (
              <LinearProgress
                variant='determinate'
                value={projectsPercent}
                color={getUsageColor(projectsPercent)}
                sx={{ height: 6, borderRadius: 1 }}
              />
            )}
          </Box>

          {/* Users Usage */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <PeopleIcon fontSize='small' sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant='body2' color='text.secondary'>
                Team Members
              </Typography>
              <Typography
                variant='body2'
                sx={{ ml: 'auto', fontWeight: 600, color: `${getUsageColor(usersPercent)}.main` }}
              >
                {usage.currentUsers}/{usage.maxUsers === 999999 ? '∞' : usage.maxUsers}
              </Typography>
            </Box>
            {usage.maxUsers !== 999999 && (
              <LinearProgress
                variant='determinate'
                value={usersPercent}
                color={getUsageColor(usersPercent)}
                sx={{ height: 6, borderRadius: 1 }}
              />
            )}
          </Box>

          {/* Storage Usage */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <StorageIcon fontSize='small' sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant='body2' color='text.secondary'>
                Storage
              </Typography>
              <Typography
                variant='body2'
                sx={{ ml: 'auto', fontWeight: 600, color: `${getUsageColor(storagePercent)}.main` }}
              >
                {usage.currentStorageGb.toFixed(2)}GB/
                {usage.maxStorageGb === 999999 ? '∞' : `${usage.maxStorageGb}GB`}
              </Typography>
            </Box>
            {usage.maxStorageGb !== 999999 && (
              <LinearProgress
                variant='determinate'
                value={storagePercent}
                color={getUsageColor(storagePercent)}
                sx={{ height: 6, borderRadius: 1 }}
              />
            )}
          </Box>

          {/* Trial Expiration Date (if applicable) */}
          {usage.trialExpiresAt && (
            <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CalendarIcon fontSize='small' sx={{ mr: 1, color: 'text.secondary' }} />
                <Typography variant='body2' color='text.secondary'>
                  Trial expires:
                </Typography>
                <Typography
                  variant='body2'
                  sx={{
                    ml: 'auto',
                    fontWeight: 600,
                    color: isTrialExpiringSoon ? 'warning.main' : 'text.primary',
                  }}
                >
                  {new Date(usage.trialExpiresAt).toLocaleDateString()}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Upgrade CTA */}
          {(usage.tier === 'FREE' || hasWarning) && (
            <Button
              variant={hasWarning ? 'contained' : 'outlined'}
              color={hasWarning ? 'error' : 'primary'}
              fullWidth
              startIcon={<UpgradeIcon />}
              onClick={handleUpgradeClick}
              sx={{ mt: 1 }}
            >
              {hasWarning ? 'Upgrade Now' : 'Upgrade Plan'}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default UsageWidget;
