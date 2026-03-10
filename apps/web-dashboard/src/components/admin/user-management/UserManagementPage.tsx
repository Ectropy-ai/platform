/**
 * ==============================================================================
 * USER MANAGEMENT PAGE (M4)
 * ==============================================================================
 * Main container for admin user management interface
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Enable platform admins to manage user authorization (MVP for trial partners)
 * ==============================================================================
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Alert,
  Snackbar,
  Paper,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import { Home, SupervisorAccount } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { User, UserFilters as UserFiltersType } from '../../../types/user-management.types';
import {
  useUsers,
  useAuthorizeUser,
  useRevokeAuthorization,
} from '../../../hooks/queries/useUserManagement';
import { UserManagementTable } from './UserManagementTable';
import { UserAuthorizeDialog } from './UserAuthorizeDialog';
import { UserRevokeDialog } from './UserRevokeDialog';
import { UserFilters } from './UserFilters';

// ==============================================================================
// COMPONENT
// ==============================================================================

export const UserManagementPage: React.FC = () => {
  // ===========================================================================
  // STATE
  // ===========================================================================

  const [filters, setFilters] = useState<UserFiltersType>({
    limit: 50,
    offset: 0,
  });

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [authorizeDialogUser, setAuthorizeDialogUser] = useState<User | null>(null);
  const [revokeDialogUser, setRevokeDialogUser] = useState<User | null>(null);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // ===========================================================================
  // QUERY HOOKS
  // ===========================================================================

  const { users, pagination, isLoading, error, refetch } = useUsers({
    ...filters,
    limit: pageSize,
    offset: page * pageSize,
  });

  const authorizeUser = useAuthorizeUser();
  const revokeAuthorization = useRevokeAuthorization();

  // ===========================================================================
  // FILTER HANDLERS
  // ===========================================================================

  const handleFilterChange = useCallback((newFilters: UserFiltersType) => {
    setFilters(newFilters);
    setPage(0); // Reset to first page when filters change
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({ limit: pageSize, offset: 0 });
    setPage(0);
  }, [pageSize]);

  // ===========================================================================
  // PAGINATION HANDLERS
  // ===========================================================================

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      setFilters(prev => ({
        ...prev,
        offset: newPage * pageSize,
      }));
    },
    [pageSize],
  );

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(0);
    setFilters(prev => ({
      ...prev,
      limit: newPageSize,
      offset: 0,
    }));
  }, []);

  // ===========================================================================
  // DIALOG HANDLERS
  // ===========================================================================

  const handleOpenAuthorizeDialog = useCallback((user: User) => {
    setAuthorizeDialogUser(user);
  }, []);

  const handleCloseAuthorizeDialog = useCallback(() => {
    if (!authorizeUser.isLoading) {
      setAuthorizeDialogUser(null);
      authorizeUser.reset();
    }
  }, [authorizeUser]);

  const handleConfirmAuthorize = useCallback(
    async (reason?: string) => {
      if (!authorizeDialogUser) return;

      try {
        await authorizeUser.mutateAsync({
          userId: authorizeDialogUser.id,
          reason,
        });

        setSnackbar({
          open: true,
          message: `${authorizeDialogUser.email} has been authorized successfully`,
          severity: 'success',
        });

        setAuthorizeDialogUser(null);
        authorizeUser.reset();

        // Refetch users to show updated data
        await refetch();
      } catch (error) {
        setSnackbar({
          open: true,
          message:
            error instanceof Error ? error.message : 'Failed to authorize user. Please try again.',
          severity: 'error',
        });
      }
    },
    [authorizeDialogUser, authorizeUser, refetch],
  );

  const handleOpenRevokeDialog = useCallback((user: User) => {
    setRevokeDialogUser(user);
  }, []);

  const handleCloseRevokeDialog = useCallback(() => {
    if (!revokeAuthorization.isLoading) {
      setRevokeDialogUser(null);
      revokeAuthorization.reset();
    }
  }, [revokeAuthorization]);

  const handleConfirmRevoke = useCallback(
    async (reason: string) => {
      if (!revokeDialogUser) return;

      try {
        await revokeAuthorization.mutateAsync({
          userId: revokeDialogUser.id,
          reason,
        });

        setSnackbar({
          open: true,
          message: `Authorization revoked for ${revokeDialogUser.email}`,
          severity: 'success',
        });

        setRevokeDialogUser(null);
        revokeAuthorization.reset();

        // Refetch users to show updated data
        await refetch();
      } catch (error) {
        setSnackbar({
          open: true,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to revoke authorization. Please try again.',
          severity: 'error',
        });
      }
    },
    [revokeDialogUser, revokeAuthorization, refetch],
  );

  const handleCloseSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <Container maxWidth='xl' sx={{ py: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs aria-label='breadcrumb' sx={{ mb: 2 }}>
        <MuiLink
          component={Link}
          to='/'
          underline='hover'
          color='inherit'
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <Home fontSize='small' />
          Dashboard
        </MuiLink>
        <Typography color='text.primary' sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SupervisorAccount fontSize='small' />
          User Management
        </Typography>
      </Breadcrumbs>

      {/* Page Header */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant='h4' component='h1' gutterBottom fontWeight={600}>
          User Management
        </Typography>
        <Typography variant='body1' color='text.secondary'>
          Manage platform user authorization for trial partners and customers. Authorize pending
          users or revoke access as needed.
        </Typography>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity='error' sx={{ mb: 3 }}>
          Failed to load users: {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      )}

      {/* Filters */}
      <UserFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {/* User Table */}
      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <UserManagementTable
          users={users}
          loading={isLoading}
          totalRows={pagination.total}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onAuthorize={handleOpenAuthorizeDialog}
          onRevoke={handleOpenRevokeDialog}
        />
      </Paper>

      {/* Authorize Dialog */}
      <UserAuthorizeDialog
        open={!!authorizeDialogUser}
        user={authorizeDialogUser}
        loading={authorizeUser.isLoading}
        onConfirm={handleConfirmAuthorize}
        onCancel={handleCloseAuthorizeDialog}
      />

      {/* Revoke Dialog */}
      <UserRevokeDialog
        open={!!revokeDialogUser}
        user={revokeDialogUser}
        loading={revokeAuthorization.isLoading}
        onConfirm={handleConfirmRevoke}
        onCancel={handleCloseRevokeDialog}
      />

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant='filled'
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default UserManagementPage;
