import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Button,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { AccountCircle, ExitToApp, BusinessCenter, ViewInAr } from '@mui/icons-material';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { RoleProvider } from './contexts/RoleContext';
import { DataProvider } from './contexts/DataProvider';
const ArchitectDashboard = lazy(() => import('./pages/ArchitectDashboard'));
const EngineerDashboard = lazy(() => import('./pages/EngineerDashboard'));
const ContractorDashboard = lazy(() => import('./pages/ContractorDashboard'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const PlatformDashboard = lazy(() => import('./pages/PlatformDashboard')); // Phase 2: Tier 0 landing page
import LandingPage from './pages/LandingPage';
const ProjectsListPage = lazy(() => import('./pages/ProjectsListPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const ViewerPage = lazy(() => import('./pages/ViewerPage').then(m => ({ default: m.ViewerPage })));
const UserManagementPage = lazy(() =>
  import('./components/admin/user-management').then(m => ({ default: m.UserManagementPage })),
);
import { ectropyTheme } from './theme/ectropy-theme';
import Login from './components/Login';
import { UpgradeModalManager } from './components/modals';

// OAuth callback detection helper
const isOAuthCallback = () => {
  const path = window.location.pathname;
  const search = window.location.search;
  return path === '/dashboard' || search.includes('dashboard') || search.includes('code='); // OAuth code param from provider
};

// Main App Component
const MainApp: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: any) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleClose();
  };

  // Determine current view from URL path
  const currentView = location.pathname.startsWith('/projects')
    ? 'projects'
    : location.pathname === '/viewer'
      ? 'viewer'
      : 'dashboard';

  // Loading fallback for lazy-loaded components
  const LoadingFallback = () => (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <CircularProgress size={60} />
    </Box>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position='static'>
        <Toolbar data-testid='dashboard-nav'>
          <Typography variant='h6' component='div' sx={{ flexGrow: 1 }}>
            Ectropy Platform
          </Typography>
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                color='inherit'
                onClick={() => navigate('/dashboard')}
                variant={currentView === 'dashboard' ? 'outlined' : 'text'}
              >
                Dashboard
              </Button>
              <Button
                color='inherit'
                startIcon={<BusinessCenter />}
                onClick={() => navigate('/projects')}
                variant={currentView === 'projects' ? 'outlined' : 'text'}
              >
                Projects
              </Button>
              <Button
                color='inherit'
                startIcon={<ViewInAr />}
                onClick={() => navigate('/viewer')}
                variant={currentView === 'viewer' ? 'outlined' : 'text'}
              >
                Viewer
              </Button>
              <Typography variant='body2' sx={{ ml: 2 }}>
                {user.name}
              </Typography>
              <IconButton size='large' onClick={handleMenu} color='inherit'>
                <AccountCircle />
              </IconButton>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                <MenuItem onClick={handleLogout}>
                  <ExitToApp sx={{ mr: 2 }} />
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Box component='main' data-testid='dashboard-main' sx={{ flexGrow: 1 }}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path='/viewer' element={<ViewerPage />} />
            <Route path='/projects' element={<ProjectsListPage />} />
            <Route path='/projects/:id' element={<ProjectDetailPage />} />
            <Route path='/admin/users' element={<UserManagementPage />} />
            {/* Phase 2: Tier 0 Platform Dashboard as landing page */}
            <Route path='/dashboard' element={<PlatformDashboard />} />
            <Route path='/' element={<Navigate to='/dashboard' replace />} />
            {/* Legacy role-based dashboards (kept for direct navigation) */}
            <Route path='/dashboard/admin' element={<AdminDashboard />} />
            <Route path='/dashboard/architect' element={<ArchitectDashboard />} />
            <Route path='/dashboard/engineer' element={<EngineerDashboard />} />
            <Route path='/dashboard/contractor' element={<ContractorDashboard />} />
            <Route path='/dashboard/owner' element={<OwnerDashboard />} />
          </Routes>
        </Suspense>
      </Box>

      {/* Global 402 Error Handler - Phase 8.2 */}
      <UpgradeModalManager />
    </Box>
  );
};

// App Container with Authentication
const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [isOAuthFlow, setIsOAuthFlow] = useState(isOAuthCallback());
  const [showLanding, setShowLanding] = useState(() => {
    // Don't show landing if OAuth callback detected
    if (isOAuthCallback()) {
      return false;
    }
    // Show landing only on root path with no special params
    const path = window.location.pathname;
    const search = window.location.search;
    return path === '/' && !search.includes('login');
  });

  // Handle OAuth callback completion
  React.useEffect(() => {
    if (isOAuthFlow && !isLoading) {
      if (user) {
        // OAuth succeeded - ensure dashboard shows
        setShowLanding(false);
        setIsOAuthFlow(false);
      } else {
        // OAuth failed - redirect to login with error
        // Note: Using window.location.href for full page reload to reset state
        window.location.href = '/?error=oauth_failed';
      }
    }
  }, [user, isLoading, isOAuthFlow]);

  // Show loading during OAuth callback processing
  // BUT: If we already have a user, skip the loading screen and show dashboard immediately
  if (isOAuthFlow && isLoading && !user) {
    return (
      <ThemeProvider theme={ectropyTheme}>
        <Container maxWidth='sm' sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant='h6' gutterBottom>
            Completing authentication...
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            Please wait while we verify your credentials
          </Typography>
        </Container>
      </ThemeProvider>
    );
  }

  // Existing loading state (keep for non-OAuth scenarios)
  if (isLoading && !isOAuthFlow) {
    return (
      <ThemeProvider theme={ectropyTheme}>
        <Container maxWidth='sm' sx={{ mt: 8, textAlign: 'center' }}>
          <Typography variant='h6'>Loading...</Typography>
        </Container>
      </ThemeProvider>
    );
  }

  // If landing page is requested and no user, show landing
  if (showLanding && !user) {
    return (
      <ThemeProvider theme={ectropyTheme}>
        <LandingPage />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={ectropyTheme}>
      <DataProvider>
        <RoleProvider userRole={user?.roles?.[0] as any}>
          {user ? <MainApp /> : <Login />}
        </RoleProvider>
      </DataProvider>
    </ThemeProvider>
  );
};

// Root App with Provider
const AppWithProvider: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppWithProvider;
