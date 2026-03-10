import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Description,
  Refresh,
  MoreVert,
  Visibility,
  PlayArrow,
  Delete,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Schedule,
  HourglassEmpty,
} from '@mui/icons-material';

/**
 * Contract document summary
 */
interface ContractSummary {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: 'pending' | 'parsing' | 'parsed' | 'reviewed' | 'active' | 'error';
  confidence?: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Props for ContractList
 */
interface ContractListProps {
  projectId: string;
  onSelectContract?: (contractId: string) => void;
  onApplyContract?: (contractId: string) => void;
  apiBaseUrl?: string;
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format date relative
 */
function formatDateRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Get status chip props
 */
function getStatusChipProps(status: string): {
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  icon: React.ReactElement;
  label: string;
} {
  switch (status) {
    case 'pending':
      return { color: 'default', icon: <HourglassEmpty fontSize="small" />, label: 'Pending' };
    case 'parsing':
      return { color: 'info', icon: <Schedule fontSize="small" />, label: 'Parsing' };
    case 'parsed':
      return { color: 'warning', icon: <Warning fontSize="small" />, label: 'Needs Review' };
    case 'reviewed':
      return { color: 'info', icon: <CheckCircle fontSize="small" />, label: 'Reviewed' };
    case 'active':
      return { color: 'success', icon: <CheckCircle fontSize="small" />, label: 'Active' };
    case 'error':
      return { color: 'error', icon: <ErrorIcon fontSize="small" />, label: 'Error' };
    default:
      return { color: 'default', icon: <HourglassEmpty fontSize="small" />, label: status };
  }
}

/**
 * Get file type from MIME
 */
function getFileType(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
  if (mimeType.includes('text')) return 'TXT';
  return 'DOC';
}

/**
 * Contract List Component
 *
 * Displays a list of uploaded contracts for a project with status and actions.
 */
const ContractList: React.FC<ContractListProps> = ({
  projectId,
  onSelectContract,
  onApplyContract,
  apiBaseUrl = '/api',
}) => {
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedContract, setSelectedContract] = useState<string | null>(null);

  // Fetch contracts
  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${projectId}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setContracts(data.contracts || []);
      } else {
        throw new Error(data.error || 'Failed to load contracts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, [projectId, apiBaseUrl]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // Handle menu open
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, contractId: string) => {
    setMenuAnchor(event.currentTarget);
    setSelectedContract(contractId);
  };

  // Handle menu close
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedContract(null);
  };

  // Handle view contract
  const handleView = () => {
    if (selectedContract && onSelectContract) {
      onSelectContract(selectedContract);
    }
    handleMenuClose();
  };

  // Handle apply contract
  const handleApply = async () => {
    if (selectedContract && onApplyContract) {
      onApplyContract(selectedContract);
    }
    handleMenuClose();
  };

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading contracts...</Typography>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert
            severity="error"
            action={
              <Button size="small" onClick={fetchContracts}>
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Description />
            Contracts ({contracts.length})
          </Typography>
          <Button startIcon={<Refresh />} onClick={fetchContracts} size="small">
            Refresh
          </Button>
        </Box>

        {/* Empty state */}
        {contracts.length === 0 ? (
          <Alert severity="info">
            No contracts uploaded yet. Upload a contract document to get started.
          </Alert>
        ) : (
          /* Contracts table */
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Document</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Uploaded</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contracts.map((contract) => {
                  const statusProps = getStatusChipProps(contract.status);

                  return (
                    <TableRow
                      key={contract.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => onSelectContract?.(contract.id)}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Description color="action" fontSize="small" />
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {contract.originalName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatFileSize(contract.fileSize)}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={getFileType(contract.mimeType)} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={statusProps.icon}
                          label={statusProps.label}
                          color={statusProps.color}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {contract.confidence !== undefined ? (
                          <Tooltip title={`Extraction confidence: ${(contract.confidence * 100).toFixed(0)}%`}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Box
                                sx={{
                                  width: 40,
                                  height: 6,
                                  borderRadius: 1,
                                  bgcolor: 'action.hover',
                                  overflow: 'hidden',
                                }}
                              >
                                <Box
                                  sx={{
                                    width: `${contract.confidence * 100}%`,
                                    height: '100%',
                                    bgcolor:
                                      contract.confidence >= 0.8
                                        ? 'success.main'
                                        : contract.confidence >= 0.6
                                        ? 'warning.main'
                                        : 'error.main',
                                  }}
                                />
                              </Box>
                              <Typography variant="caption">
                                {(contract.confidence * 100).toFixed(0)}%
                              </Typography>
                            </Box>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateRelative(contract.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMenuOpen(e, contract.id);
                          }}
                        >
                          <MoreVert fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Action Menu */}
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
          <MenuItem onClick={handleView}>
            <ListItemIcon>
              <Visibility fontSize="small" />
            </ListItemIcon>
            <ListItemText>View Details</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={handleApply}
            disabled={
              !contracts.find((c) => c.id === selectedContract && (c.status === 'parsed' || c.status === 'reviewed'))
            }
          >
            <ListItemIcon>
              <PlayArrow fontSize="small" />
            </ListItemIcon>
            <ListItemText>Apply to Project</ListItemText>
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
};

export default ContractList;
