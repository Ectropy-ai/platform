/**
 * RoleEditDialog Component
 * Enterprise User Role Management Dialog
 *
 * Purpose: Allows admins to update user roles with audit trail
 * Features:
 * - Role selection dropdown
 * - Audit reason (required for compliance)
 * - Real-time validation
 * - Enterprise audit logging
 * - Success/error feedback
 *
 * Created: 2025-12-24
 * Aligned with: ENTERPRISE_USER_MANAGEMENT_SOLUTION.md Phase 3
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Alert,
  Box,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Edit, Security, Warning } from '@mui/icons-material';
import { logger } from '../../services/logger';
import { config } from '../../services/config';

interface RoleEditDialogProps {
  open: boolean;
  onClose: () => void;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  onSuccess: () => void;
}

const VALID_ROLES = ['admin', 'architect', 'engineer', 'contractor', 'client', 'viewer'];

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Full administrative access - System management and user control',
  architect: 'Lead design role - Project creation and full edit access',
  engineer: 'Technical implementation - Edit access with technical focus',
  contractor: 'Build execution - Material takeoffs and construction data',
  client: 'Project oversight - View and comment permissions',
  viewer: 'Read-only access - View projects without edit rights',
};

const RoleEditDialog: React.FC<RoleEditDialogProps> = ({ open, onClose, user, onSuccess }) => {
  const [newRole, setNewRole] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (open && user) {
      setNewRole(user.role);
      setReason('');
      setError(null);
      setSuccess(false);
    }
  }, [open, user]);

  const handleSubmit = async () => {
    if (!user) return;

    // Validation
    if (!newRole) {
      setError('Please select a role');
      return;
    }

    if (newRole === user.role) {
      setError('Please select a different role than the current one');
      return;
    }

    if (!reason || reason.trim().length === 0) {
      setError('Audit reason is required for compliance');
      return;
    }

    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters for audit trail');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: newRole,
          reason: reason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to update user role: ${response.statusText}`);
      }

      logger.info('User role updated successfully', {
        userId: user.id,
        oldRole: user.role,
        newRole,
        reason: reason.trim(),
      });

      setSuccess(true);

      // Close dialog and refresh after short delay
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      logger.error('Error updating user role:', { error: err });
      setError(err.message || 'Failed to update user role');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit color='primary' />
          <Typography variant='h6'>Edit User Role</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* User Info */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant='subtitle2' color='text.secondary'>
            User
          </Typography>
          <Typography variant='body1' fontWeight='bold'>
            {user.name}
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            {user.email}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip label={`Current: ${user.role}`} size='small' color='primary' variant='outlined' />
          </Box>
        </Box>

        {/* Role Selection */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id='role-select-label'>New Role</InputLabel>
          <Select
            labelId='role-select-label'
            id='role-select'
            value={newRole}
            label='New Role'
            onChange={e => setNewRole(e.target.value)}
            disabled={loading || success}
          >
            {VALID_ROLES.map(role => (
              <MenuItem key={role} value={role}>
                <Box>
                  <Typography
                    variant='body1'
                    sx={{ textTransform: 'capitalize', fontWeight: 'bold' }}
                  >
                    {role}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    {ROLE_DESCRIPTIONS[role]}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Audit Reason */}
        <TextField
          fullWidth
          label='Reason for Role Change (Audit Required)'
          multiline
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder='e.g., User promoted to team lead role, User transitioning to contractor phase'
          disabled={loading || success}
          required
          helperText='Required for enterprise audit trail (minimum 10 characters)'
          sx={{ mb: 2 }}
        />

        {/* Security Warning for Admin Role */}
        {newRole === 'admin' && (
          <Alert severity='warning' icon={<Security />} sx={{ mb: 2 }}>
            <Typography variant='body2' fontWeight='bold'>
              Admin Role Assignment
            </Typography>
            <Typography variant='caption'>
              Granting admin privileges provides full system access including user management,
              system configuration, and security settings. Ensure this user requires administrative
              access.
            </Typography>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert severity='error' sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert severity='success' sx={{ mb: 2 }}>
            User role updated successfully! Refreshing user list...
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={loading || success}>
          Cancel
        </Button>
        <Button
          variant='contained'
          onClick={handleSubmit}
          disabled={loading || success || !newRole || !reason || newRole === user.role}
          startIcon={loading ? <CircularProgress size={20} /> : <Edit />}
        >
          {loading ? 'Updating...' : 'Update Role'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoleEditDialog;
