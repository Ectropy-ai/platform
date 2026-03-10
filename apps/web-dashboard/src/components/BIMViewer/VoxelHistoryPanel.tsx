/**
 * VoxelHistoryPanel - Status change history for voxels
 *
 * Sprint 5 Phase 2 ROS MRO (2026-01-24)
 *
 * Displays the audit trail of status changes for a selected voxel:
 * - Chronological timeline of changes
 * - Status transitions with visual indicators
 * - User attribution and timestamps
 * - Notes and source information
 *
 * @module components/BIMViewer/VoxelHistoryPanel
 */

import React, { useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  History,
  ArrowForward,
  Person,
  Schedule,
  Note,
  Refresh,
  Info,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  PlayArrow,
  Pause,
  Block,
  Search,
} from '@mui/icons-material';
import { useVoxelHistory, VoxelStatusHistoryEntry } from '../../hooks/queries/useVoxels';

// ============================================================================
// TYPES
// ============================================================================

interface VoxelHistoryPanelProps {
  voxelId?: string;
  voxelName?: string;
  limit?: number;
  onEntryClick?: (entry: VoxelStatusHistoryEntry) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get color for voxel status
 */
function getStatusColor(status: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' {
  const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
    PLANNED: 'default',
    IN_PROGRESS: 'primary',
    COMPLETE: 'success',
    BLOCKED: 'error',
    ON_HOLD: 'warning',
    INSPECTION_REQUIRED: 'info',
  };
  return statusColors[status] || 'default';
}

/**
 * Get icon for voxel status
 */
function getStatusIcon(status: string): React.ReactElement {
  const statusIcons: Record<string, React.ReactElement> = {
    PLANNED: <Schedule fontSize="small" />,
    IN_PROGRESS: <PlayArrow fontSize="small" />,
    COMPLETE: <CheckCircle fontSize="small" />,
    BLOCKED: <Block fontSize="small" />,
    ON_HOLD: <Pause fontSize="small" />,
    INSPECTION_REQUIRED: <Search fontSize="small" />,
  };
  return statusIcons[status] || <Info fontSize="small" />;
}

/**
 * Get color for health status
 */
function getHealthColor(health: string | null): 'success' | 'warning' | 'error' | 'default' {
  if (!health) return 'default';
  const healthColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    HEALTHY: 'success',
    AT_RISK: 'warning',
    CRITICAL: 'error',
  };
  return healthColors[health] || 'default';
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format full timestamp for tooltip
 */
function formatFullTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get source display label
 */
