/**
 * ScenarioManager - Enterprise Demo Scenario Management UI
 *
 * DEMO PIPELINE (Sprint 2 - 2026-01-23)
 *
 * Provides a comprehensive UI for:
 * - Browsing available demo scenarios
 * - Instantiating scenarios for live demos
 * - Managing active scenario instances
 * - Controlling playback with timeline navigation
 *
 * @example
 * ```tsx
 * // In AdminDashboard
 * <ScenarioManager />
 * ```
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Skeleton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Refresh as ResetIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Speed as SpeedIcon,
  SkipNext as SkipNextIcon,
  Info as InfoIcon,
  Person as PersonIcon,
  Timeline as TimelineIcon,
  Flag as MilestoneIcon,
} from '@mui/icons-material';

import {
  useScenarios,
  useScenarioDetails,
  useScenarioInstances,
  useInstantiateScenario,
  useDeleteScenarioInstance,
  usePlayback,
  type DemoScenario,
  type ScenarioInstance,
  type PlaybackSpeed,
} from '../../hooks/queries';
import {
  usePlaybackWebSocket,
  type WebSocketConnectionState,
} from '../../hooks/usePlaybackWebSocket';
import { logger } from '../../services/logger';

// ============================================================================
// TYPES
// ============================================================================

interface ScenarioCardProps {
  scenario: DemoScenario;
  onInstantiate: (scenarioId: string) => void;
  onViewDetails: (scenarioId: string) => void;
}

interface InstanceCardProps {
  instance: ScenarioInstance;
  onDelete: (instanceId: string) => void;
  onSelect: (instanceId: string) => void;
  isSelected: boolean;
}

interface PlaybackControlsProps {
  instanceId: string;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Card displaying a single scenario template
 */
const ScenarioCard: React.FC<ScenarioCardProps> = ({
  scenario,
  onInstantiate,
  onViewDetails,
}) => {
  const complexityColor = {
    low: 'success',
    medium: 'warning',
    high: 'error',
  }[scenario.complexity] as 'success' | 'warning' | 'error';

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': { boxShadow: 4 },
        transition: 'box-shadow 0.2s',
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
          <Typography variant="h6" component="h3">
            {scenario.name}
          </Typography>
          <Chip
            label={scenario.complexity}
            color={complexityColor}
            size="small"
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {scenario.description}
        </Typography>

        <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
          <Chip
            icon={<TimelineIcon />}
            label={`${scenario.duration.weeks} weeks`}
            size="small"
            variant="outlined"
          />
          <Chip
            icon={<MilestoneIcon />}
            label={`${scenario.milestonesCount} milestones`}
            size="small"
            variant="outlined"
          />
          <Chip
            icon={<PersonIcon />}
            label={`${scenario.personas.length} personas`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Typography variant="caption" color="text.secondary">
          {scenario.eventsCount} timeline events
        </Typography>
      </CardContent>

      <CardActions>
        <Button
          size="small"
          startIcon={<InfoIcon />}
          onClick={() => onViewDetails(scenario.id)}
        >
          Details
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => onInstantiate(scenario.id)}
        >
          Start Demo
        </Button>
      </CardActions>
    </Card>
  );
};

/**
 * Card displaying an active scenario instance
 */
const InstanceCard: React.FC<InstanceCardProps> = ({
  instance,
  onDelete,
  onSelect,
  isSelected,
}) => {
  const stateColors = {
    ready: 'default',
    playing: 'success',
    paused: 'warning',
    completed: 'info',
  } as const;

  const position = instance.currentPosition;
  const progress =
    ((position.week - 1) * 7 * 24 + (position.day - 1) * 24 + position.hour) /
    (8 * 7 * 24); // Assuming 8 weeks max

  return (
    <Card
      sx={{
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? 'primary.main' : 'divider',
        cursor: 'pointer',
        '&:hover': { borderColor: 'primary.light' },
      }}
      onClick={() => onSelect(instance.id)}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle1" fontWeight="medium">
            {instance.scenarioName || instance.scenarioId}
          </Typography>
          <Chip
            label={instance.state}
            color={stateColors[instance.state]}
            size="small"
          />
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Week {position.week}, Day {position.day}, Hour {position.hour}
        </Typography>

        <LinearProgress
          variant="determinate"
          value={progress * 100}
          sx={{ mb: 1 }}
        />

        {instance.recordCounts && (
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip
              label={`${instance.recordCounts.users} users`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${instance.recordCounts.decisions} decisions`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${instance.recordCounts.voxels} voxels`}
              size="small"
              variant="outlined"
            />
          </Box>
        )}
      </CardContent>

      <CardActions>
        <IconButton
          size="small"
          color="error"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(instance.id);
          }}
        >
          <DeleteIcon />
        </IconButton>
      </CardActions>
    </Card>
  );
};

/**
 * WebSocket connection status indicator
 */
