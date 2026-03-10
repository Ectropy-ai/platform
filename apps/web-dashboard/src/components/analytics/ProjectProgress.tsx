import React from 'react';
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Stack,
  Grid,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
} from '@mui/material';
import {
  Timeline,
  CheckCircle,
  Schedule,
  Warning,
  TrendingUp,
  Assignment,
  People,
  AccountBalance,
} from '@mui/icons-material';
// Chart components removed to avoid TypeScript issues - using Material-UI visualizations instead

interface ProjectProgressProps {
  projectId?: string;
}

const ProjectProgress: React.FC<ProjectProgressProps> = ({ projectId }) => {
  // Mock data for demonstration
  const projectData = {
    id: projectId || 'proj-001',
    name: 'Downtown Office Complex',
    phase: 'Construction',
    overallProgress: 67,
    phases: [
      {
        name: 'Planning',
        progress: 100,
        status: 'completed',
        startDate: '2025-01-01',
        endDate: '2025-02-28',
      },
      {
        name: 'Design',
        progress: 100,
        status: 'completed',
        startDate: '2025-03-01',
        endDate: '2025-05-15',
      },
      {
        name: 'Permits',
        progress: 100,
        status: 'completed',
        startDate: '2025-04-01',
        endDate: '2025-06-30',
      },
      {
        name: 'Construction',
        progress: 67,
        status: 'in-progress',
        startDate: '2025-07-01',
        endDate: '2025-12-15',
      },
      {
        name: 'Final Inspection',
        progress: 0,
        status: 'pending',
        startDate: '2025-12-16',
        endDate: '2025-12-30',
      },
    ],
    timeline: [
      { month: 'Jan', planned: 10, actual: 12 },
      { month: 'Feb', planned: 25, actual: 22 },
      { month: 'Mar', planned: 40, actual: 35 },
      { month: 'Apr', planned: 55, actual: 50 },
      { month: 'May', planned: 70, actual: 67 },
      { month: 'Jun', planned: 85, actual: 67 },
      { month: 'Jul', planned: 100, actual: 67 },
    ],
    budget: {
      total: 15000000,
      spent: 10050000,
      remaining: 4950000,
      variance: -5.5,
    },
    milestones: [
      { name: 'Foundation Complete', date: '2025-08-15', status: 'completed' },
      { name: 'Structural Frame', date: '2025-09-30', status: 'completed' },
      { name: 'Roof Installation', date: '2025-11-15', status: 'in-progress' },
      { name: 'Interior Finishing', date: '2025-12-01', status: 'pending' },
      { name: 'Final Walkthrough', date: '2025-12-20', status: 'pending' },
    ],
    risks: [
      { severity: 'high', description: 'Weather delays for roofing', probability: 70 },
      { severity: 'medium', description: 'Material delivery delays', probability: 40 },
      { severity: 'low', description: 'Labor shortage', probability: 20 },
    ],
  };

  const phaseColors = ['#4caf50', '#2196f3', '#ff9800', '#f44336'];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color='success' />;
      case 'in-progress':
        return <Schedule color='primary' />;
      case 'pending':
        return <Schedule color='disabled' />;
      default:
        return <Schedule />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in-progress':
        return 'primary';
      case 'pending':
        return 'default';
      default:
        return 'default';
    }
  };

  const getRiskColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Typography variant='h5' gutterBottom sx={{ mb: 3 }}>
        Project Progress Analytics
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack direction='row' alignItems='center' spacing={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <TrendingUp />
                </Avatar>
                <Box>
                  <Typography variant='h6'>{projectData.overallProgress}%</Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Overall Progress
                  </Typography>
                </Box>
              </Stack>
              <LinearProgress
                variant='determinate'
                value={projectData.overallProgress}
                sx={{ mt: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack direction='row' alignItems='center' spacing={2}>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <AccountBalance />
                </Avatar>
                <Box>
                  <Typography variant='h6'>
                    ${(projectData.budget.spent / 1000000).toFixed(1)}M
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Budget Spent
                  </Typography>
                </Box>
              </Stack>
              <Typography
                variant='caption'
                color={projectData.budget.variance < 0 ? 'error' : 'success'}
              >
                {projectData.budget.variance > 0 ? '+' : ''}
                {projectData.budget.variance}% variance
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack direction='row' alignItems='center' spacing={2}>
                <Avatar sx={{ bgcolor: 'warning.main' }}>
                  <Assignment />
                </Avatar>
                <Box>
                  <Typography variant='h6'>
                    {projectData.phases.filter(p => p.status === 'completed').length}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Phases Complete
                  </Typography>
                </Box>
              </Stack>
              <Typography variant='caption' color='text.secondary'>
                of {projectData.phases.length} total phases
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack direction='row' alignItems='center' spacing={2}>
                <Avatar sx={{ bgcolor: 'info.main' }}>
                  <People />
                </Avatar>
                <Box>
                  <Typography variant='h6'>4</Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Active Stakeholders
                  </Typography>
                </Box>
              </Stack>
              <Typography variant='caption' color='text.secondary'>
                Architect, Engineer, Contractor, Owner
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Timeline Progress Visualization */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Progress Timeline
            </Typography>
            <Box sx={{ mt: 2 }}>
              {projectData.timeline.map((item, index) => (
                <Box key={item.month} sx={{ mb: 2 }}>
                  <Stack
                    direction='row'
                    justifyContent='space-between'
                    alignItems='center'
                    sx={{ mb: 1 }}
                  >
                    <Typography variant='body2'>{item.month}</Typography>
                    <Typography variant='body2' color='text.secondary'>
                      Planned: {item.planned}% | Actual: {item.actual}%
                    </Typography>
                  </Stack>
                  <Stack direction='row' spacing={1} alignItems='center'>
                    <Box sx={{ width: '100%' }}>
                      <LinearProgress
                        variant='determinate'
                        value={item.planned}
                        sx={{
                          height: 8,
                          backgroundColor: 'grey.200',
                          '& .MuiLinearProgress-bar': { backgroundColor: 'primary.light' },
                        }}
                      />
                    </Box>
                  </Stack>
                  <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 0.5 }}>
                    <Box sx={{ width: '100%' }}>
                      <LinearProgress
                        variant='determinate'
                        value={item.actual}
                        sx={{ height: 8, backgroundColor: 'transparent' }}
                        color='success'
                      />
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Phase Progress */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Phase Progress
            </Typography>
            <List dense>
              {projectData.phases.map((phase, index) => (
                <ListItem key={phase.name}>
                  <ListItemIcon>{getStatusIcon(phase.status)}</ListItemIcon>
                  <ListItemText
                    primary={
                      <Stack direction='row' justifyContent='space-between' alignItems='center'>
                        <Typography variant='body2'>{phase.name}</Typography>
                        <Chip
                          label={`${phase.progress}%`}
                          size='small'
                          color={getStatusColor(phase.status) as any}
                        />
                      </Stack>
                    }
                    secondary={
                      <LinearProgress
                        variant='determinate'
                        value={phase.progress}
                        sx={{ mt: 1 }}
                        color={getStatusColor(phase.status) as any}
                      />
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Milestones */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Key Milestones
            </Typography>
            <List>
              {projectData.milestones.map((milestone, index) => (
                <ListItem key={milestone.name}>
                  <ListItemIcon>{getStatusIcon(milestone.status)}</ListItemIcon>
                  <ListItemText
                    primary={milestone.name}
                    secondary={`Target: ${new Date(milestone.date).toLocaleDateString()}`}
                  />
                  <Chip
                    label={milestone.status}
                    size='small'
                    color={getStatusColor(milestone.status) as any}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Risk Assessment */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Risk Assessment
            </Typography>
            <List>
              {projectData.risks.map((risk, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Warning color={getRiskColor(risk.severity) as any} />
                  </ListItemIcon>
                  <ListItemText
                    primary={risk.description}
                    secondary={`${risk.probability}% probability`}
                  />
                  <Chip
                    label={risk.severity}
                    size='small'
                    color={getRiskColor(risk.severity) as any}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProjectProgress;
