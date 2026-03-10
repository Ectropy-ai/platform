/**
 * UpgradeModal - Trial Limit Reached Modal
 * Phase 8.2 - Frontend 402 Error Handling
 *
 * Shown automatically when API returns 402 Payment Required
 * Guides users to upgrade their plan
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import UpgradeIcon from '@mui/icons-material/TrendingUp';
import BlockIcon from '@mui/icons-material/Block';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface UpgradeModalData {
  message: string;
  limitType: 'projects' | 'users' | 'storage' | 'trial_expired';
  currentUsage: number;
  limit: number;
  tier: string;
  upgradeUrl?: string;
}

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  data: UpgradeModalData | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get user-friendly title based on limit type
 */
function getLimitTitle(limitType: string): string {
  switch (limitType) {
    case 'projects':
      return 'Project Limit Reached';
    case 'users':
      return 'Team Member Limit Reached';
    case 'storage':
      return 'Storage Limit Reached';
    case 'trial_expired':
      return 'Trial Expired';
    default:
      return 'Upgrade Required';
  }
}

/**
 * Get icon based on limit type
 */
function getLimitIcon(limitType: string): string {
  switch (limitType) {
    case 'projects':
      return '📁';
    case 'users':
      return '👥';
    case 'storage':
      return '💾';
    case 'trial_expired':
      return '⏰';
    default:
      return '🔒';
  }
}

/**
 * Get usage summary text
 */
function getUsageSummary(data: UpgradeModalData): string {
  const { limitType, currentUsage, limit } = data;

  switch (limitType) {
    case 'projects':
      return `You've created ${currentUsage} out of ${limit} projects allowed on your plan.`;
    case 'users':
      return `You have ${currentUsage} out of ${limit} team members allowed on your plan.`;
    case 'storage':
      return `You've used ${currentUsage.toFixed(2)}GB out of ${limit}GB storage allowed on your plan.`;
    case 'trial_expired':
      return 'Your free trial has ended.';
    default:
      return `You've reached the limit for your current plan.`;
  }
}

/**
 * Get upgrade benefits based on limit type
 */
function getUpgradeBenefits(limitType: string): string[] {
  const commonBenefits = ['Priority support', 'Advanced analytics', 'Team collaboration features'];

  switch (limitType) {
    case 'projects':
      return ['Up to 25 projects (or unlimited)', ...commonBenefits];
    case 'users':
      return ['Up to 50 team members (or unlimited)', ...commonBenefits];
    case 'storage':
      return ['Up to 10GB storage (or unlimited)', ...commonBenefits];
    case 'trial_expired':
      return ['Continue using all features', ...commonBenefits];
    default:
      return commonBenefits;
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ open, onClose, data }) => {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    const upgradeUrl = data?.upgradeUrl || '/billing/upgrade';
    navigate(upgradeUrl);
    onClose();
  };

  if (!data) {
    return null;
  }

  const title = getLimitTitle(data.limitType);
  const icon = getLimitIcon(data.limitType);
  const usageSummary = getUsageSummary(data);
  const benefits = getUpgradeBenefits(data.limitType);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'error.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5em',
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant='h6' component='div' sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Chip label={`${data.tier} Plan`} size='small' sx={{ mt: 0.5 }} />
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Error Message */}
        <Alert severity='error' icon={<BlockIcon />} sx={{ mb: 3 }}>
          <Typography variant='body2' sx={{ fontWeight: 500 }}>
            {data.message}
          </Typography>
        </Alert>

        {/* Usage Summary */}
        <Typography variant='body1' color='text.secondary' sx={{ mb: 3 }}>
          {usageSummary}
        </Typography>

        {/* Upgrade Benefits */}
        <Box>
          <Typography variant='subtitle2' sx={{ fontWeight: 600, mb: 1.5 }}>
            Upgrade to unlock:
          </Typography>
          <Stack spacing={1}>
            {benefits.map((benefit, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                  }}
                />
                <Typography variant='body2' color='text.secondary'>
                  {benefit}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Additional Context */}
        <Box
          sx={{
            mt: 3,
            p: 2,
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'grey.200',
          }}
        >
          <Typography variant='caption' color='text.secondary'>
            <strong>Need help choosing a plan?</strong> Contact our sales team for a personalized
            recommendation.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, gap: 1 }}>
        <Button onClick={onClose} color='inherit'>
          Cancel
        </Button>
        <Button
          variant='contained'
          color='primary'
          onClick={handleUpgrade}
          startIcon={<UpgradeIcon />}
          size='large'
        >
          Upgrade Now
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpgradeModal;
