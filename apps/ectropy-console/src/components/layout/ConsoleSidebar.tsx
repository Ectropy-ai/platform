/**
 * ==============================================================================
 * CONSOLE SIDEBAR
 * ==============================================================================
 * Navigation sidebar for the Ectropy Employee Console.
 * Contains links to all main console sections.
 * ==============================================================================
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Chip,
} from '@mui/material';
import {
  Dashboard,
  Business,
  People,
  MonitorHeart,
  OpenInNew,
} from '@mui/icons-material';

interface ConsoleSidebarProps {
  width: number;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <Dashboard /> },
  { path: '/tenants', label: 'Tenants', icon: <Business /> },
  { path: '/users', label: 'Users', icon: <People /> },
  { path: '/monitoring', label: 'Monitoring', icon: <MonitorHeart /> },
];

// Grafana URL - configurable via environment variable
const grafanaUrl = import.meta.env.VITE_GRAFANA_BASE_URL || '/grafana';
const externalLinks = [
  { href: grafanaUrl, label: 'Grafana', icon: <OpenInNew fontSize="small" /> },
];

const ConsoleSidebar: React.FC<ConsoleSidebarProps> = ({ width }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
        },
      }}
    >
      {/* Logo / Brand */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1,
            backgroundColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1.2rem',
          }}
        >
          E
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight={600} lineHeight={1.2}>
            Ectropy
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Employee Console
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Main Navigation */}
      <List sx={{ px: 1, py: 2 }}>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={isActive(item.path)}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                  '& .MuiListItemText-primary': {
                    color: 'primary.contrastText',
                    fontWeight: 600,
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
              {item.badge && (
                <Chip
                  label={item.badge}
                  size="small"
                  color="error"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* External Links */}
      <List sx={{ px: 1, py: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 2, display: 'block', mb: 1 }}
        >
          External Tools
        </Typography>
        {externalLinks.map((link) => (
          <ListItem key={link.href} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component="a"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{link.icon}</ListItemIcon>
              <ListItemText primary={link.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Version Info */}
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          Version {import.meta.env.VITE_APP_VERSION || '0.1.0'}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Migration: ectropy-business
        </Typography>
      </Box>
    </Drawer>
  );
};

export default ConsoleSidebar;
