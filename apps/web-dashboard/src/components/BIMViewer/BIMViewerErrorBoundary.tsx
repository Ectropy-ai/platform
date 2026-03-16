/**
 * BIM Viewer Error Boundary
 *
 * Enterprise error handling for the Speckle BIM viewer component
 * Prevents entire dashboard from crashing when BIM viewer fails
 *
 * Features:
 * - Catches React errors in BIM viewer component tree
 * - Enterprise logging via centralized client logger
 * - Multi-backend error tracking (Console, Remote API, Analytics)
 * - Provides user-friendly error UI with recovery options
 * - Reports errors to parent components for custom handling
 * - Automatic integration with monitoring services
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Box, Typography, Stack } from '@mui/material';
import { RefreshOutlined, BugReportOutlined } from '@mui/icons-material';
import { clientLogger } from '../../utils/client-logger';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

/**
 * Error Boundary for BIM Viewer
 *
 * Wraps the Speckle BIM viewer to catch and handle rendering errors
 * without crashing the entire application.
 *
 * Usage:
 * ```tsx
 * <BIMViewerErrorBoundary onError={handleViewerError}>
 *   <SpeckleBIMViewer {...props} />
 * </BIMViewerErrorBoundary>
 * ```
 */
export class BIMViewerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so next render shows fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // DIAGNOSTIC (2026-03-16): Explicit console.error for unmount investigation
    // If this fires, ErrorBoundary is catching a throw and unmounting SpeckleBIMViewer
    console.error('[BIMViewerErrorBoundary] Caught error:', error);
    console.error('[BIMViewerErrorBoundary] Component stack:', errorInfo.componentStack);

    // Log error using enterprise client logger
    // Automatically handles: Console, Remote API, Analytics
    clientLogger.error('BIM Viewer Error Boundary caught error', error, {
      component: 'BIMViewer',
      service: 'web-dashboard',
      componentStack: errorInfo.componentStack,
      errorCount: this.state.errorCount + 1,
    });

    // Track error count to prevent infinite error loops
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Notify parent component for custom handling
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI from props
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Check for infinite error loop (more than 3 errors)
      if (this.state.errorCount > 3) {
        return (
          <Box p={3}>
            <Alert severity='error'>
              <Typography variant='h6' gutterBottom>
                <BugReportOutlined sx={{ verticalAlign: 'middle', mr: 1 }} />
                BIM Viewer Critical Error
              </Typography>
              <Typography variant='body2' color='text.secondary' paragraph>
                The BIM viewer has encountered multiple errors and cannot recover. Please reload the
                page or contact support if the issue persists.
              </Typography>
              <Typography variant='caption' color='text.secondary' paragraph>
                Error: {this.state.error?.message || 'Unknown error'}
              </Typography>
              <Stack direction='row' spacing={2} mt={2}>
                <Button
                  variant='contained'
                  color='primary'
                  startIcon={<RefreshOutlined />}
                  onClick={this.handleReload}
                >
                  Reload Page
                </Button>
              </Stack>
            </Alert>
          </Box>
        );
      }

      // Default error UI with recovery options
      return (
        <Box p={3} data-testid='bim-viewer-error-boundary'>
          <Alert severity='error'>
            <Typography variant='h6' gutterBottom>
              BIM Viewer Failed to Load
            </Typography>
            <Typography variant='body2' color='text.secondary' paragraph>
              The BIM viewer encountered an error while loading the 3D model. This could be due to:
            </Typography>
            <Box component='ul' sx={{ mt: 1, mb: 2 }}>
              <Typography component='li' variant='body2' color='text.secondary'>
                Large or complex BIM models exceeding browser memory limits
              </Typography>
              <Typography component='li' variant='body2' color='text.secondary'>
                Network connectivity issues preventing model download
              </Typography>
              <Typography component='li' variant='body2' color='text.secondary'>
                WebGL initialization failure (check browser compatibility)
              </Typography>
              <Typography component='li' variant='body2' color='text.secondary'>
                Corrupted or unsupported model format
              </Typography>
            </Box>
            <Typography
              variant='caption'
              display='block'
              color='text.secondary'
              sx={{ fontFamily: 'monospace', mb: 2 }}
            >
              Error: {this.state.error?.message || 'Unknown error'}
            </Typography>
            <Stack direction='row' spacing={2}>
              <Button
                variant='contained'
                color='primary'
                startIcon={<RefreshOutlined />}
                onClick={this.handleReset}
              >
                Retry Viewer
              </Button>
              <Button variant='outlined' color='secondary' onClick={this.handleReload}>
                Reload Page
              </Button>
            </Stack>
          </Alert>
        </Box>
      );
    }

    return this.props.children;
  }
}
