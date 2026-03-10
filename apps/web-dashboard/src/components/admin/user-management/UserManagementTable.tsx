/**
 * ==============================================================================
 * USER MANAGEMENT TABLE (M4)
 * ==============================================================================
 * MUI DataGrid component for displaying and managing platform users
 * Milestone: User Management M4 (Admin UI Layer)
 * Purpose: Enable platform admins to view and authorize users
 * ==============================================================================
 */

import React from 'react';
import { Box, Chip, IconButton, Tooltip, Typography, CircularProgress, Alert } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams, GridPaginationModel } from '@mui/x-data-grid';
import { CheckCircle, Block, MoreVert, AdminPanelSettings } from '@mui/icons-material';
import { format } from 'date-fns';
import { User } from '../../../types/user-management.types';

// ==============================================================================
// PROPS
// ==============================================================================

export interface UserManagementTableProps {
  /** List of users to display */
  users: User[];
  /** Loading state (initial fetch) */
  loading: boolean;
  /** Total number of users (for pagination) */
  totalRows: number;
  /** Current page (0-indexed) */
  page: number;
  /** Rows per page */
  pageSize: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Page size change handler */
  onPageSizeChange: (pageSize: number) => void;
  /** Authorize user handler */
  onAuthorize: (user: User) => void;
  /** Revoke authorization handler */
  onRevoke: (user: User) => void;
}

// ==============================================================================
// COLUMN FORMATTERS
// ==============================================================================

/**
 * Format date for display
 */
function formatDate(date: string | null): string {
  if (!date) return 'Never';
  try {
    return format(new Date(date), 'MMM d, yyyy');
  } catch (_error) {
    return 'Invalid date';
  }
}

/**
 * Render authorization status chip
 */
function renderStatusChip(isAuthorized: boolean, isPlatformAdmin: boolean) {
  if (isPlatformAdmin) {
    return (
      <Chip
        icon={<AdminPanelSettings />}
        label='Platform Admin'
        color='info'
        size='small'
        variant='filled'
      />
    );
  }

  if (isAuthorized) {
    return (
      <Chip
        icon={<CheckCircle />}
        label='Authorized'
        color='success'
        size='small'
        variant='filled'
      />
    );
  }

  return <Chip icon={<Block />} label='Pending' color='warning' size='small' variant='outlined' />;
}

// ==============================================================================
// COMPONENT
// ==============================================================================

export const UserManagementTable: React.FC<UserManagementTableProps> = ({
  users,
  loading,
  totalRows,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onAuthorize,
  onRevoke,
}) => {
  // ===========================================================================
  // COLUMN DEFINITIONS
  // ===========================================================================

  const columns: GridColDef[] = [
    {
      field: 'email',
      headerName: 'Email',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Typography variant='body2' fontWeight={500}>
          {params.row.email}
        </Typography>
      ),
    },
    {
      field: 'fullName',
      headerName: 'Full Name',
      flex: 1,
      minWidth: 150,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Typography variant='body2'>{params.row.fullName || 'N/A'}</Typography>
      ),
    },
    {
      field: 'tenant',
      headerName: 'Organization',
      flex: 1,
      minWidth: 150,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Typography variant='body2' color='text.secondary'>
          {params.row.tenant?.name || 'No Organization'}
        </Typography>
      ),
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 120,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Chip label={params.row.role} size='small' variant='outlined' />
      ),
    },
    {
      field: 'isAuthorized',
      headerName: 'Status',
      width: 160,
      renderCell: (params: GridRenderCellParams<User>) =>
        renderStatusChip(params.row.isAuthorized, params.row.isPlatformAdmin),
    },
    {
      field: 'authorizedAt',
      headerName: 'Authorized On',
      width: 130,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Typography variant='body2' color='text.secondary'>
          {formatDate(params.row.authorizedAt)}
        </Typography>
      ),
    },
    {
      field: 'lastLogin',
      headerName: 'Last Login',
      width: 130,
      renderCell: (params: GridRenderCellParams<User>) => (
        <Typography variant='body2' color='text.secondary'>
          {formatDate(params.row.lastLogin)}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params: GridRenderCellParams<User>) => {
        const user = params.row;
        const canAuthorize = !user.isAuthorized && !user.isPlatformAdmin;
        const canRevoke = user.isAuthorized && !user.isPlatformAdmin;

        return (
          <Box display='flex' gap={0.5}>
            {canAuthorize && (
              <Tooltip title='Authorize User'>
                <IconButton
                  size='small'
                  color='success'
                  onClick={() => onAuthorize(user)}
                  data-testid={`authorize-${user.id}`}
                >
                  <CheckCircle fontSize='small' />
                </IconButton>
              </Tooltip>
            )}
            {canRevoke && (
              <Tooltip title='Revoke Authorization'>
                <IconButton
                  size='small'
                  color='error'
                  onClick={() => onRevoke(user)}
                  data-testid={`revoke-${user.id}`}
                >
                  <Block fontSize='small' />
                </IconButton>
              </Tooltip>
            )}
            {user.isPlatformAdmin && (
              <Tooltip title='Platform Admin (Cannot Modify)'>
                <IconButton size='small' disabled>
                  <MoreVert fontSize='small' />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ];

  // ===========================================================================
  // PAGINATION HANDLERS
  // ===========================================================================

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.page !== page) {
      onPageChange(model.page);
    }
    if (model.pageSize !== pageSize) {
      onPageSizeChange(model.pageSize);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  // Loading state
  if (loading && users.length === 0) {
    return (
      <Box display='flex' justifyContent='center' alignItems='center' minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  // Empty state
  if (!loading && users.length === 0) {
    return (
      <Box minHeight={400} display='flex' alignItems='center' justifyContent='center'>
        <Alert severity='info'>
          No users found. Try adjusting your filters or search criteria.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={users}
        columns={columns}
        rowCount={totalRows}
        loading={loading}
        paginationMode='server'
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={[25, 50, 100]}
        disableRowSelectionOnClick
        disableColumnMenu
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
          '& .MuiDataGrid-cell:focus': {
            outline: 'none',
          },
          '& .MuiDataGrid-cell:focus-within': {
            outline: 'none',
          },
        }}
        initialState={{
          pagination: {
            paginationModel: { page, pageSize },
          },
        }}
      />
    </Box>
  );
};

export default UserManagementTable;
