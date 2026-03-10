import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Stack,
  Chip,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  Speed,
  TrendingUp,
  TrendingDown,
  MonetizationOn,
  Schedule,
  Group,
  Assessment,
  Warning,
  CheckCircle,
  Timer,
} from '@mui/icons-material';

interface PerformanceMetricsProps {
  timeRange?: 'week' | 'month' | 'quarter' | 'year';
}

const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ timeRange = 'month' }) => {
  // Mock performance data
  const metrics = {
    efficiency: {
      current: 87.5,
      target: 90,
      change: +2.3,
      trend: 'up',
    },
    costPerformance: {
      current: 94.2,
      target: 95,
      change: -1.2,
      trend: 'down',
    },
    schedulePerformance: {
      current: 89.8,
      target: 92,
      change: +0.8,
      trend: 'up',
    },
    qualityScore: {
      current: 96.1,
      target: 95,
      change: +1.1,
      trend: 'up',
    },
    stakeholderSatisfaction: {
      current: 92.4,
      target: 90,
      change: +3.2,
      trend: 'up',
    },
    resourceUtilization: {
      current: 85.7,
      target: 88,
      change: -0.5,
      trend: 'down',
    },
  };

  const kpis = [
    {
      title: 'Projects On Time',
      value: '23/25',
      percentage: 92,
      icon: <Schedule />,
      color: 'success',
      target: 95,
    },
    {
      title: 'Budget Adherence',
      value: '18/25',
      percentage: 72,
      icon: <MonetizationOn />,
      color: 'warning',
      target: 85,
    },
    {
      title: 'Quality Standards',
      value: '24/25',
      percentage: 96,
      icon: <CheckCircle />,
      color: 'success',
      target: 90,
    },
    {
      title: 'Stakeholder Engagement',
      value: '22/25',
      percentage: 88,
      icon: <Group />,
      color: 'primary',
      target: 85,
    },
  ];

  const benchmarks = [
    { category: 'Project Delivery', industry: 78, ourScore: 87, unit: '%' },
    { category: 'Cost Efficiency', industry: 85, ourScore: 94, unit: '%' },
    { category: 'Schedule Adherence', industry: 82, ourScore: 90, unit: '%' },
    { category: 'Change Orders', industry: 12, ourScore: 8, unit: 'avg/project' },
    { category: 'Safety Incidents', industry: 3.2, ourScore: 1.8, unit: 'per 100k hrs' },
    { category: 'Rework Rate', industry: 9.5, ourScore: 4.2, unit: '%' },
  ];

  const recentAlerts = [
    {
      type: 'warning',
      message: 'Downtown Complex is 3% over budget',
      timestamp: '2 hours ago',
      action: 'Review required',
    },
    {
      type: 'success',
      message: 'Residential Tower completed milestone early',
      timestamp: '4 hours ago',
      action: 'Celebrate success',
    },
    {
      type: 'info',
      message: 'New DAO proposal requires voting',
      timestamp: '6 hours ago',
      action: 'Vote needed',
    },
    {
      type: 'error',
      message: 'Material delivery delayed for Office Plaza',
      timestamp: '8 hours ago',
      action: 'Schedule adjustment',
    },
  ];

  const getMetricIcon = (title: string) => {
    switch (title.toLowerCase()) {
      case 'efficiency':
        return <Speed />;
      case 'cost performance':
        return <MonetizationOn />;
      case 'schedule performance':
        return <Schedule />;
      case 'quality score':
        return <Assessment />;
      case 'stakeholder satisfaction':
        return <Group />;
      case 'resource utilization':
        return <Timer />;
      default:
        return <TrendingUp />;
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'up' ? <TrendingUp color='success' /> : <TrendingDown color='error' />;
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'success':
        return 'success';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatMetricValue = (value: number, hasTarget = false) => {
    return hasTarget ? `${value.toFixed(1)}%` : value.toFixed(1);
  };

  return (
    <Box>
      <Typography variant='h5' gutterBottom sx={{ mb: 3 }}>
        Performance Metrics Dashboard
      </Typography>

      {/* Key Performance Indicators */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {kpis.map((kpi, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <Card>
              <CardContent>
                <Stack direction='row' alignItems='center' spacing={2}>
                  <Avatar sx={{ bgcolor: `${kpi.color}.main` }}>{kpi.icon}</Avatar>
                  <Box flex={1}>
                    <Typography variant='h6'>{kpi.value}</Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {kpi.title}
                    </Typography>
                  </Box>
                </Stack>
                <Box sx={{ mt: 2 }}>
                  <Stack
                    direction='row'
                    justifyContent='space-between'
                    alignItems='center'
                    sx={{ mb: 1 }}
                  >
                    <Typography variant='body2' color='text.secondary'>
                      {kpi.percentage}% of target ({kpi.target}%)
                    </Typography>
                    <Chip
                      label={kpi.percentage >= kpi.target ? 'On Track' : 'Needs Attention'}
                      size='small'
                      color={kpi.percentage >= kpi.target ? 'success' : 'warning'}
                    />
                  </Stack>
                  <LinearProgress
                    variant='determinate'
                    value={Math.min(kpi.percentage, 100)}
                    color={kpi.color as any}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Core Metrics */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Core Performance Metrics
            </Typography>
            <Grid container spacing={2}>
              {Object.entries(metrics).map(([key, metric]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Card variant='outlined'>
                    <CardContent>
                      <Stack direction='row' alignItems='center' spacing={2}>
                        <Avatar sx={{ bgcolor: 'primary.light' }}>{getMetricIcon(key)}</Avatar>
                        <Box flex={1}>
                          <Typography variant='subtitle1' sx={{ textTransform: 'capitalize' }}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </Typography>
                          <Stack direction='row' alignItems='center' spacing={1}>
                            <Typography variant='h6'>
                              {formatMetricValue(metric.current, true)}
                            </Typography>
                            {getTrendIcon(metric.trend)}
                            <Typography
                              variant='body2'
                              color={metric.trend === 'up' ? 'success.main' : 'error.main'}
                            >
                              {metric.change > 0 ? '+' : ''}
                              {metric.change}%
                            </Typography>
                          </Stack>
                          <Typography variant='caption' color='text.secondary'>
                            Target: {formatMetricValue(metric.target, true)}
                          </Typography>
                        </Box>
                      </Stack>
                      <LinearProgress
                        variant='determinate'
                        value={Math.min((metric.current / metric.target) * 100, 100)}
                        color={metric.current >= metric.target ? 'success' : 'primary'}
                        sx={{ mt: 2 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        {/* Recent Alerts */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Recent Alerts
            </Typography>
            <List dense>
              {recentAlerts.map((alert, index) => (
                <ListItem key={index} sx={{ px: 0 }}>
                  <ListItemIcon>
                    <Warning color={getAlertColor(alert.type) as any} />
                  </ListItemIcon>
                  <ListItemText
                    primary={alert.message}
                    secondary={
                      <Stack
                        direction='row'
                        justifyContent='space-between'
                        alignItems='center'
                        sx={{ mt: 1 }}
                      >
                        <Typography variant='caption' color='text.secondary'>
                          {alert.timestamp}
                        </Typography>
                        <Chip
                          label={alert.action}
                          size='small'
                          variant='outlined'
                          color={getAlertColor(alert.type) as any}
                        />
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Industry Benchmarks */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant='h6' gutterBottom>
              Industry Benchmarks
            </Typography>
            <Grid container spacing={2}>
              {benchmarks.map((benchmark, index) => (
                <Grid item xs={12} md={6} lg={4} key={index}>
                  <Card variant='outlined'>
                    <CardContent>
                      <Typography variant='subtitle2' gutterBottom>
                        {benchmark.category}
                      </Typography>
                      <Stack spacing={2}>
                        <Box>
                          <Stack direction='row' justifyContent='space-between' alignItems='center'>
                            <Typography variant='body2' color='text.secondary'>
                              Industry Average
                            </Typography>
                            <Typography variant='body2'>
                              {benchmark.industry} {benchmark.unit}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant='determinate'
                            value={50} // normalized for visualization
                            color='info'
                            sx={{ mt: 1 }}
                          />
                        </Box>
                        <Box>
                          <Stack direction='row' justifyContent='space-between' alignItems='center'>
                            <Typography variant='body2' fontWeight='medium'>
                              Our Performance
                            </Typography>
                            <Typography variant='body2' fontWeight='medium'>
                              {benchmark.ourScore} {benchmark.unit}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant='determinate'
                            value={
                              benchmark.category === 'Change Orders' ||
                              benchmark.category === 'Safety Incidents' ||
                              benchmark.category === 'Rework Rate'
                                ? Math.max(0, 100 - (benchmark.ourScore / benchmark.industry) * 50)
                                : (benchmark.ourScore / benchmark.industry) * 50
                            }
                            color={benchmark.ourScore > benchmark.industry ? 'success' : 'primary'}
                            sx={{ mt: 1 }}
                          />
                        </Box>
                      </Stack>
                      <Chip
                        label={
                          benchmark.category === 'Change Orders' ||
                          benchmark.category === 'Safety Incidents' ||
                          benchmark.category === 'Rework Rate'
                            ? benchmark.ourScore < benchmark.industry
                              ? 'Above Average'
                              : 'Below Average'
                            : benchmark.ourScore > benchmark.industry
                              ? 'Above Average'
                              : 'Below Average'
                        }
                        size='small'
                        color={
                          benchmark.category === 'Change Orders' ||
                          benchmark.category === 'Safety Incidents' ||
                          benchmark.category === 'Rework Rate'
                            ? benchmark.ourScore < benchmark.industry
                              ? 'success'
                              : 'warning'
                            : benchmark.ourScore > benchmark.industry
                              ? 'success'
                              : 'warning'
                        }
                        sx={{ mt: 2 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PerformanceMetrics;
