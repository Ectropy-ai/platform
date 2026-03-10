import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Card, CardContent, Typography, Alert, AlertTitle } from '@mui/material';
import { logger } from '../services/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * ErrorBoundary component to catch and handle React rendering errors
 * Prevents the entire application from crashing when a component fails
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error boundary caught error', { error, errorInfo });

    // Store error info for display
    this.setState({
      errorInfo,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // TODO: Log to error tracking service (e.g., Sentry)
    // if (window.trackError) {
    //   window.trackError('react_error_boundary', { error, errorInfo });
    // }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Card
            sx={{
              maxWidth: 600,
              border: '1px solid',
              borderColor: 'error.main',
              bgcolor: 'error.50',
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography variant='h5' component='h2' gutterBottom color='error' fontWeight='bold'>
                Something went wrong
              </Typography>
              <Typography variant='body1' color='error.dark' sx={{ mb: 2 }}>
                {this.state.error?.message || 'An unexpected error occurred'}
              </Typography>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <Box
                  sx={{
                    bgcolor: 'grey.100',
                    p: 2,
                    borderRadius: 1,
                    mb: 2,
                    overflow: 'auto',
                    maxHeight: 200,
                  }}
                >
                  <Typography variant='caption' component='pre' sx={{ whiteSpace: 'pre-wrap' }}>
                    {this.state.errorInfo.componentStack}
                  </Typography>
                </Box>
              )}
              <Button
                variant='contained'
                color='error'
                onClick={this.handleReset}
                sx={{ mt: 2 }}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}

/**
 * Dashboard-specific error boundary with custom fallback
 */
export function DashboardErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <Box sx={{ p: 3 }}>
          <Alert severity="warning">
            <AlertTitle>Dashboard Data Unavailable</AlertTitle>
            We're having trouble loading your dashboard data. Please refresh the page or try again later.
          </Alert>
        </Box>
      }
      onError={(error) => {
        // Log to monitoring service
        logger.error('[Dashboard] Error', { error });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
