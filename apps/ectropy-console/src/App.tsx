/**
 * ==============================================================================
 * ECTROPY EMPLOYEE CONSOLE - MAIN APPLICATION
 * ==============================================================================
 * Platform administration interface with platform admin authentication gate.
 * Only users with is_platform_admin = true can access this application.
 *
 * Routes:
 * - / (Dashboard) - Overview with tenant counts, user stats, system health
 * - /tenants - Tenant management (list, create, configure)
 * - /users - Cross-tenant user management and authorization
 * - /monitoring - System health and Grafana embeds
 * ==============================================================================
 */

import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Alert,
  AlertTitle,
  Button,
  Typography,
} from '@mui/material';
import { Security, Logout } from '@mui/icons-material';

import { consoleApi, type CurrentUser } from './services/console-api';
import ConsoleLayout from './components/layout/ConsoleLayout';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import UsersPage from './pages/UsersPage';
import MonitoringPage from './pages/MonitoringPage';

// ==============================================================================
// Auth Context
// ==============================================================================

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  logout: () => void;
}

export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: () => {},
});

export const useAuth = () => React.useContext(AuthContext);

// ==============================================================================
// Loading Screen
// ==============================================================================

const LoadingScreen: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: 2,
    }}
  >
    <CircularProgress size={48} />
    <Typography variant="body1" color="text.secondary">
      Verifying platform admin access...
    </Typography>
  </Box>
);

// ==============================================================================
// Access Denied Screen
// ==============================================================================

interface AccessDeniedProps {
  email?: string;
  onLogout: () => void;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ email, onLogout }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: 3,
      p: 4,
    }}
  >
    <Security sx={{ fontSize: 64, color: 'error.main' }} />
    <Alert severity="error" sx={{ maxWidth: 500 }}>
      <AlertTitle>Access Denied</AlertTitle>
      <Typography variant="body2" gutterBottom>
        The Ectropy Employee Console is restricted to platform administrators.
      </Typography>
      {email && (
        <Typography variant="body2" color="text.secondary">
          Logged in as: <strong>{email}</strong>
        </Typography>
      )}
      <Typography variant="body2" sx={{ mt: 1 }}>
        If you believe you should have access, contact your system
        administrator.
      </Typography>
    </Alert>
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Button variant="outlined" startIcon={<Logout />} onClick={onLogout}>
        Sign Out
      </Button>
      <Button variant="contained" href="/" target="_blank">
        Go to Customer Dashboard
      </Button>
    </Box>
  </Box>
);

// ==============================================================================
// Login Required Screen
// ==============================================================================

interface LoginRequiredProps {
  onLogin: () => void;
}

const LoginRequired: React.FC<LoginRequiredProps> = ({ onLogin }) => {
  // Check for OAuth error parameters (aligns with web-dashboard Login.tsx pattern)
  const urlParams = new URLSearchParams(window.location.search);
  const oauthError = urlParams.get('error');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 3,
        p: 4,
      }}
    >
      <Typography variant="h4" fontWeight={600}>
        Ectropy Employee Console
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        maxWidth={400}
      >
        Platform administration interface for Ectropy staff. Sign in with your
        Ectropy account to continue.
      </Typography>
      {oauthError === 'oauth_failed' && (
        <Alert severity="error" sx={{ maxWidth: 400, width: '100%' }}>
          Authentication failed. Please try signing in again.
        </Alert>
      )}
      {oauthError === 'session_timeout' && (
        <Alert severity="warning" sx={{ maxWidth: 400, width: '100%' }}>
          Your session expired. Please sign in again.
        </Alert>
      )}
      <Button
        data-testid="google-oauth-button"
        variant="contained"
        size="large"
        onClick={onLogin}
        sx={{ mt: 2 }}
        aria-label="Sign in with Google"
      >
        Sign in with Google
      </Button>
    </Box>
  );
};

// ==============================================================================
// Main App Component
// ==============================================================================

const App: React.FC = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check authentication on mount (aligned with web-dashboard useAuth.tsx pattern)
  useEffect(() => {
    // Failsafe timeout: force isLoading=false after 30s if API unresponsive
    // Prevents infinite loading screen (aligns with web-dashboard useAuth.tsx:55-61)
    const absoluteFailsafe = setTimeout(() => {
      console.error(
        '[Console] Auth check absolute timeout (30s) - forcing isLoading=false'
      );
      setIsLoading(false);
    }, 30000);

    const checkAuth = async (retryCount = 0) => {
      try {
        const response = await consoleApi.getCurrentUser();

        if (response.success && response.data) {
          setUser(response.data);
          clearTimeout(absoluteFailsafe);
          setIsLoading(false);
          return;
        }

        // OAuth callback retry logic (aligns with web-dashboard useAuth.tsx:142-146)
        // After OAuth redirect, session cookie may not be immediately available
        const isCallback = window.location.search?.includes('code=') || false;
        if (isCallback && retryCount < 3) {
          const delay = 500 * (retryCount + 1);
          console.debug(
            `[Console] OAuth callback retry ${retryCount + 1}/3 in ${delay}ms`
          );
          setTimeout(() => checkAuth(retryCount + 1), delay);
          return;
        }

        setUser(null);
      } catch {
        // Failed to connect - user remains null
        setUser(null);
      } finally {
        // Only set loading to false if not retrying
        const isCallback = window.location.search?.includes('code=') || false;
        if (!isCallback || retryCount >= 3) {
          clearTimeout(absoluteFailsafe);
          setIsLoading(false);
        }
      }
    };

    checkAuth();

    return () => clearTimeout(absoluteFailsafe);
  }, []);

  const handleLogin = () => {
    // Redirect to OAuth flow
    window.location.href = '/api/auth/google';
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors
    }
    setUser(null);
    navigate('/');
  };

  // Loading state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Not logged in
  if (!user) {
    return <LoginRequired onLogin={handleLogin} />;
  }

  // Logged in but not platform admin
  if (!user.isPlatformAdmin) {
    return <AccessDenied email={user.email} onLogout={handleLogout} />;
  }

  // Authenticated platform admin - render console
  return (
    <AuthContext.Provider value={{ user, isLoading, logout: handleLogout }}>
      <ConsoleLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConsoleLayout>
    </AuthContext.Provider>
  );
};

export default App;
