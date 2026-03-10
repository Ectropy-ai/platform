import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { config } from '../services/config';
import { useAuth } from '../hooks/useAuth';

// Declare gtag for Google Analytics
declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

interface WaitlistResponse {
  success: boolean;
  message: string;
}

interface LandingPageProps {
  onSignIn?: () => void;
}

/**
 * Simplified Landing Page - Stealth Mode
 *
 * Purpose: Capture early interest and provide sign-in for authorized users
 *
 * Essential Features Only:
 * 1. Hero with clear value prop
 * 2. Email capture (lead generation)
 * 3. Sign In button (authorized access)
 * 4. Success message (confirmation)
 *
 * Related: p5a-d9 (Landing Page with Lead Capture)
 */
const LandingPage: React.FC<LandingPageProps> = ({ onSignIn }) => {
  const { loginWithOAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || email.trim() === '') {
      setError('Email address is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = config.apiBaseUrl;
      const response = await fetch(`${apiUrl}/api/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data: WaitlistResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to join waitlist');
      }

      // Success
      setShowSuccess(true);
      setEmail('');

      // Track analytics if available
      if (window.gtag) {
        window.gtag('event', 'waitlist_signup', {
          event_category: 'engagement',
          event_label: 'email_capture',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = () => {
    if (onSignIn) {
      onSignIn();
    } else {
      loginWithOAuth('google');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
        px: { xs: 3, sm: 4 },
        py: { xs: 6, sm: 8 },
        fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <Container maxWidth='sm'>
        <Stack spacing={{ xs: 6, sm: 8 }} alignItems='center'>
          {/* Hero */}
          <Box textAlign='center' sx={{ color: 'white', px: { xs: 2, sm: 0 } }}>
            <Typography
              variant='h2'
              component='h1'
              gutterBottom
              sx={{
                fontWeight: 300,
                fontSize: { xs: '4.8rem', sm: '6.6rem', md: '7.2rem' },
                letterSpacing: '0.05em',
                mb: 3,
                fontFamily: 'inherit',
              }}
            >
              ectropy.ai
            </Typography>
            <Typography
              variant='h5'
              sx={{
                fontWeight: 400,
                mb: 8,
                fontSize: { xs: '1.35rem', sm: '1.65rem' },
                letterSpacing: '-0.01em',
                lineHeight: 1.4,
                fontFamily: 'inherit',
              }}
            >
              Empowering the future of construction with open-source technology
            </Typography>
          </Box>

          {/* Email Capture Form */}
          <Box
            component='form'
            onSubmit={handleWaitlistSubmit}
            sx={{
              width: '100%',
              maxWidth: 480,
              px: { xs: 2, sm: 0 },
            }}
          >
            <Typography
              variant='body1'
              textAlign='center'
              sx={{
                mb: 3,
                fontSize: '1.05rem',
                lineHeight: 1.6,
                fontFamily: 'inherit',
                color: 'rgba(255, 255, 255, 0.95)',
              }}
            >
              Join our early access program to be the first to know
            </Typography>

            <Stack spacing={3}>
              <TextField
                placeholder='Email Address'
                type='email'
                value={email}
                onChange={e => setEmail(e.target.value)}
                fullWidth
                variant='outlined'
                disabled={loading}
                sx={{
                  '& .MuiInputBase-root': {
                    fontSize: '1.05rem',
                    fontFamily: 'inherit',
                    backgroundColor: 'white',
                    borderRadius: 2,
                    textAlign: 'center',
                  },
                  '& .MuiInputBase-input': {
                    textAlign: 'center',
                  },
                  '& .MuiInputBase-input::placeholder': {
                    textAlign: 'center',
                    opacity: 0.6,
                  },
                }}
              />

              <Button
                type='submit'
                variant='contained'
                size='large'
                fullWidth
                disabled={loading}
                sx={{
                  py: 1.75,
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 2,
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  backgroundColor: '#0d47a1',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  '&:hover': {
                    backgroundColor: '#1565c0',
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                  },
                }}
              >
                {loading ? 'Joining...' : 'Join Waitlist'}
              </Button>

              {error && (
                <Typography
                  variant='body2'
                  textAlign='center'
                  sx={{
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    color: '#ffcdd2',
                    backgroundColor: 'rgba(211, 47, 47, 0.2)',
                    py: 1,
                    px: 2,
                    borderRadius: 1,
                  }}
                >
                  {error}
                </Typography>
              )}

              {/* Sign In */}
              <Box sx={{ pt: 3, borderTop: '1px solid rgba(255, 255, 255, 0.2)', mb: 16 }}>
                <Typography
                  variant='body2'
                  textAlign='center'
                  sx={{
                    mb: 1.5,
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    color: 'rgba(255, 255, 255, 0.8)',
                  }}
                >
                  Already have access?
                </Typography>
                <Button
                  variant='text'
                  size='medium'
                  fullWidth
                  onClick={handleSignIn}
                  sx={{
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  Sign In →
                </Button>
              </Box>
            </Stack>
          </Box>

          {/* Footer */}
          <Typography
            variant='caption'
            sx={{
              color: 'rgba(255, 255, 255, 0.75)',
              textAlign: 'center',
              fontSize: '0.875rem',
              fontFamily: 'inherit',
              mt: 0,
            }}
          >
            © 2025 ectropy.ai. All rights reserved.
          </Typography>
        </Stack>
      </Container>

      {/* Success Snackbar */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSuccess(false)}
          severity='success'
          sx={{
            width: '100%',
            fontSize: '1rem',
            fontFamily: 'inherit',
          }}
        >
          Welcome to Ectropy! Check your email for confirmation.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LandingPage;
