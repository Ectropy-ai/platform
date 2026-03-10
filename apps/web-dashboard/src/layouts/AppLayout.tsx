/**
 * Enhanced App Layout Component
 * Production-ready layout with Material-UI components
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  useTheme,
  useMediaQuery,
  Badge,
  Tooltip,
  Chip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Assignment as ProjectIcon,
  Inventory as MaterialIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountIcon,
  NotificationsActive as NotificationIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  Home as HomeIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { useTheme as useCustomTheme } from '../contexts/ThemeContext';

interface AppLayoutProps {
  children: React.ReactNode;
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  onLogout?: () => void;
}

const drawerWidth = 280;

const AppLayout: React.FC<AppLayoutProps> = ({ children, user, onLogout }) => {
  const theme = useTheme();
  const { themeMode, toggleTheme } = useCustomTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const handleDrawerToggle = useCallback(() => {
    setMobileOpen((prev: boolean) => !prev);
  }, []);

  const handleUserMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  }, []);

  const handleUserMenuClose = useCallback(() => {
    setUserMenuAnchor(null);
  }, []);

  const handleLogout = useCallback(() => {
    handleUserMenuClose();
    onLogout?.();
  }, [onLogout]);

  // Navigation items based on user role
  const navigationItems = useMemo(() => {
    const baseItems = [
      {
        label: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
        roles: ['architect', 'engineer', 'contractor', 'owner', 'admin'],
      },
      {
        label: 'Projects',
        icon: <ProjectIcon />,
        path: '/projects',
        roles: ['architect', 'engineer', 'contractor', 'owner', 'admin'],
      },
      {
        label: 'Materials',
        icon: <MaterialIcon />,
        path: '/materials',
        roles: ['architect', 'engineer', 'contractor', 'admin'],
      },
      {
        label: 'Analytics',
        icon: <AnalyticsIcon />,
        path: '/analytics',
        roles: ['architect', 'engineer', 'contractor', 'owner', 'admin'],
      },
    ];

    const adminItems = [
      {
        label: 'User Management',
        icon: <SecurityIcon />,
        path: '/admin/users',
        roles: ['admin'],
      },
      {
        label: 'System Settings',
        icon: <SettingsIcon />,
        path: '/admin/settings',
        roles: ['admin'],
      },
    ];

    return user?.role
      ? [...baseItems, ...adminItems].filter(item => item.roles.includes(user.role))
      : baseItems;
  }, [user?.role]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'architect':
        return 'primary';
      case 'engineer':
        return 'secondary';
      case 'contractor':
        return 'success';
      case 'owner':
        return 'warning';
      case 'admin':
        return 'error';
      default:
        return 'default';
    }
  };

  const drawerContent = (
    <Box sx={{ width: drawerWidth }}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HomeIcon color='primary' />
          <Typography variant='h6' component='div' color='primary'>
            Ectropy
          </Typography>
        </Box>
      </Toolbar>
      <Divider />

      {user && (
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant='body1' fontWeight='medium'>
                {user.username}
              </Typography>
              <Chip
                label={user.role}
                size='small'
                color={getRoleColor(user.role) as any}
                variant='outlined'
              />
            </Box>
          </Box>
          <Divider />
        </Box>
      )}

      <List>
        {navigationItems.map(item => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position='fixed'
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color='inherit'
            aria-label='open drawer'
            edge='start'
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant='h6' component='div' sx={{ flexGrow: 1 }}>
            Federated Construction Platform
          </Typography>

          {/* Theme Toggle */}
          <Tooltip title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton color='inherit' onClick={toggleTheme}>
              {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          {/* Notifications */}
          <Tooltip title='Notifications'>
            <IconButton color='inherit'>
              <Badge badgeContent={3} color='error'>
                <NotificationIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          {user && (
            <Box>
              <Tooltip title='User menu'>
                <IconButton
                  color='inherit'
                  onClick={handleUserMenuOpen}
                  aria-controls='user-menu'
                  aria-haspopup='true'
                >
                  <Avatar sx={{ width: 32, height: 32 }}>
                    {user.username.charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                id='user-menu'
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={handleUserMenuClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
              >
                <MenuItem onClick={handleUserMenuClose}>
                  <ListItemIcon>
                    <AccountIcon />
                  </ListItemIcon>
                  <ListItemText>Profile</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleUserMenuClose}>
                  <ListItemIcon>
                    <SettingsIcon />
                  </ListItemIcon>
                  <ListItemText>Settings</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText>Logout</ListItemText>
                </MenuItem>
              </Menu>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box component='nav' sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? mobileOpen : true}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component='main'
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: '64px', // AppBar height
          minHeight: 'calc(100vh - 64px)',
          backgroundColor: theme.palette.background.default,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AppLayout;
