/**
 * ==============================================================================
 * TENANTS PAGE
 * ==============================================================================
 * Tenant management page with list, create, edit, and status management.
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Chip,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Snackbar,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Search,
  Add,
  Business,
  Edit,
  Block,
  CheckCircle,
  Close,
} from '@mui/icons-material';

import { consoleApi } from '../services/console-api';
import type {
  Tenant,
  TenantStatus,
  SubscriptionTier,
  ConsoleFilters,
  CreateTenantRequest,
} from '../types/console.types';

// ==============================================================================
// Status Chip
// ==============================================================================

const StatusChip: React.FC<{ status: TenantStatus }> = ({ status }) => {
  const config: Record<TenantStatus, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
    ACTIVE: { color: 'success', label: 'Active' },
    TRIAL: { color: 'warning', label: 'Trial' },
    SUSPENDED: { color: 'error', label: 'Suspended' },
    CANCELLED: { color: 'default', label: 'Cancelled' },
  };
  const { color, label } = config[status] || { color: 'default', label: status };
  return <Chip label={label} color={color} size="small" />;
};

// ==============================================================================
// Tier Chip
// ==============================================================================

const TierChip: React.FC<{ tier: SubscriptionTier }> = ({ tier }) => {
  const config: Record<SubscriptionTier, { color: 'default' | 'primary' | 'secondary' | 'info'; label: string }> = {
    FREE: { color: 'default', label: 'Free' },
    BASIC: { color: 'primary', label: 'Basic' },
    PROFESSIONAL: { color: 'secondary', label: 'Pro' },
    ENTERPRISE: { color: 'info', label: 'Enterprise' },
  };
  const { color, label } = config[tier] || { color: 'default', label: tier };
  return <Chip label={label} color={color} size="small" variant="outlined" />;
};

// ==============================================================================
// Create/Edit Tenant Dialog
// ==============================================================================

interface TenantDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTenantRequest) => void;
  loading: boolean;
  tenant?: Tenant | null;
}

const TenantDialog: React.FC<TenantDialogProps> = ({
  open,
  onClose,
  onSubmit,
  loading,
  tenant,
}) => {
  const isEdit = !!tenant;
  const [formData, setFormData] = useState<CreateTenantRequest>({
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    primaryEmail: tenant?.primaryEmail || '',
    subscriptionTier: tenant?.subscriptionTier || 'FREE',
  });
  const [errors, setErrors] = useState<{ name?: string; slug?: string; primaryEmail?: string }>({});

  React.useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        slug: tenant.slug,
        primaryEmail: tenant.primaryEmail || '',
        subscriptionTier: tenant.subscriptionTier,
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        primaryEmail: '',
        subscriptionTier: 'FREE',
      });
    }
    setErrors({});
  }, [tenant, open]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: !isEdit && !prev.slug ? generateSlug(name) : prev.slug,
    }));
    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!formData.name || formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    if (!isEdit && (!formData.slug || formData.slug.length < 3)) {
      newErrors.slug = 'Slug must be at least 3 characters';
    }
    if (!formData.primaryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primaryEmail)) {
      newErrors.primaryEmail = 'Valid email required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? 'Edit Tenant' : 'Create New Tenant'}
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          disabled={loading}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Tenant Name"
            value={formData.name}
            onChange={handleNameChange}
            error={!!errors.name}
            helperText={errors.name}
            fullWidth
            required
            disabled={loading}
          />
          <TextField
            label="Slug"
            value={formData.slug}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }));
              if (errors.slug) setErrors((prev) => ({ ...prev, slug: undefined }));
            }}
            error={!!errors.slug}
            helperText={errors.slug || 'Used in URLs (e.g., acme-corp)'}
            fullWidth
            required
            disabled={loading || isEdit}
          />
          <TextField
            label="Primary Email"
            type="email"
            value={formData.primaryEmail}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, primaryEmail: e.target.value }));
              if (errors.primaryEmail) setErrors((prev) => ({ ...prev, primaryEmail: undefined }));
            }}
            error={!!errors.primaryEmail}
            helperText={errors.primaryEmail}
            fullWidth
            required
            disabled={loading}
          />
          <FormControl fullWidth disabled={loading}>
            <InputLabel>Subscription Tier</InputLabel>
            <Select
              value={formData.subscriptionTier}
              label="Subscription Tier"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  subscriptionTier: e.target.value as SubscriptionTier,
                }))
              }
            >
              <MenuItem value="FREE">Free (5 users, 1 project)</MenuItem>
              <MenuItem value="BASIC">Basic (25 users, 5 projects)</MenuItem>
              <MenuItem value="PROFESSIONAL">Professional (100 users, 25 projects)</MenuItem>
              <MenuItem value="ENTERPRISE">Enterprise (Unlimited)</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          {isEdit ? 'Update Tenant' : 'Create Tenant'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// Suspend Tenant Dialog
// ==============================================================================

interface SuspendDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
  tenant: Tenant | null;
}

const SuspendDialog: React.FC<SuspendDialogProps> = ({
  open,
  onClose,
  onConfirm,
  loading,
  tenant,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    setReason('');
    setError('');
  }, [open]);

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    onConfirm(reason);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Suspend Tenant</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Suspending <strong>{tenant?.name}</strong> will prevent all users from accessing the platform.
        </Alert>
        <TextField
          label="Reason for suspension"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError('');
          }}
          error={!!error}
          helperText={error}
          fullWidth
          multiline
          rows={3}
          required
          disabled={loading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Block />}
        >
          Suspend Tenant
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// Tenants Page
// ==============================================================================

const TenantsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ConsoleFilters>({
    search: '',
    status: 'ALL',
    tier: 'ALL',
    limit: 25,
    offset: 0,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [suspendTenant, setSuspendTenant] = useState<Tenant | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Fetch tenants
  const tenantsQuery = useQuery({
    queryKey: ['console', 'tenants', filters],
    queryFn: () => consoleApi.getTenants(filters),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateTenantRequest) => consoleApi.createTenant(data),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['console', 'tenants'] });
        setCreateDialogOpen(false);
        setSnackbar({ open: true, message: `Tenant "${response.data?.name}" created successfully`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: response.error || 'Failed to create tenant', severity: 'error' });
      }
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Failed to create tenant: ${error instanceof Error ? error.message : 'Unknown error'}`, severity: 'error' });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTenantRequest> }) =>
      consoleApi.updateTenant(id, data),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['console', 'tenants'] });
        setEditTenant(null);
        setSnackbar({ open: true, message: `Tenant updated successfully`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: response.error || 'Failed to update tenant', severity: 'error' });
      }
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Failed to update tenant: ${error instanceof Error ? error.message : 'Unknown error'}`, severity: 'error' });
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      consoleApi.suspendTenant(id, reason),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['console', 'tenants'] });
        setSuspendTenant(null);
        setSnackbar({ open: true, message: `Tenant suspended successfully`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: response.error || 'Failed to suspend tenant', severity: 'error' });
      }
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Failed to suspend tenant: ${error instanceof Error ? error.message : 'Unknown error'}`, severity: 'error' });
    },
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: (id: string) => consoleApi.activateTenant(id),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['console', 'tenants'] });
        setSnackbar({ open: true, message: `Tenant activated successfully`, severity: 'success' });
      } else {
        setSnackbar({ open: true, message: response.error || 'Failed to activate tenant', severity: 'error' });
      }
    },
    onError: (error) => {
      setSnackbar({ open: true, message: `Failed to activate tenant: ${error instanceof Error ? error.message : 'Unknown error'}`, severity: 'error' });
    },
  });

  const tenants = tenantsQuery.data?.data?.tenants || [];
  const pagination = tenantsQuery.data?.data?.pagination;

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: event.target.value, offset: 0 }));
  };

  const handleStatusChange = (event: any) => {
    setFilters((prev) => ({ ...prev, status: event.target.value, offset: 0 }));
  };

  const handleTierChange = (event: any) => {
    setFilters((prev) => ({ ...prev, tier: event.target.value, offset: 0 }));
  };

  // DataGrid columns with actions
  const columns: GridColDef<Tenant>[] = [
    {
      field: 'name',
      headerName: 'Tenant Name',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams<Tenant>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Business fontSize="small" color="action" />
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {params.row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {params.row.slug}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params: GridRenderCellParams<Tenant>) => (
        <StatusChip status={params.row.status} />
      ),
    },
    {
      field: 'subscriptionTier',
      headerName: 'Tier',
      width: 120,
      renderCell: (params: GridRenderCellParams<Tenant>) => (
        <TierChip tier={params.row.subscriptionTier} />
      ),
    },
    {
      field: 'usage',
      headerName: 'Users',
      width: 100,
      valueGetter: (_value, row) => `${row.usage.userCount}/${row.limits.maxUsers}`,
    },
    {
      field: 'projects',
      headerName: 'Projects',
      width: 100,
      valueGetter: (_value, row) => `${row.usage.projectCount}/${row.limits.maxProjects}`,
    },
    {
      field: 'primaryEmail',
      headerName: 'Contact',
      flex: 1,
      minWidth: 180,
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 100,
      valueGetter: (value) => new Date(value).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params: GridRenderCellParams<Tenant>) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={() => setEditTenant(params.row)}
            >
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          {params.row.status === 'SUSPENDED' ? (
            <Tooltip title="Activate">
              <IconButton
                size="small"
                color="success"
                onClick={() => activateMutation.mutate(params.row.id)}
                disabled={activateMutation.isPending}
              >
                <CheckCircle fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : params.row.status !== 'CANCELLED' ? (
            <Tooltip title="Suspend">
              <IconButton
                size="small"
                color="error"
                onClick={() => setSuspendTenant(params.row)}
              >
                <Block fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Tenants
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage all customer organizations across the platform
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Tenant
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search tenants..."
              value={filters.search}
              onChange={handleSearchChange}
              size="small"
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select value={filters.status} label="Status" onChange={handleStatusChange}>
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="TRIAL">Trial</MenuItem>
                <MenuItem value="SUSPENDED">Suspended</MenuItem>
                <MenuItem value="CANCELLED">Cancelled</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Tier</InputLabel>
              <Select value={filters.tier} label="Tier" onChange={handleTierChange}>
                <MenuItem value="ALL">All Tiers</MenuItem>
                <MenuItem value="FREE">Free</MenuItem>
                <MenuItem value="BASIC">Basic</MenuItem>
                <MenuItem value="PROFESSIONAL">Professional</MenuItem>
                <MenuItem value="ENTERPRISE">Enterprise</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Tenants Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {tenantsQuery.isError ? (
            <Alert severity="error" sx={{ m: 2 }}>
              Failed to load tenants. Please try again.
            </Alert>
          ) : (
            <DataGrid
              rows={tenants}
              columns={columns}
              loading={tenantsQuery.isLoading}
              paginationMode="server"
              rowCount={pagination?.total || 0}
              pageSizeOptions={[10, 25, 50]}
              paginationModel={{
                page: Math.floor((filters.offset || 0) / (filters.limit || 25)),
                pageSize: filters.limit || 25,
              }}
              onPaginationModelChange={(model) => {
                setFilters((prev) => ({
                  ...prev,
                  offset: model.page * model.pageSize,
                  limit: model.pageSize,
                }));
              }}
              autoHeight
              disableRowSelectionOnClick
              sx={{
                border: 'none',
                '& .MuiDataGrid-cell:focus': {
                  outline: 'none',
                },
              }}
              slots={{
                loadingOverlay: () => (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      height: '100%',
                    }}
                  >
                    <CircularProgress />
                  </Box>
                ),
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Create Tenant Dialog */}
      <TenantDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      {/* Edit Tenant Dialog */}
      <TenantDialog
        open={!!editTenant}
        onClose={() => setEditTenant(null)}
        onSubmit={(data) => editTenant && updateMutation.mutate({ id: editTenant.id, data })}
        loading={updateMutation.isPending}
        tenant={editTenant}
      />

      {/* Suspend Tenant Dialog */}
      <SuspendDialog
        open={!!suspendTenant}
        onClose={() => setSuspendTenant(null)}
        onConfirm={(reason) => suspendTenant && suspendMutation.mutate({ id: suspendTenant.id, reason })}
        loading={suspendMutation.isPending}
        tenant={suspendTenant}
      />

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TenantsPage;
