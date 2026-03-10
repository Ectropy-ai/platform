/**
 * IFC Uploader Component
 * Enterprise-grade IFC file upload with validation, progress tracking, and error handling
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Alert,
  Typography,
  Paper,
  IconButton,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  TextField,
} from '@mui/material';
import {
  UploadFile,
  Close,
  CheckCircle,
  Error as ErrorIcon,
  FileUpload,
} from '@mui/icons-material';
import { speckleService, type SpeckleImportResult } from '../../services/speckle.service';
import { logger } from '../../services/logger';

export interface IFCUploaderProps {
  projectId: string;
  authToken?: string;
  onUploadComplete?: (result: SpeckleImportResult) => void;
  onUploadError?: (error: Error) => void;
  maxFileSizeMB?: number;
  showAdvancedOptions?: boolean;
}

interface UploadState {
  uploading: boolean;
  progress: number;
  fileName: string | null;
  fileSize: number | null;
  result: SpeckleImportResult | null;
  error: string | null;
}

export const IFCUploader: React.FC<IFCUploaderProps> = ({
  projectId,
  authToken,
  onUploadComplete,
  onUploadError,
  maxFileSizeMB = 1000,
  showAdvancedOptions = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    fileName: null,
    fileSize: null,
    result: null,
    error: null,
  });

  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false);
  const [filterByTemplate, setFilterByTemplate] = useState(false);
  const [templateIds, setTemplateIds] = useState<string>('');

  // Set auth token on service
  React.useEffect(() => {
    if (authToken) {
      speckleService.setAuthToken(authToken);
    }
  }, [authToken]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset previous state
      setUploadState({
        uploading: false,
        progress: 0,
        fileName: file.name,
        fileSize: file.size,
        result: null,
        error: null,
      });

      // Validate file
      const validation = speckleService.validateIFCFile(file);
      if (!validation.valid) {
        setUploadState(prev => ({
          ...prev,
          error: validation.error || 'Invalid file',
        }));
        return;
      }

      // Check file size against custom max
      const maxSizeBytes = maxFileSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setUploadState(prev => ({
          ...prev,
          error: `File size exceeds maximum of ${maxFileSizeMB}MB`,
        }));
        return;
      }

      // Show advanced options dialog if enabled
      if (showAdvancedOptions) {
        setAdvancedDialogOpen(true);
      } else {
        await uploadFile(file);
      }
    },
    [maxFileSizeMB, showAdvancedOptions],
  );

  /**
   * Upload file to server
   */
  const uploadFile = async (file: File) => {
    setUploadState(prev => ({
      ...prev,
      uploading: true,
      progress: 0,
      error: null,
    }));

    try {
      const options = {
        filterByTemplate: filterByTemplate,
        templateIds: templateIds ? templateIds.split(',').map(id => id.trim()) : undefined,
        onProgress: (progress: number) => {
          setUploadState(prev => ({
            ...prev,
            progress: Math.round(progress),
          }));
        },
      };

      const result = await speckleService.importIFCFile(projectId, file, options);

      setUploadState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        result,
        error: result.success ? null : 'Upload completed with errors',
      }));

      if (result.success && onUploadComplete) {
        onUploadComplete(result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState(prev => ({
        ...prev,
        uploading: false,
        error: errorMessage,
      }));

      if (onUploadError && error instanceof Error) {
        onUploadError(error);
      }

      logger.error('IFC upload failed', { error });
    }
  };

  /**
   * Handle advanced options confirmation
   */
  const handleAdvancedUpload = () => {
    setAdvancedDialogOpen(false);
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  /**
   * Reset upload state and clear file input
   */
  const handleReset = () => {
    setUploadState({
      uploading: false,
      progress: 0,
      fileName: null,
      fileSize: null,
      result: null,
      error: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Format file size for display
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Box>
      {/* File Input (Hidden) */}
      <input
        ref={fileInputRef}
        type='file'
        accept='.ifc'
        style={{ display: 'none' }}
        id={`ifc-upload-${projectId}`}
        onChange={handleFileSelect}
        disabled={uploadState.uploading}
      />

      {/* Upload Button */}
      {!uploadState.fileName && !uploadState.result && (
        <label htmlFor={`ifc-upload-${projectId}`}>
          <Button
            component='span'
            variant='contained'
            color='primary'
            startIcon={<FileUpload />}
            disabled={uploadState.uploading}
            size='large'
          >
            Upload IFC File
          </Button>
        </label>
      )}

      {/* Upload Progress */}
      {uploadState.uploading && uploadState.fileName && (
        <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
          <Stack spacing={2}>
            <Box display='flex' alignItems='center' justifyContent='space-between'>
              <Typography variant='body1' fontWeight='medium'>
                Uploading: {uploadState.fileName}
              </Typography>
              <Chip label={`${uploadState.progress}%`} color='primary' size='small' />
            </Box>
            <LinearProgress
              variant='determinate'
              value={uploadState.progress}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant='caption' color='text.secondary'>
              File size: {uploadState.fileSize ? formatFileSize(uploadState.fileSize) : 'Unknown'}
            </Typography>
          </Stack>
        </Paper>
      )}

      {/* Success Result */}
      {uploadState.result && uploadState.result.success && (
        <Alert
          severity='success'
          icon={<CheckCircle />}
          action={
            <IconButton size='small' onClick={handleReset}>
              <Close fontSize='small' />
            </IconButton>
          }
          sx={{ mt: 2 }}
        >
          <Typography variant='body2' fontWeight='medium'>
            IFC file uploaded and imported successfully
          </Typography>
          <Typography variant='caption' display='block' sx={{ mt: 1 }}>
            Processed: {uploadState.result.elementsProcessed} elements | Imported:{' '}
            {uploadState.result.elementsImported} | Failed:{' '}
            {uploadState.result.elementsProcessed - uploadState.result.elementsImported}
          </Typography>
        </Alert>
      )}

      {/* Partial Success with Errors */}
      {uploadState.result && !uploadState.result.success && (
        <Alert
          severity='warning'
          icon={<ErrorIcon />}
          action={
            <IconButton size='small' onClick={handleReset}>
              <Close fontSize='small' />
            </IconButton>
          }
          sx={{ mt: 2 }}
        >
          <Typography variant='body2' fontWeight='medium'>
            Upload completed with{' '}
            {uploadState.result.elementsProcessed - uploadState.result.elementsImported} failures
          </Typography>
          <Typography variant='caption' display='block' sx={{ mt: 1 }}>
            Imported: {uploadState.result.elementsImported} | Failed:{' '}
            {uploadState.result.elementsProcessed - uploadState.result.elementsImported}
          </Typography>
          {uploadState.result.errors.length > 0 && (
            <Box sx={{ mt: 1, maxHeight: 100, overflow: 'auto' }}>
              {uploadState.result.errors.slice(0, 5).map((error, idx) => (
                <Typography key={idx} variant='caption' display='block'>
                  • {error}
                </Typography>
              ))}
              {uploadState.result.errors.length > 5 && (
                <Typography variant='caption' color='text.secondary'>
                  ... and {uploadState.result.errors.length - 5} more errors
                </Typography>
              )}
            </Box>
          )}
        </Alert>
      )}

      {/* Error State */}
      {uploadState.error && !uploadState.result && (
        <Alert
          severity='error'
          icon={<ErrorIcon />}
          action={
            <IconButton size='small' onClick={handleReset}>
              <Close fontSize='small' />
            </IconButton>
          }
          sx={{ mt: 2 }}
        >
          <Typography variant='body2' fontWeight='medium'>
            Upload Failed
          </Typography>
          <Typography variant='caption' display='block'>
            {uploadState.error}
          </Typography>
        </Alert>
      )}

      {/* Advanced Options Dialog */}
      <Dialog
        open={advancedDialogOpen}
        onClose={() => setAdvancedDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Upload Options</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant='body2' color='text.secondary'>
              File: {uploadState.fileName}
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={filterByTemplate}
                  onChange={e => setFilterByTemplate(e.target.checked)}
                />
              }
              label='Filter by template'
            />

            {filterByTemplate && (
              <TextField
                fullWidth
                label='Template IDs (comma-separated)'
                value={templateIds}
                onChange={e => setTemplateIds(e.target.value)}
                placeholder='template-1, template-2'
                helperText='Enter template IDs to filter imported objects'
                variant='outlined'
                size='small'
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvancedDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAdvancedUpload} variant='contained'>
            Upload
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default IFCUploader;
