/**
 * ==============================================================================
 * USERS PAGE
 * ==============================================================================
 * Cross-tenant user management with authorization workflow.
 * Enables Ectropy staff to authorize pending users for demo access.
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
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Autocomplete,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Search,
  CheckCircle,
  Cancel,
  Person,
  Business,
  PersonAdd,
  PlayArrow,
} from '@mui/icons-material';

import { consoleApi } from '../services/console-api';
import type {
  ConsoleUser,
  ConsoleFilters,
  InviteUserRequest,
  StakeholderRole,
  Tenant,
  ProvisionDemoRequest,
  CatalogBuildingType,
} from '../types/console.types';

// ==============================================================================
// Authorization Dialog
// ==============================================================================

interface AuthDialogProps {
  open: boolean;
  user: ConsoleUser | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

const AuthorizeDialog: React.FC<AuthDialogProps> = ({
  open,
  user,
  onClose,
  onConfirm,
  loading,
}) => {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(reason);
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Authorize User</DialogTitle>
      <DialogContent>
        {user && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Authorize the following user for platform access:
            </Typography>
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              <Typography variant="body1" fontWeight={600}>
                {user.email}
              </Typography>
              {user.fullName && (
                <Typography variant="body2" color="text.secondary">
                  {user.fullName}
                </Typography>
              )}
              {user.tenant && (
                <Chip
                  label={user.tenant.name}
                  size="small"
                  sx={{ mt: 1 }}
                  icon={<Business fontSize="small" />}
                />
              )}
            </Box>
          </Box>
        )}
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Reason (optional)"
          placeholder="e.g., Demo participant, Trial partner approved..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Optional note for audit trail"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleConfirm}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckCircle />}
        >
          Authorize
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// Revoke Dialog
// ==============================================================================

interface RevokeDialogProps {
  open: boolean;
  user: ConsoleUser | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

const RevokeDialog: React.FC<RevokeDialogProps> = ({
  open,
  user,
  onClose,
  onConfirm,
  loading,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('Reason is required for revocation');
      return;
    }
    onConfirm(reason);
    setReason('');
    setError('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Revoke Authorization</DialogTitle>
      <DialogContent>
        {user && (
          <Box sx={{ mb: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This will revoke platform access for this user.
            </Alert>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              <Typography variant="body1" fontWeight={600}>
                {user.email}
              </Typography>
              {user.fullName && (
                <Typography variant="body2" color="text.secondary">
                  {user.fullName}
                </Typography>
              )}
            </Box>
          </Box>
        )}
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Reason (required)"
          placeholder="e.g., Trial ended, Access no longer needed..."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          error={!!error}
          helperText={error || 'Required for compliance audit trail'}
          required
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={loading || !reason.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : <Cancel />}
        >
          Revoke Access
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// Invite User Dialog
// ==============================================================================

const ROLES: { value: StakeholderRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'architect', label: 'Architect' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'site_manager', label: 'Site Manager' },
  { value: 'admin', label: 'Admin' },
];

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: InviteUserRequest) => void;
  loading: boolean;
  tenants: Tenant[];
  tenantsLoading: boolean;
}

const InviteUserDialog: React.FC<InviteDialogProps> = ({
  open,
  onClose,
  onSubmit,
  loading,
  tenants,
  tenantsLoading,
}) => {
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [role, setRole] = React.useState<StakeholderRole>('architect');
  const [selectedTenant, setSelectedTenant] = React.useState<Tenant | null>(
    null
  );
  const [sendEmail, setSendEmail] = React.useState(true);
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<{ email?: string }>({});

  const handleClose = () => {
    setEmail('');
    setFullName('');
    setRole('architect');
    setSelectedTenant(null);
    setSendEmail(true);
    setReason('');
    setErrors({});
    onClose();
  };

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleSubmit = () => {
    // Validate
    if (!email.trim()) {
      setErrors({ email: 'Email is required' });
      return;
    }
    if (!validateEmail(email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    onSubmit({
      email: email.trim(),
      fullName: fullName.trim() || undefined,
      role,
      tenantId: selectedTenant?.id,
      sendEmail,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonAdd />
          Invite New User
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            fullWidth
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors({});
            }}
            error={!!errors.email}
            helperText={
              errors.email || 'User will receive an invitation to this email'
            }
            required
            autoFocus
          />

          <TextField
            fullWidth
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            helperText="Optional - user can set this on first login"
          />

          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select
              value={role}
              label="Role"
              onChange={(e) => setRole(e.target.value as StakeholderRole)}
            >
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            options={tenants}
            getOptionLabel={(option) => `${option.name} (${option.slug})`}
            value={selectedTenant}
            onChange={(_, newValue) => setSelectedTenant(newValue)}
            loading={tenantsLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Assign to Tenant"
                helperText="Optional - assign user to a specific tenant"
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.slug} • {option.subscriptionTier}
                  </Typography>
                </Box>
              </li>
            )}
          />

          <TextField
            fullWidth
            label="Notes"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            helperText="Internal notes for audit trail (optional)"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
            }
            label="Send invitation email"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !email.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : <PersonAdd />}
        >
          Invite User
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// Provision Demo Dialog
// ==============================================================================

const BUILDING_TYPES: { value: CatalogBuildingType; label: string; icon: string; description: string }[] = [
  {
    value: 'residential-single-family',
    label: 'Single Family Residential',
    icon: '🏠',
    description: 'Standard single-family home with ~$250K budget'
  },
  {
    value: 'residential-multi-family',
    label: 'Multi-Family Residential',
    icon: '🏘️',
    description: 'Apartment or townhouse complex with ~$2M budget'
  },
  {
    value: 'commercial-office',
    label: 'Commercial Office',
    icon: '🏢',
    description: 'Office building with ~$5M budget'
  },
  {
    value: 'commercial-large',
    label: 'Large Commercial',
    icon: '🏗️',
    description: 'Large commercial complex with ~$15M budget'
  },
];

interface ProvisionDemoDialogProps {
  open: boolean;
  user: ConsoleUser | null;
  onClose: () => void;
  onSubmit: (data: ProvisionDemoRequest) => void;
  loading: boolean;
}

const ProvisionDemoDialog: React.FC<ProvisionDemoDialogProps> = ({
  open,
  user,
  onClose,
  onSubmit,
  loading,
}) => {
  const [buildingType, setBuildingType] = React.useState<CatalogBuildingType>('commercial-office');
  const [projectName, setProjectName] = React.useState('');
  const [sendWelcomeEmail, setSendWelcomeEmail] = React.useState(true);

  const handleClose = () => {
    setBuildingType('commercial-office');
    setProjectName('');
    setSendWelcomeEmail(true);
    onClose();
  };

  const handleSubmit = () => {
    onSubmit({
      buildingType,
      projectName: projectName.trim() || undefined,
      sendWelcomeEmail,
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlayArrow color="primary" />
          Provision Demo Project
        </Box>
      </DialogTitle>
      <DialogContent>
        {user && (
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              This will set up a complete demo environment for this user:
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                <li>Authorize the user (if not already)</li>
                <li>Create a trial tenant (if user has none)</li>
                <li>Create a demo project with BIM model</li>
                <li>Send welcome email (optional)</li>
              </ul>
            </Alert>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              <Typography variant="body1" fontWeight={600}>
                {user.email}
              </Typography>
              {user.fullName && (
                <Typography variant="body2" color="text.secondary">
                  {user.fullName}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip
                  label={user.isAuthorized ? 'Authorized' : 'Not Authorized'}
                  size="small"
                  color={user.isAuthorized ? 'success' : 'warning'}
                />
                {user.tenant ? (
                  <Chip
                    label={user.tenant.name}
                    size="small"
                    icon={<Business fontSize="small" />}
                  />
                ) : (
                  <Chip label="No Tenant" size="small" variant="outlined" />
                )}
              </Box>
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <FormControl fullWidth>
            <InputLabel>Building Type</InputLabel>
            <Select
              value={buildingType}
              label="Building Type"
              onChange={(e) => setBuildingType(e.target.value as CatalogBuildingType)}
            >
              {BUILDING_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{type.icon}</span>
                    <Box>
                      <Typography variant="body2">{type.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {type.description}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Custom Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g., Partner Demo - ACME Corp"
            helperText="Optional - defaults to building type name"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={sendWelcomeEmail}
                onChange={(e) => setSendWelcomeEmail(e.target.checked)}
              />
            }
            label="Send welcome email with login instructions"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <PlayArrow />}
        >
          Provision Demo
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ==============================================================================
// DataGrid Columns
// ==============================================================================

const createColumns = (
  onAuthorize: (user: ConsoleUser) => void,
  onRevoke: (user: ConsoleUser) => void,
  onProvisionDemo: (user: ConsoleUser) => void
): GridColDef<ConsoleUser>[] => [
  {
    field: 'email',
    headerName: 'User',
    flex: 1,
    minWidth: 250,
    renderCell: (params: GridRenderCellParams<ConsoleUser>) => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Person fontSize="small" color="action" />
        <Box>
          <Typography variant="body2" fontWeight={500}>
            {params.row.email}
          </Typography>
          {params.row.fullName && (
            <Typography variant="caption" color="text.secondary">
              {params.row.fullName}
            </Typography>
          )}
        </Box>
      </Box>
    ),
  },
  {
    field: 'tenant',
    headerName: 'Tenant',
    width: 180,
    renderCell: (params: GridRenderCellParams<ConsoleUser>) =>
      params.row.tenant ? (
        <Chip
          label={params.row.tenant.name}
          size="small"
          icon={<Business fontSize="small" />}
        />
      ) : (
        <Typography variant="caption" color="text.secondary">
          No tenant
        </Typography>
      ),
  },
  {
    field: 'isAuthorized',
    headerName: 'Status',
    width: 130,
    renderCell: (params: GridRenderCellParams<ConsoleUser>) =>
      params.row.isAuthorized ? (
        <Chip label="Authorized" color="success" size="small" />
      ) : (
        <Chip label="Pending" color="warning" size="small" />
      ),
  },
  {
    field: 'role',
    headerName: 'Role',
    width: 120,
    renderCell: (params: GridRenderCellParams<ConsoleUser>) => (
      <Chip
        label={params.row.role}
        size="small"
        variant="outlined"
        sx={{ textTransform: 'capitalize' }}
      />
    ),
  },
  {
    field: 'lastLogin',
    headerName: 'Last Login',
    width: 130,
    valueGetter: (value) =>
      value ? new Date(value).toLocaleDateString() : 'Never',
  },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 160,
    sortable: false,
    renderCell: (params: GridRenderCellParams<ConsoleUser>) => (
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title="Provision demo project">
          <IconButton
            size="small"
            color="primary"
            onClick={() => onProvisionDemo(params.row)}
          >
            <PlayArrow />
          </IconButton>
        </Tooltip>
        {!params.row.isAuthorized ? (
          <Tooltip title="Authorize user">
            <IconButton
              size="small"
              color="success"
              onClick={() => onAuthorize(params.row)}
            >
              <CheckCircle />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Revoke authorization">
            <IconButton
              size="small"
              color="error"
              onClick={() => onRevoke(params.row)}
              disabled={params.row.isPlatformAdmin}
            >
              <Cancel />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    ),
  },
];

// ==============================================================================
// Users Page
// ==============================================================================

const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();

  // State
  const [filters, setFilters] = useState<ConsoleFilters>({
    search: '',
    authorized: 'ALL',
    limit: 25,
    offset: 0,
  });
  const [authorizeDialog, setAuthorizeDialog] = useState<ConsoleUser | null>(
    null
  );
  const [revokeDialog, setRevokeDialog] = useState<ConsoleUser | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [provisionDemoDialog, setProvisionDemoDialog] = useState<ConsoleUser | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Fetch users
  const usersQuery = useQuery({
    queryKey: ['console', 'users', filters],
    queryFn: () => consoleApi.getUsers(filters),
  });

  // Fetch tenants for invite dialog
  const tenantsQuery = useQuery({
    queryKey: ['console', 'tenants', 'list'],
    queryFn: () => consoleApi.getTenants({ limit: 100 }),
    enabled: inviteDialogOpen, // Only fetch when dialog is open
  });

  // Authorize mutation
  const authorizeMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      consoleApi.authorizeUser({ userId, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['console', 'users'] });
      setAuthorizeDialog(null);
      setSnackbar({
        open: true,
        message: 'User authorized successfully',
        severity: 'success',
      });
    },
    onError: (error) => {
      setSnackbar({
        open: true,
        message: `Failed to authorize user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      consoleApi.revokeUser({ userId, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['console', 'users'] });
      setRevokeDialog(null);
      setSnackbar({
        open: true,
        message: 'Authorization revoked',
        severity: 'success',
      });
    },
    onError: (error) => {
      setSnackbar({
        open: true,
        message: `Failed to revoke authorization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    },
  });

  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: (data: InviteUserRequest) => consoleApi.inviteUser(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['console', 'users'] });
      setInviteDialogOpen(false);
      const emailSent = response.data?.invitationSent
        ? ' Invitation email sent.'
        : '';
      setSnackbar({
        open: true,
        message: `User ${response.data?.email} invited successfully.${emailSent}`,
        severity: 'success',
      });
    },
    onError: (error) => {
      setSnackbar({
        open: true,
        message: `Failed to invite user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    },
  });

  // Provision demo mutation
  const provisionDemoMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: ProvisionDemoRequest }) =>
      consoleApi.provisionDemo(userId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['console', 'users'] });
      setProvisionDemoDialog(null);
      const projectName = response.data?.project?.name || 'Demo project';
      const emailSent = response.data?.welcomeEmailSent ? ' Welcome email sent.' : '';
      setSnackbar({
        open: true,
        message: `${projectName} provisioned successfully.${emailSent}`,
        severity: 'success',
      });
    },
    onError: (error) => {
      setSnackbar({
        open: true,
        message: `Failed to provision demo: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });
    },
  });

  const users = usersQuery.data?.data?.users || [];
  const pagination = usersQuery.data?.data?.pagination;

  const columns = createColumns(
    (user) => setAuthorizeDialog(user),
    (user) => setRevokeDialog(user),
    (user) => setProvisionDemoDialog(user)
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: event.target.value, offset: 0 }));
  };

  const handleAuthStatusChange = (event: any) => {
    const value = event.target.value;
    setFilters((prev) => ({
      ...prev,
      authorized: value === 'ALL' ? 'ALL' : value === 'true',
      offset: 0,
    }));
  };

  // Stats
  const pendingCount = users.filter((u) => !u.isAuthorized).length;
  const authorizedCount = users.filter((u) => u.isAuthorized).length;

  return (
    <Box>
      {/* Page Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={600} gutterBottom>
            Users
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage user authorization across all tenants
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={`${authorizedCount} authorized`}
              color="success"
              variant="outlined"
            />
            <Chip
              label={`${pendingCount} pending`}
              color="warning"
              variant="outlined"
            />
          </Box>
          <Button
            variant="contained"
            startIcon={<PersonAdd />}
            onClick={() => setInviteDialogOpen(true)}
          >
            Invite User
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              placeholder="Search by email or name..."
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
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Authorization Status</InputLabel>
              <Select
                value={
                  filters.authorized === 'ALL'
                    ? 'ALL'
                    : String(filters.authorized)
                }
                label="Authorization Status"
                onChange={handleAuthStatusChange}
              >
                <MenuItem value="ALL">All Users</MenuItem>
                <MenuItem value="false">Pending Authorization</MenuItem>
                <MenuItem value="true">Authorized</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          {usersQuery.isError ? (
            <Alert severity="error" sx={{ m: 2 }}>
              Failed to load users. Please try again.
            </Alert>
          ) : (
            <DataGrid
              rows={users}
              columns={columns}
              loading={usersQuery.isLoading}
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

      {/* Dialogs */}
      <AuthorizeDialog
        open={!!authorizeDialog}
        user={authorizeDialog}
        onClose={() => setAuthorizeDialog(null)}
        onConfirm={(reason) =>
          authorizeMutation.mutate({ userId: authorizeDialog!.id, reason })
        }
        loading={authorizeMutation.isPending}
      />

      <RevokeDialog
        open={!!revokeDialog}
        user={revokeDialog}
        onClose={() => setRevokeDialog(null)}
        onConfirm={(reason) =>
          revokeMutation.mutate({ userId: revokeDialog!.id, reason })
        }
        loading={revokeMutation.isPending}
      />

      <InviteUserDialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        onSubmit={(data) => inviteMutation.mutate(data)}
        loading={inviteMutation.isPending}
        tenants={tenantsQuery.data?.data?.tenants || []}
        tenantsLoading={tenantsQuery.isLoading}
      />

      <ProvisionDemoDialog
        open={!!provisionDemoDialog}
        user={provisionDemoDialog}
        onClose={() => setProvisionDemoDialog(null)}
        onSubmit={(data) =>
          provisionDemoMutation.mutate({ userId: provisionDemoDialog!.id, data })
        }
        loading={provisionDemoMutation.isPending}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
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

export default UsersPage;
