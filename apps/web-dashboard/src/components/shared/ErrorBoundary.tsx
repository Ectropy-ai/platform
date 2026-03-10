/**
 * =============================================================================
 * ENTERPRISE ERROR BOUNDARY COMPONENT
 *
 * PURPOSE: Global error catching with Sentry integration
 * ENTERPRISE PATTERN: Graceful degradation with user-friendly fallback UI
 *
 * FEATURES:
 * - React Error Boundary implementation
 * - Automatic Sentry error reporting
 * - User-friendly error UI
 * - Development stack trace display
 * - Error recovery options
 *
 * DEPLOYMENT: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
 * =============================================================================
 */

/// <reference types="node" />

import {
  // TODO: Re-enable after repo split — used by Report Issue button
  // BugReport as BugIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Container,
  Typography,
} from '@mui/material';
import React, { type ErrorInfo, type ReactNode } from 'react';
import { captureException, addBreadcrumb } from '../../services/sentry.service';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Enhanced Error Boundary Component
 * Provides graceful error handling with user-friendly interface
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // Note: getDerivedStateFromError is a static React Error Boundary method
  // that doesn't require 'override' as it's not inherited from Component
  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });

    // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
    // Send error to Sentry for tracking and analysis
    try {
      // Add breadcrumb with component stack for context
      addBreadcrumb('Error Boundary caught error', 'error', 'error', {
        componentStack: errorInfo.componentStack?.slice(0, 500), // Limit size
      });

      // Capture exception with full error info
      captureException(error, {
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
        errorBoundary: {
          location: 'ErrorBoundary.componentDidCatch',
        },
      });
    } catch (sentryError) {
      // Sentry error reporting failed - don't block error handling
      // eslint-disable-next-line no-console
      console.warn('[ErrorBoundary] Failed to report error to Sentry:', sentryError);
    }

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('Error Boundary caught an error:', error, errorInfo);
    }
  }

  public handleRefresh = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Container maxWidth='sm' sx={{ mt: 8 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <ErrorIcon color='error' sx={{ fontSize: 64, mb: 2 }} />

              <Typography variant='h4' component='h1' gutterBottom>
                Something went wrong
              </Typography>

              <Typography variant='body1' color='text.secondary' paragraph>
                We apologize for the inconvenience. An unexpected error occurred.
              </Typography>

              <Alert severity='error' sx={{ mt: 2, mb: 3, textAlign: 'left' }}>
                <Typography variant='subtitle2' component='div' gutterBottom>
                  Error Details
                </Typography>
                {this.state.error?.message || 'Unknown error occurred'}
              </Alert>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <Box sx={{ mt: 2, mb: 3 }}>
                  <Typography variant='subtitle2' gutterBottom>
                    Stack Trace (Development Only):
                  </Typography>
                  <Box
                    component='pre'
                    sx={{
                      backgroundColor: 'grey.100',
                      p: 2,
                      borderRadius: 1,
                      overflow: 'auto',
                      fontSize: '0.75rem',
                      textAlign: 'left',
                      maxHeight: 200,
                    }}
                  >
                    {this.state.error.stack}
                  </Box>

                  {this.state.errorInfo && (
                    <Box
                      component='pre'
                      sx={{
                        backgroundColor: 'grey.100',
                        p: 2,
                        borderRadius: 1,
                        overflow: 'auto',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        maxHeight: 200,
                        mt: 1,
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>

            <CardActions sx={{ justifyContent: 'center', pb: 3 }}>
              <Button
                variant='contained'
                color='primary'
                startIcon={<RefreshIcon />}
                onClick={this.handleRefresh}
                sx={{ mr: 2 }}
              >
                Refresh Page
              </Button>

              {/* TODO: Re-enable after repo split — link to public issue tracker */}
              {/* <Button
                variant='outlined'
                startIcon={<BugIcon />}
                onClick={() => window.open('https://github.com/luhtech/Ectropy/issues', '_blank')}
              >
                Report Issue
              </Button> */}
            </CardActions>
          </Card>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary as any;
