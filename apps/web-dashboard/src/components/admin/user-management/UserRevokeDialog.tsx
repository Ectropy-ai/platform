/**
 * ==============================================================================
 * USER REVOKE DIALOG (M4)
 * ==============================================================================
 * Warning dialog for revoking user authorization with required audit trail reason
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Enable platform admins to revoke access with mandatory justification
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Chip,
} from '@mui/material';
import { Block, Warning } from '@mui/icons-material';
import { User } from '../../../types/user-management.types';

// ==============================================================================
// PROPS
// ==============================================================================

export interface UserRevokeDialogProps {
  /** Dialog open state */
  open: boolean;
  /** User to revoke (null when dialog is closed) */
  user: User | null;
  /** Loading state during API call */
  loading: boolean;
  /** Confirm handler (passes required reason) */
  onConfirm: (reason: string) => void;
  /** Cancel/close handler */
  onCancel: () => void;
}

// ==============================================================================
// COMPONENT
// ==============================================================================

export const UserRevokeDialog: React.FC<UserRevokeDialogProps> = ({
  open,
  user,
  loading,
  onConfirm,
  onCancel,
}) => {
  // ===========================================================================
  // STATE
  // ===========================================================================

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ===========================================================================
  // EFFECTS
  // ===========================================================================

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validateReason = (value: string): string | null => {
    const trimmed = value.trim();

    if (!trimmed) {
      return 'Reason is required for revoking authorization';
    }

    if (trimmed.length < 10) {
      return 'Reason must be at least 10 characters for audit compliance';
    }

    if (trimmed.length > 500) {
      return 'Reason must not exceed 500 characters';
    }

    return null;
  };

  // ===========================================================================
  // HANDLERS
  // ===========================================================================

  const handleReasonChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setReason(newValue);

    // Clear error if value becomes valid
    const validationError = validateReason(newValue);
    if (validationError) {
      setError(validationError);
    } else {
      setError(null);
    }
  };

  const handleConfirm = () => {
    // Validate reason
    const validationError = validateReason(reason);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Call confirm handler with trimmed reason
    onConfirm(reason.trim());
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !error && reason.trim()) {
      event.preventDefault();
      handleConfirm();
    }
  };

  // ===========================================================================
  // COMPUTED VALUES
  // ===========================================================================

  const isValid = !validateReason(reason);
  const characterCount = reason.length;

  // ===========================================================================
  // RENDER
  // ===========================================================================

  if (!user) {
    return null;
  }

  // Prevent revoking platform admins
  if (user.isPlatformAdmin) {
    return (
      <Dialog open={open} onClose={onCancel} maxWidth='sm' fullWidth>
        <DialogTitle>
          <Box display='flex' alignItems='center' gap={1}>
            <Warning color='error' />
            <Typography variant='h6' component='span'>
              Cannot Revoke Platform Admin
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity='error'>
            Platform administrators cannot have their authorization revoked. This prevents
            accidental lockout from the system. If you need to remove admin access, please contact
            system support.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onCancel} variant='contained'>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      maxWidth='sm'
      fullWidth
      disableEscapeKeyDown={loading}
    >
      <DialogTitle>
        <Box display='flex' alignItems='center' gap={1}>
          <Block color='error' />
          <Typography variant='h6' component='span'>
            Revoke User Authorization
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box display='flex' flexDirection='column' gap={2}>
          {/* Warning Alert */}
          <Alert severity='warning' variant='filled'>
            <Typography variant='body2' fontWeight={600}>
              Warning: This action will revoke platform access
            </Typography>
            <Typography variant='body2' fontSize='0.875rem'>
              The user will no longer be able to sign in until re-authorized.
            </Typography>
          </Alert>

          {/* User Information */}
          <Box>
            <Typography variant='body2' color='text.secondary' gutterBottom>
              You are about to revoke authorization for:
            </Typography>
            <Box
              mt={1}
              p={2}
              bgcolor='background.default'
              borderRadius={1}
              border='1px solid'
              borderColor='divider'
            >
              <Typography variant='body1' fontWeight={600}>
                {user.email}
              </Typography>
              {user.fullName && (
                <Typography variant='body2' color='text.secondary'>
                  {user.fullName}
                </Typography>
              )}
              {user.tenant && (
                <Box mt={1}>
                  <Chip label={user.tenant.name} size='small' variant='outlined' />
                </Box>
              )}
            </Box>
          </Box>

          {/* Reason Field (REQUIRED) */}
          <TextField
            label='Reason (Required)'
            multiline
            rows={4}
            fullWidth
            value={reason}
            onChange={handleReasonChange}
            onKeyPress={handleKeyPress}
            disabled={loading}
            required
            placeholder='e.g., Trial period ended, User requested account closure, Policy violation...'
            helperText={
              error ||
              `${characterCount}/500 characters (minimum 10). Required for compliance audit trail.`
            }
            error={!!error}
            inputProps={{
              maxLength: 500,
            }}
          />

          {/* Info Alert */}
          <Alert severity='info' variant='outlined'>
            This action creates an audit record with your admin identity and the reason provided.
            The user can be re-authorized at any time.
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={loading} color='inherit'>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant='contained'
          color='error'
          disabled={loading || !isValid}
          startIcon={<Block />}
        >
          {loading ? 'Revoking...' : 'Revoke Authorization'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserRevokeDialog;