function getSourceLabel(source: string | null): string {
  if (!source) return 'System';
  const sourceLabels: Record<string, string> = {
    web: 'Web Dashboard',
    api: 'API',
    mobile: 'Mobile App',
    speckle: 'Speckle Sync',
    batch: 'Batch Update',
    import: 'Data Import',
  };
  return sourceLabels[source] || source;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const VoxelHistoryPanel: React.FC<VoxelHistoryPanelProps> = ({
  voxelId,
  voxelName,
  limit = 50,
  onEntryClick,
}) => {
  // Fetch history data
  const { history, count, isLoading, error, refetch } = useVoxelHistory({
    voxelId,
    limit,
    enabled: !!voxelId,
  });

  // Memoize processed history entries
  const processedHistory = useMemo(() => {
    return history.map((entry) => ({
      ...entry,
      formattedTime: formatTimestamp(entry.timestamp),
      fullTime: formatFullTimestamp(entry.timestamp),
    }));
  }, [history]);

  // Empty state - no voxel selected
  if (!voxelId) {
    return (
      <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <History color="primary" />
          <Typography variant="h6">Status History</Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: 'text.secondary',
          }}
        >
          <History sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
          <Typography variant="body1" align="center">
            Select a voxel to view its status history
          </Typography>
          <Typography variant="body2" align="center" sx={{ mt: 1 }}>
            History shows all status changes with attribution
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <History color="primary" />
          <Typography variant="h6">Status History</Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  // Error state
  if (error) {
    return (
      <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <History color="primary" />
          <Typography variant="h6">Status History</Typography>
        </Box>

        <Alert
          severity="error"
          action={
            <IconButton color="inherit" size="small" onClick={() => refetch()}>
              <Refresh />
            </IconButton>
          }
        >
          Failed to load history: {error.message}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <History color="primary" />
            <Typography variant="h6">Status History</Typography>
            <Chip label={count} size="small" color="default" />
          </Box>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => refetch()}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
        {voxelName && (
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
            {voxelName}
          </Typography>
        )}
      </Box>

      {/* History List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {processedHistory.length === 0 ? (
          <Box
            sx={{
              p: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              color: 'text.secondary',
            }}
          >
            <Info sx={{ fontSize: 32, mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">No history entries found</Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {processedHistory.map((entry, index) => (
              <React.Fragment key={entry.id}>
                <ListItem
                  alignItems="flex-start"
                  sx={{
                    cursor: onEntryClick ? 'pointer' : 'default',
                    '&:hover': onEntryClick ? { bgcolor: 'action.hover' } : undefined,
                  }}
                  onClick={() => onEntryClick?.(entry)}
                >
                  <ListItemIcon sx={{ mt: 1, minWidth: 40 }}>
                    {getStatusIcon(entry.newStatus)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {/* Status transition */}
                        {entry.previousStatus && (
                          <>
                            <Chip
                              label={entry.previousStatus.replace('_', ' ')}
                              size="small"
                              color={getStatusColor(entry.previousStatus)}
                              variant="outlined"
                            />
                            <ArrowForward fontSize="small" color="action" />
                          </>
                        )}
                        <Chip
                          label={entry.newStatus.replace('_', ' ')}
                          size="small"
                          color={getStatusColor(entry.newStatus)}
                        />

                        {/* Health status change */}
                        {entry.newHealth && entry.newHealth !== entry.previousHealth && (
                          <Tooltip title={`Health: ${entry.previousHealth || 'N/A'} → ${entry.newHealth}`}>
                            <Chip
                              label={entry.newHealth}
                              size="small"
                              color={getHealthColor(entry.newHealth)}
                              variant="outlined"
                              sx={{ ml: 1 }}
                            />
                          </Tooltip>
                        )}

                        {/* Progress */}
                        {entry.percentComplete !== null && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            {entry.percentComplete}%
                          </Typography>
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        {/* Attribution */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          {entry.changedByName ? (
                            <Tooltip title={entry.changedById || 'User ID unknown'}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Person fontSize="inherit" />
                                <Typography variant="caption">{entry.changedByName}</Typography>
                              </Box>
                            </Tooltip>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled' }}>
                              <Person fontSize="inherit" />
                              <Typography variant="caption">System</Typography>
                            </Box>
                          )}

                          <Typography variant="caption" color="text.disabled">•</Typography>

                          <Tooltip title={entry.fullTime}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Schedule fontSize="inherit" />
                              <Typography variant="caption">{entry.formattedTime}</Typography>
                            </Box>
                          </Tooltip>

                          {entry.source && (
                            <>
                              <Typography variant="caption" color="text.disabled">•</Typography>
                              <Typography variant="caption" color="text.secondary">
                                via {getSourceLabel(entry.source)}
                              </Typography>
                            </>
                          )}
                        </Box>

                        {/* Note */}
                        {entry.note && (
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.5 }}>
                            <Note fontSize="inherit" sx={{ mt: 0.25, color: 'text.secondary' }} />
                            <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                              {entry.note}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
                {index < processedHistory.length - 1 && <Divider component="li" variant="inset" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      {/* Footer with count info */}
      {count > limit && (
        <Box
          sx={{
            p: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Showing {processedHistory.length} of {count} entries
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default VoxelHistoryPanel;
