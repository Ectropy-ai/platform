/**
 * ==============================================================================
 * USER AUTHORIZE DIALOG (M4)
 * ==============================================================================
 * Confirmation dialog for authorizing users with optional audit trail reason
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Enable platform admins to manually authorize trial partners
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
import { CheckCircle } from '@mui/icons-material';
import { User } from '../../../types/user-management.types';

// ==============================================================================
// PROPS
// ==============================================================================

export interface UserAuthorizeDialogProps {
  /** Dialog open state */
  open: boolean;
  /** User to authorize (null when dialog is closed) */
  user: User | null;
  /** Loading state during API call */
  loading: boolean;
  /** Confirm handler (passes optional reason) */
  onConfirm: (reason?: string) => void;
  /** Cancel/close handler */
  onCancel: () => void;
}

// ==============================================================================
// COMPONENT
// ==============================================================================

export const UserAuthorizeDialog: React.FC<UserAuthorizeDialogProps> = ({
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
    if (value.length > 500) {
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

    // Call confirm handler with trimmed reason (or undefined if empty)
    const trimmedReason = reason.trim();
    onConfirm(trimmedReason || undefined);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !error) {
      event.preventDefault();
      handleConfirm();
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  if (!user) {
    return null;
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
          <CheckCircle color='success' />
          <Typography variant='h6' component='span'>
            Authorize User
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box display='flex' flexDirection='column' gap={2}>
          {/* User Information */}
          <Box>
            <Typography variant='body2' color='text.secondary' gutterBottom>
              You are about to authorize the following user for platform access:
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

          {/* Reason Field (Optional) */}
          <TextField
            label='Reason (Optional)'
            multiline
            rows={3}
            fullWidth
            value={reason}
            onChange={handleReasonChange}
            onKeyPress={handleKeyPress}
            disabled={loading}
            placeholder='e.g., Trial partner approved, Beta tester invitation...'
            helperText={
              error || `${reason.length}/500 characters. Optional but recommended for audit trail.`
            }
            error={!!error}
            inputProps={{
              maxLength: 500,
            }}
          />

          {/* Info Alert */}
          <Alert severity='info' variant='outlined'>
            Once authorized, this user will be able to sign in and access the platform. You can
            revoke authorization at any time.
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
          color='success'
          disabled={loading || !!error}
          startIcon={<CheckCircle />}
        >
          {loading ? 'Authorizing...' : 'Authorize User'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UserAuthorizeDialog;
