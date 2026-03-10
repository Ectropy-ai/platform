/**
 * OAuth Login Component - Enterprise Authentication
 *
 * Provides secure OAuth2 authentication with Google OAuth 2.0.
 * All demo credentials have been removed for security compliance.
 *
 * v1.1.0: Google OAuth only (enterprise-ready, 100% E2E validated)
 * v1.2.0: GitHub and Microsoft OAuth planned
 *
 * @component
 * @example
 * ```tsx
 * <Login onSignIn={() => navigate('/dashboard')} />
 * ```
 */

import React from 'react';
import { Box, Button, Card, CardContent, Typography, Alert, Stack } from '@mui/material';
import { Google } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';

interface LoginProps {
  /** Optional callback function triggered after successful sign-in */
  onSignIn?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSignIn }) => {
  const { loginWithOAuth, isLoading, error } = useAuth();

  // Check for OAuth error parameters
  const urlParams = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');

  const handleGoogleLogin = () => {
    loginWithOAuth('google');
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', m: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant='h4' component='h1' gutterBottom>
              Sign In
            </Typography>
            <Typography variant='body1' color='text.secondary' gutterBottom>
              Welcome to Ectropy Platform
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Enterprise AI-Powered Construction Platform
            </Typography>
          </Box>

          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {oauthError === 'oauth_failed' && (
            <Alert severity='error' sx={{ mb: 2 }}>
              Authentication failed. Please try signing in again.
            </Alert>
          )}

          {oauthError === 'session_timeout' && (
            <Alert severity='warning' sx={{ mb: 2 }}>
              Your session expired. Please sign in again.
            </Alert>
          )}

          <Stack spacing={2}>
            {/* Google OAuth Login Button - Enterprise authentication */}
            <Button
              data-testid='google-oauth-button'
              variant='contained'
              size='large'
              fullWidth
              startIcon={<Google />}
              onClick={handleGoogleLogin}
              disabled={isLoading}
              sx={{ py: 1.5 }}
              aria-label='Sign in with Google'
            >
              Sign in with Google
            </Button>
          </Stack>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant='caption' color='text.secondary'>
              Secure OAuth2 authentication with Google
            </Typography>
            <Typography variant='caption' display='block' color='text.secondary' sx={{ mt: 0.5 }}>
              Additional providers (GitHub, Microsoft) coming in v1.2.0
            </Typography>
          </Box>

          {/* Development environment security notice */}
          {process.env.NODE_ENV === 'development' && (
            <Alert severity='info' sx={{ mt: 2 }}>
              <Typography variant='caption'>
                🔒 Security: OAuth authentication required for all access. Demo credentials have
                been removed per security policy.
              </Typography>
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
