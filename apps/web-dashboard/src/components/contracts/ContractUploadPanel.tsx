import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Stack,
  Paper,
  IconButton,
  Chip,
} from '@mui/material';
import {
  CloudUpload,
  Description,
  CheckCircle,
  Error as ErrorIcon,
  Close,
  InsertDriveFile,
} from '@mui/icons-material';

/**
 * Contract upload status
 */
type UploadStatus = 'idle' | 'uploading' | 'parsing' | 'complete' | 'error';

/**
 * Uploaded contract response
 */
interface UploadResponse {
  success: boolean;
  contractId?: string;
  status?: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
  message?: string;
}

/**
 * Contract upload panel props
 */
interface ContractUploadPanelProps {
  projectId: string;
  tenantId?: string;
  onUploadComplete?: (contractId: string) => void;
  onError?: (error: string) => void;
  apiBaseUrl?: string;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file type icon color
 */
function getFileTypeColor(mimeType: string): string {
  if (mimeType.includes('pdf')) return '#e53935';
  if (mimeType.includes('word') || mimeType.includes('docx')) return '#1976d2';
  return '#757575';
}

/**
 * Contract Upload Panel Component
 *
 * Provides drag-and-drop and click-to-upload interface for contract documents.
 * Supports PDF and DOCX files up to 25MB.
 */
const ContractUploadPanel: React.FC<ContractUploadPanelProps> = ({
  projectId,
  tenantId = 'default',
  onUploadComplete,
  onError,
  apiBaseUrl = '/api',
}) => {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // File validation
  const validateFile = (file: File): string | null => {
    const maxSize = 25 * 1024 * 1024; // 25MB
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const allowedExtensions = ['.pdf', '.docx', '.txt'];

    if (file.size > maxSize) {
      return `File too large. Maximum size is 25MB. Your file is ${formatFileSize(file.size)}.`;
    }

    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension)) {
      return 'Invalid file type. Please upload a PDF, DOCX, or TXT file.';
    }

    return null;
  };

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setStatus('error');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setStatus('idle');
    setUploadResponse(null);
  }, []);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  // Handle file input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  // Clear selected file
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setStatus('idle');
    setProgress(0);
    setUploadResponse(null);
    setErrorMessage(null);
  }, []);

  // Upload file
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setStatus('uploading');
    setProgress(0);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('contract', selectedFile);
      formData.append('projectId', projectId);
      formData.append('tenantId', tenantId);

      // Simulate progress (actual progress would come from XMLHttpRequest)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(`${apiBaseUrl}/upload/contract`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      const data: UploadResponse = await response.json();

      if (response.ok && data.success) {
        setProgress(100);
        setStatus('parsing');
        setUploadResponse(data);

        // If contractId returned, notify parent
        if (data.contractId && onUploadComplete) {
          onUploadComplete(data.contractId);
        }

        // After a brief delay, show complete status
        setTimeout(() => {
          setStatus('complete');
        }, 500);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(message);
      if (onError) {
        onError(message);
      }
    }
  }, [selectedFile, projectId, tenantId, apiBaseUrl, onUploadComplete, onError]);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography
          variant='h6'
          gutterBottom
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <Description />
          Upload Contract Document
        </Typography>

        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Upload a construction contract (PDF, DOCX) to extract parties, authority cascade, and
          governance configuration automatically.
        </Typography>

        {/* Drop Zone */}
        <Paper
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            p: 4,
            border: '2px dashed',
            borderColor: isDragging ? 'primary.main' : 'divider',
            borderRadius: 2,
            bgcolor: isDragging ? 'action.hover' : 'background.default',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.light',
              bgcolor: 'action.hover',
            },
          }}
          onClick={() => document.getElementById('contract-file-input')?.click()}
        >
          <input
            id='contract-file-input'
            type='file'
            accept='.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />

          {!selectedFile ? (
            <>
              <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant='body1' color='text.secondary'>
                Drag and drop a contract file here, or click to browse
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                Supports PDF, DOCX, TXT (max 25MB)
              </Typography>
            </>
          ) : (
            <Stack direction='row' spacing={2} alignItems='center' justifyContent='center'>
              <InsertDriveFile sx={{ fontSize: 40, color: getFileTypeColor(selectedFile.type) }} />
              <Box textAlign='left'>
                <Typography variant='body1' fontWeight='medium'>
                  {selectedFile.name}
                </Typography>
                <Typography variant='caption' color='text.secondary'>
                  {formatFileSize(selectedFile.size)}
                </Typography>
              </Box>
              <IconButton
                size='small'
                onClick={e => {
                  e.stopPropagation();
                  handleClearFile();
                }}
              >
                <Close />
              </IconButton>
            </Stack>
          )}
        </Paper>

        {/* Progress Bar */}
        {(status === 'uploading' || status === 'parsing') && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant={status === 'parsing' ? 'indeterminate' : 'determinate'}
              value={progress}
            />
            <Typography variant='caption' color='text.secondary' sx={{ mt: 0.5, display: 'block' }}>
              {status === 'uploading'
                ? `Uploading... ${progress}%`
                : 'Parsing contract and extracting data...'}
            </Typography>
          </Box>
        )}

        {/* Success Message */}
        {status === 'complete' && uploadResponse && (
          <Alert
            severity='success'
            icon={<CheckCircle />}
            sx={{ mt: 2 }}
            action={
              <Button size='small' onClick={handleClearFile}>
                Upload Another
              </Button>
            }
          >
            <Typography variant='body2' fontWeight='medium'>
              Contract uploaded successfully!
            </Typography>
            {uploadResponse.contractId && (
              <Typography variant='caption' display='block'>
                Contract ID: {uploadResponse.contractId}
              </Typography>
            )}
            {uploadResponse.message && (
              <Typography variant='caption' display='block'>
                {uploadResponse.message}
              </Typography>
            )}
          </Alert>
        )}

        {/* Error Message */}
        {status === 'error' && errorMessage && (
          <Alert
            severity='error'
            icon={<ErrorIcon />}
            sx={{ mt: 2 }}
            action={
              <Button size='small' onClick={handleClearFile}>
                Try Again
              </Button>
            }
          >
            {errorMessage}
          </Alert>
        )}

        {/* Upload Button */}
        {selectedFile &&
          status !== 'complete' &&
          status !== 'uploading' &&
          status !== 'parsing' && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant='contained'
                startIcon={<CloudUpload />}
                onClick={handleUpload}
                disabled={status === 'error'}
              >
                Upload & Parse Contract
              </Button>
            </Box>
          )}

        {/* Supported Templates */}
        <Box sx={{ mt: 3 }}>
          <Typography variant='caption' color='text.secondary' display='block' sx={{ mb: 1 }}>
            Supported contract templates:
          </Typography>
          <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
            <Chip label='CCDC 2' size='small' variant='outlined' />
            <Chip label='CCDC 5A' size='small' variant='outlined' />
            <Chip label='CCDC 14' size='small' variant='outlined' />
            <Chip label='CCDC 30 (IPD)' size='small' variant='outlined' />
            <Chip label='AIA A101' size='small' variant='outlined' />
            <Chip label='AIA A201' size='small' variant='outlined' />
            <Chip label='AIA C191 (IPD)' size='small' variant='outlined' />
            <Chip label='AIA B101' size='small' variant='outlined' />
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ContractUploadPanel;