const ConnectionStatus: React.FC<{ state: WebSocketConnectionState }> = ({ state }) => {
  const statusColors: Record<WebSocketConnectionState, 'success' | 'warning' | 'error' | 'default'> = {
    connected: 'success',
    connecting: 'warning',
    reconnecting: 'warning',
    disconnected: 'default',
    error: 'error',
  };

  const statusLabels: Record<WebSocketConnectionState, string> = {
    connected: 'Live',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    disconnected: 'Offline',
    error: 'Error',
  };

  return (
    <Tooltip title={`WebSocket: ${statusLabels[state]}`}>
      <Chip
        size="small"
        label={statusLabels[state]}
        color={statusColors[state]}
        sx={{ ml: 1, fontSize: '0.7rem' }}
      />
    </Tooltip>
  );
};

/**
 * Playback controls for an active instance
 * Enhanced with WebSocket for real-time updates
 */
const PlaybackControls: React.FC<PlaybackControlsProps> = ({ instanceId }) => {
  // React Query hook for fallback polling
  const {
    instance,
    isLoading,
    isPending,
    state: queryState,
    position: queryPosition,
    play: queryPlay,
    pause: queryPause,
    stop: queryStop,
    reset: queryReset,
    setSpeed: querySetSpeed,
  } = usePlayback(instanceId);

  // WebSocket hook for real-time updates
  const {
    connectionState,
    isConnected,
    playbackState: wsPlaybackState,
    lastUpdate,
    sendControl: wsSendControl,
  } = usePlaybackWebSocket({
    instanceId,
    onPlaybackUpdate: (update) => {
      logger.debug('Real-time playback update', { type: update.type, instanceId });
    },
    onError: (error) => {
      logger.warn('WebSocket error, falling back to polling', { error });
    },
  });

  // Use WebSocket state when connected, otherwise fall back to polling
  const state = isConnected && wsPlaybackState?.isPlaying !== undefined
    ? (wsPlaybackState.isPlaying ? 'playing' : (instance?.state || 'ready'))
    : queryState;

  const position = isConnected && wsPlaybackState?.position
    ? wsPlaybackState.position
    : queryPosition;

  // Control handlers - prefer WebSocket when connected
  const play = useCallback(() => {
    if (isConnected) {
      wsSendControl('play');
    } else {
      queryPlay();
    }
  }, [isConnected, wsSendControl, queryPlay]);

  const pause = useCallback(() => {
    if (isConnected) {
      wsSendControl('pause');
    } else {
      queryPause();
    }
  }, [isConnected, wsSendControl, queryPause]);

  const stop = useCallback(() => {
    if (isConnected) {
      wsSendControl('stop');
    } else {
      queryStop();
    }
  }, [isConnected, wsSendControl, queryStop]);

  const reset = useCallback(() => {
    if (isConnected) {
      wsSendControl('reset');
    } else {
      queryReset();
    }
  }, [isConnected, wsSendControl, queryReset]);

  const speeds: PlaybackSpeed[] = [1, 2, 5, 10, 20, 50, 100];
  const [currentSpeed, setCurrentSpeedState] = useState<PlaybackSpeed>(10);

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setCurrentSpeedState(speed);
    if (isConnected) {
      wsSendControl('play', speed); // WebSocket uses speed in the control message
    } else {
      querySetSpeed(speed);
    }
  }, [isConnected, wsSendControl, querySetSpeed]);

  if (isLoading || !instance) {
    return <Skeleton variant="rectangular" height={100} />;
  }

  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle2">
          Playback Controls
        </Typography>
        <ConnectionStatus state={connectionState} />
      </Box>

      <Box display="flex" alignItems="center" gap={1} mb={2}>
        {state === 'playing' ? (
          <Tooltip title="Pause">
            <IconButton onClick={pause} disabled={isPending}>
              <PauseIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Play">
            <IconButton onClick={play} disabled={isPending}>
              <PlayIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Stop">
          <IconButton onClick={stop} disabled={isPending}>
            <StopIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Reset to Beginning">
          <IconButton onClick={reset} disabled={isPending}>
            <ResetIcon />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Box display="flex" alignItems="center" gap={0.5}>
          <SpeedIcon fontSize="small" color="action" />
          {speeds.map((speed) => (
            <Chip
              key={speed}
              label={`${speed}x`}
              size="small"
              color={currentSpeed === speed ? 'primary' : 'default'}
              onClick={() => handleSpeedChange(speed)}
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Box>

      {position && (
        <Typography variant="body2" color="text.secondary">
          Position: Week {position.week}, Day {position.day}, Hour {position.hour}
          {isConnected && lastUpdate && (
            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'success.main' }}>
              (live)
            </Typography>
          )}
        </Typography>
      )}
    </Paper>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ScenarioManager: React.FC = () => {
  // State
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsScenarioId, setDetailsScenarioId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);

  // Queries
  const { scenarios, isLoading: loadingScenarios, error: scenariosError } = useScenarios();
  const { instances, isLoading: loadingInstances, error: instancesError } = useScenarioInstances();
  const { scenario: scenarioDetails } = useScenarioDetails(detailsScenarioId || undefined, {
    enabled: !!detailsScenarioId,
  });

  // Mutations
  const instantiate = useInstantiateScenario();
  const deleteInstance = useDeleteScenarioInstance();

  // Handlers
  const handleInstantiate = useCallback(
    (scenarioId: string) => {
      logger.info('Instantiating scenario', { scenarioId });
      instantiate.mutate(
        { scenarioId },
        {
          onSuccess: (instance) => {
            setSelectedInstanceId(instance.id);
          },
        }
      );
    },
    [instantiate]
  );

  const handleViewDetails = useCallback((scenarioId: string) => {
    setDetailsScenarioId(scenarioId);
    setDetailsDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((instanceId: string) => {
    setInstanceToDelete(instanceId);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (instanceToDelete) {
      deleteInstance.mutate(
        { instanceId: instanceToDelete, deleteGeneratedData: true },
        {
          onSuccess: () => {
            if (selectedInstanceId === instanceToDelete) {
              setSelectedInstanceId(null);
            }
          },
        }
      );
    }
    setDeleteDialogOpen(false);
    setInstanceToDelete(null);
  }, [instanceToDelete, deleteInstance, selectedInstanceId]);

  // Loading state
  if (loadingScenarios || loadingInstances) {
    return (
      <Box>
        <Typography variant="h5" gutterBottom>
          Demo Scenario Manager
        </Typography>
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={200} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Error state
  if (scenariosError || instancesError) {
    return (
      <Alert severity="error">
        Failed to load scenario data. Please try again.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Demo Scenario Manager
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Create and manage synthetic demo data for sales presentations
      </Typography>

      {/* Error alerts */}
      {instantiate.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to instantiate scenario: {(instantiate.error as Error).message}
        </Alert>
      )}

      {/* Available Scenarios */}
      <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
        Available Scenarios
      </Typography>
      <Grid container spacing={2}>
        {scenarios.map((scenario) => (
          <Grid item xs={12} sm={6} md={4} key={scenario.id}>
            <ScenarioCard
              scenario={scenario}
              onInstantiate={handleInstantiate}
              onViewDetails={handleViewDetails}
            />
          </Grid>
        ))}
        {scenarios.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">
              No demo scenarios available. Scenarios are loaded from the demo-scenarios library.
            </Alert>
          </Grid>
        )}
      </Grid>

      {/* Active Instances */}
      <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
        Active Demo Instances ({instances.length})
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <List>
            {instances.map((instance) => (
              <ListItem key={instance.id} sx={{ p: 0, mb: 1 }}>
                <InstanceCard
                  instance={instance}
                  onDelete={handleDeleteClick}
                  onSelect={setSelectedInstanceId}
                  isSelected={selectedInstanceId === instance.id}
                />
              </ListItem>
            ))}
            {instances.length === 0 && (
              <Alert severity="info">
                No active demo instances. Start a demo by clicking &quot;Start Demo&quot; on a scenario.
              </Alert>
            )}
          </List>
        </Grid>

        {/* Playback Controls */}
        <Grid item xs={12} md={6}>
          {selectedInstanceId ? (
            <PlaybackControls instanceId={selectedInstanceId} />
          ) : (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Select an instance to control playback
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Scenario Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{scenarioDetails?.name || 'Loading...'}</DialogTitle>
        <DialogContent>
          {scenarioDetails ? (
            <Box>
              <Typography variant="body1" paragraph>
                {scenarioDetails.description}
              </Typography>

              <Typography variant="subtitle2" gutterBottom>
                Duration
              </Typography>
              <Typography variant="body2" paragraph>
                {scenarioDetails.duration.weeks} weeks - {scenarioDetails.duration.description}
              </Typography>

              <Typography variant="subtitle2" gutterBottom>
                Personas ({scenarioDetails.personas.length})
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                {scenarioDetails.personas.map((p) => (
                  <Chip key={p.id} label={`${p.name} (${p.role})`} variant="outlined" />
                ))}
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                Milestones ({scenarioDetails.milestones.length})
              </Typography>
              <List dense>
                {scenarioDetails.milestones.map((m) => (
                  <ListItem key={m.id}>
                    <ListItemText
                      primary={m.name}
                      secondary={`Week ${m.position.week}, Day ${m.position.day} - ${m.description}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <Skeleton variant="rectangular" height={300} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          {scenarioDetails && (
            <Button
              variant="contained"
              onClick={() => {
                handleInstantiate(scenarioDetails.id);
                setDetailsDialogOpen(false);
              }}
            >
              Start Demo
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Demo Instance?</DialogTitle>
        <DialogContent>
          <Typography>
            This will delete the demo instance and all generated data. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={deleteInstance.isPending}
          >
            {deleteInstance.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScenarioManager;
