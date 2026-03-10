import React, { Fragment } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Stack,
  Chip,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  Payment as PaymentIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

const ProjectOverview: React.FC = () => {
  const projectStats = {
    totalProjects: 12,
    activeProjects: 5,
    completedProjects: 7,
    totalStakeholders: 248,
    daoProposals: 8,
    completionRate: 78,
  };

  const recentActivity = [
    {
      id: 1,
      type: 'proposal',
      title: 'New sustainability template approved',
      timestamp: '2 hours ago',
      status: 'success',
    },
    {
      id: 2,
      type: 'payment',
      title: 'Milestone payment released - Phase 2',
      timestamp: '5 hours ago',
      status: 'success',
    },
    {
      id: 3,
      type: 'bim',
      title: 'BIM model updated by architect',
      timestamp: '1 day ago',
      status: 'info',
    },
    {
      id: 4,
      type: 'governance',
      title: 'Compliance check pending',
      timestamp: '2 days ago',
      status: 'warning',
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'proposal':
        return <SecurityIcon color='success' />;
      case 'payment':
        return <PaymentIcon color='success' />;
      case 'bim':
        return <InfoIcon color='info' />;
      case 'governance':
        return <WarningIcon color='warning' />;
      default:
        return <InfoIcon />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant='h6' sx={{ mb: 2 }}>
          Project Overview
        </Typography>

        <Stack spacing={2}>
          <Box>
            <Typography variant='body2' color='text.secondary'>
              Project Completion
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <LinearProgress
                variant='determinate'
                value={projectStats.completionRate}
                sx={{ flexGrow: 1, height: 8, mr: 2 }}
              />
              <Typography variant='body2' color='text.secondary'>
                {projectStats.completionRate}%
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Chip
              icon={<TrendingUpIcon />}
              label={`${projectStats.activeProjects} Active`}
              color='primary'
              variant='outlined'
              size='small'
            />
            <Chip
              icon={<CheckCircleIcon />}
              label={`${projectStats.completedProjects} Complete`}
              color='success'
              variant='outlined'
              size='small'
            />
            <Chip
              icon={<GroupIcon />}
              label={`${projectStats.totalStakeholders} Stakeholders`}
              color='info'
              variant='outlined'
              size='small'
            />
          </Box>

          <Divider />

          <Box>
            <Typography variant='subtitle2' sx={{ mb: 1 }}>
              DAO Governance
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant='body2' color='text.secondary'>
                Active Proposals
              </Typography>
              <Typography variant='body2' color='primary'>
                {projectStats.daoProposals}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant='body2' color='text.secondary'>
                Participation Rate
              </Typography>
              <Typography variant='body2' color='success.main'>
                92%
              </Typography>
            </Box>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant='h6' sx={{ mb: 2 }}>
          Recent Activity
        </Typography>

        <List disablePadding>
          {recentActivity.map((activity, index) => (
            <Fragment key={activity.id}>
              <ListItem alignItems='flex-start' sx={{ px: 0 }}>
                <ListItemIcon sx={{ minWidth: 40 }}>{getActivityIcon(activity.type)}</ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant='body2' component='span'>
                        {activity.title}
                      </Typography>
                      <Chip
                        label={activity.status}
                        color={getStatusColor(activity.status) as any}
                        size='small'
                        variant='outlined'
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant='caption' color='text.secondary'>
                      {activity.timestamp}
                    </Typography>
                  }
                />
              </ListItem>
              {index < recentActivity.length - 1 && <Divider component='li' />}
            </Fragment>
          ))}
        </List>
      </Paper>
    </Stack>
  );
};

export default ProjectOverview;
