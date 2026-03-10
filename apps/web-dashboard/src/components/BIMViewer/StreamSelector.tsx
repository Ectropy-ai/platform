/**
 * Stream Selector Component
 * Enterprise-grade stream selection with initialization, refresh, and management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import { Refresh, Add, Delete, Info, Stream as StreamIcon } from '@mui/icons-material';
import {
  speckleService,
  type SpeckleStream,
  type SpeckleInitializeResult,
} from '../../services/speckle.service';
import { logger } from '../../services/logger';

export interface StreamSelectorProps {
  projectId: string;
  authToken?: string;
  selectedStreamId?: string;
  onStreamSelect?: (stream: SpeckleStream | null) => void;
  onStreamInitialized?: (result: SpeckleInitializeResult) => void;
  showActions?: boolean;
  refreshTrigger?: number; // Change this value to trigger stream reload
}

export const StreamSelector: React.FC<StreamSelectorProps> = ({
  projectId,
  authToken,
  selectedStreamId,
  onStreamSelect,
  onStreamInitialized,
  showActions = true,
  refreshTrigger,
}) => {
  const [streams, setStreams] = useState<SpeckleStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set auth token on service
  useEffect(() => {
    if (authToken) {
      speckleService.setAuthToken(authToken);
    }
  }, [authToken]);

  // Set initial selected stream
  useEffect(() => {
    if (selectedStreamId && streams.length > 0) {
      const stream = streams.find(s => s.stream_id === selectedStreamId);
      if (stream) {
        setSelectedStream(selectedStreamId);
      }
    }
  }, [selectedStreamId, streams]);

  /**
   * Load streams for the project
   */
  const loadStreams = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const projectStreams = await speckleService.getProjectStreams(projectId);
      setStreams(projectStreams);

      // Auto-select first stream if none selected
      if (projectStreams.length > 0 && !selectedStream) {
        const firstStream = projectStreams[0];
        setSelectedStream(firstStream.stream_id);
        if (onStreamSelect) {
          onStreamSelect(firstStream);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load streams';
      setError(errorMessage);
      logger.error('Failed to load streams', { error: err });
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedStream, onStreamSelect]);

  /**
   * Initialize a new stream for the project
   */
  const handleInitialize = async () => {
    if (!projectId) return;

    setInitializing(true);
    setError(null);

    try {
      const result = await speckleService.initializeProject(projectId);

      if (result.success) {
        // Reload streams to show the new one
        await loadStreams();

        if (onStreamInitialized) {
          onStreamInitialized(result);
        }
      } else {
        setError('Failed to initialize stream');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize stream';
      setError(errorMessage);
      logger.error('Failed to initialize stream', { error: err });
    } finally {
      setInitializing(false);
    }
  };

  /**
   * Delete the current project stream
   */
  const handleDelete = async () => {
    if (!projectId) return;

    setDeleting(true);
    setError(null);
    setDeleteDialogOpen(false);

    try {
      const result = await speckleService.deleteProjectStream(projectId);

      if (result.success) {
        // Clear selection and reload
        setSelectedStream('');
        if (onStreamSelect) {
          onStreamSelect(null);
        }
        await loadStreams();
      } else {
        setError('Failed to delete stream');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete stream';
      setError(errorMessage);
      logger.error('Failed to delete stream', { error: err });
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Handle stream selection change
   */
  const handleStreamChange = (event: { target: { value: string } }) => {
    const streamId = event.target.value;
    setSelectedStream(streamId);

    const stream = streams.find(s => s.stream_id === streamId);
    if (onStreamSelect) {
      onStreamSelect(stream || null);
    }
  };

  // Load streams on mount and when refreshTrigger changes
  useEffect(() => {
    loadStreams();
  }, [loadStreams, refreshTrigger]);

  return (
    <Box>
      {/* Error Alert */}
      {error && (
        <Alert severity='error' onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* No Streams Helper - ENTERPRISE FIX (2026-01-12) */}
      {!loading && streams.length === 0 && !error && (
        <Alert severity='info' sx={{ mb: 2 }}>
          <Typography variant='body2' sx={{ fontWeight: 600, mb: 1 }}>
            No Speckle streams found for this project
          </Typography>
          <Typography variant='caption' display='block' sx={{ mb: 1 }}>
            To view BIM models, you need to create a Speckle stream first:
          </Typography>
          <Box component='ul' sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
            <li>
              <Typography variant='caption'>
                <strong>Option 1:</strong> Click the{' '}
                <Add sx={{ fontSize: 14, verticalAlign: 'middle' }} /> button to initialize a new
                stream
              </Typography>
            </li>
            <li>
              <Typography variant='caption'>
                <strong>Option 2:</strong> Upload an IFC file in the "Upload" tab
              </Typography>
            </li>
          </Box>
        </Alert>
      )}

      {/* Stream Selection */}
      <Stack direction='row' spacing={1} alignItems='flex-start'>
        <FormControl fullWidth variant='outlined' disabled={loading || initializing}>
          <InputLabel id='stream-selector-label'>Speckle Stream</InputLabel>
          <Select
            labelId='stream-selector-label'
            value={selectedStream}
            onChange={handleStreamChange}
            label='Speckle Stream'
            startAdornment={
              loading ? (
                <CircularProgress size={20} sx={{ ml: 1, mr: 1 }} />
              ) : (
                <StreamIcon sx={{ ml: 1, mr: 1, color: 'action.active' }} />
              )
            }
          >
            {streams.length === 0 && !loading && (
              <MenuItem disabled>
                <em>No streams available</em>
              </MenuItem>
            )}
            {streams.map(stream => (
              <MenuItem key={stream.id} value={stream.stream_id}>
                <Box sx={{ width: '100%' }}>
                  <Typography variant='body2'>{stream.stream_name}</Typography>
                  <Typography variant='caption' color='text.secondary' display='block'>
                    {stream.commit_count} commits
                    {stream.last_commit_date &&
                      ` • Last: ${new Date(stream.last_commit_date).toLocaleDateString()}`}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Action Buttons */}
        {showActions && (
          <Stack direction='row' spacing={0.5}>
            <Tooltip title='Refresh streams'>
              <span>
                <IconButton
                  onClick={loadStreams}
                  disabled={loading || initializing || deleting}
                  color='primary'
                >
                  <Refresh />
                </IconButton>
              </span>
            </Tooltip>

            {streams.length === 0 && (
              <Tooltip title='Initialize new stream'>
                <span>
                  <IconButton
                    onClick={handleInitialize}
                    disabled={loading || initializing || deleting}
                    color='success'
                  >
                    {initializing ? <CircularProgress size={20} /> : <Add />}
                  </IconButton>
                </span>
              </Tooltip>
            )}

            {streams.length > 0 && (
              <Tooltip title='Delete stream'>
                <span>
                  <IconButton
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={loading || initializing || deleting}
                    color='error'
                  >
                    {deleting ? <CircularProgress size={20} /> : <Delete />}
                  </IconButton>
                </span>
              </Tooltip>
            )}

            <Tooltip title='Stream information'>
              <IconButton size='small' color='info'>
                <Info fontSize='small' />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>

      {/* Stream Info */}
      {selectedStream && streams.length > 0 && (
        <Box sx={{ mt: 1 }}>
          {(() => {
            const stream = streams.find(s => s.stream_id === selectedStream);
            if (!stream) return null;

            return (
              <Stack direction='row' spacing={1}>
                <Chip
                  label={`${stream.commit_count} commits`}
                  size='small'
                  color='primary'
                  variant='outlined'
                />
                <Chip
                  label={`Created ${new Date(stream.created_at).toLocaleDateString()}`}
                  size='small'
                  variant='outlined'
                />
              </Stack>
            );
          })()}
        </Box>
      )}

      {/* Initialize Hint */}
      {streams.length === 0 && !loading && !error && (
        <Alert severity='info' sx={{ mt: 2 }} icon={<Info />}>
          <Typography variant='body2'>No Speckle stream found for this project.</Typography>
          <Button
            onClick={handleInitialize}
            variant='contained'
            size='small'
            startIcon={<Add />}
            disabled={initializing}
            sx={{ mt: 1 }}
          >
            {initializing ? 'Initializing...' : 'Initialize Stream'}
          </Button>
        </Alert>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Speckle Stream?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this stream? This action cannot be undone. All commits
            and BIM data in this stream will be permanently deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color='error' variant='contained'>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StreamSelector;
