/**
 * Service Health Panel Component
 *
 * Phase: 2 - Tier 0 Platform Dashboard
 * Roadmap: .roadmap/phase-1-user-provisioning.md
 *
 * Reusable service health monitoring panel for admin dashboards.
 * Displays operational status of platform services.
 *
 * Used in:
 * - PlatformDashboard.tsx (Tier 0 landing page for platform admins)
 * - AdminDashboard.tsx (full admin dashboard)
 */

import React from 'react';
import { Box, Typography, List, ListItem, ListItemIcon, ListItemText, Paper } from '@mui/material';
import { Security, Speed, Storage, Memory, CheckCircle } from '@mui/icons-material';

export interface ServiceHealthItem {
  name: string;
  status: string;
  version?: string;
  detail?: string;
  icon?: React.ReactElement;
}

interface ServiceHealthPanelProps {
  services: ServiceHealthItem[];
  loading?: boolean;
}

/**
 * Service Health Panel
 *
 * Displays health status of platform services:
 * - API Gateway
 * - Database
 * - Redis Cache
 * - Speckle BIM
 * - etc.
 */
const ServiceHealthPanel: React.FC<ServiceHealthPanelProps> = ({ services, loading = false }) => {
  // Default icon if service doesn't provide one
  const getDefaultIcon = (serviceName: string) => {
    const lowerName = serviceName.toLowerCase();
    if (lowerName.includes('api') || lowerName.includes('gateway')) {
      return <Speed />;
    }
    if (lowerName.includes('database') || lowerName.includes('db')) {
      return <Storage />;
    }
    if (lowerName.includes('redis') || lowerName.includes('cache')) {
      return <Memory />;
    }
    if (lowerName.includes('speckle') || lowerName.includes('bim')) {
      return <Security />;
    }
    return <Security />;
  };

  if (loading) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Security color='primary' />
          <Typography variant='h6'>Service Health</Typography>
        </Box>
        <Typography variant='body2' color='text.secondary'>
          Loading service health...
        </Typography>
      </Paper>
    );
  }

  if (services.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Security color='primary' />
          <Typography variant='h6'>Service Health</Typography>
        </Box>
        <Typography variant='body2' color='text.secondary'>
          No service health data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Security color='primary' />
        <Typography variant='h6'>Service Health</Typography>
      </Box>
      <List dense>
        {services.map((service, index) => (
          <ListItem key={index}>
            <ListItemIcon>{service.icon || getDefaultIcon(service.name)}</ListItemIcon>
            <ListItemText
              primary={service.name}
              secondary={
                <>
                  {service.status}
                  {service.detail && (
                    <Typography variant='caption' display='block'>
                      {service.detail}
                    </Typography>
                  )}
                  {service.version && (
                    <Typography variant='caption' display='block'>
                      v{service.version}
                    </Typography>
                  )}
                </>
              }
            />
            <CheckCircle color='success' fontSize='small' />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export default ServiceHealthPanel;
