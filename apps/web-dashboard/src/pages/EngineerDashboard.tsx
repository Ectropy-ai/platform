import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import {
  Box,
  Typography,
  Grid,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  Engineering,
  Calculate,
  Speed,
  Assessment,
  Timeline,
  ViewInAr,
  BarChart,
  TrendingUp,
  CheckCircle as CheckCircleIcon,
  Pending as PendingIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import {
  useProjects,
  useElements,
  useEngineeringData,
  useStructuralAlerts,
} from '../hooks/queries';
import { type ConstructionElement } from '../services/api';
import SpeckleBIMViewer from '../components/BIMViewer/SpeckleBIMViewer';
import ElementPropertiesPanel from '../components/BIMViewer/ElementPropertiesPanel';
import { config } from '../services/config';
import {
  StatsCard,
  StatsGrid,
  TaskTable,
  AlertList,
  type Task,
  type Alert as DashboardAlert,
} from '../components/dashboard';

interface EngineerDashboardProps {}

const EngineerDashboard: React.FC<EngineerDashboardProps> = () => {
  const { user } = useAuth();

  // SPRINT 4: Use React Query hooks for data fetching (enterprise caching & deduplication)
  const { projects, isLoading: projectsLoading } = useProjects();

  // Get first project for element fetching
  const selectedProject = projects.length > 0 ? projects[0] : null;
  const { elements, isLoading: elementsLoading } = useElements(selectedProject?.id ?? '', {
    enabled: !!selectedProject?.id,
  });

  // ENTERPRISE DATA LAYER (Sprint 2 - 2026-01-23): Real data from Prisma models
  const {
    tasks: engineeringTasks,
    stats: engineeringStats,
    isLoading: tasksLoading,
  } = useEngineeringData({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
  });

  const {
    alerts: structuralAlerts,
    count: alertCount,
    isLoading: alertsLoading,
    criticalCount,
    warningCount,
  } = useStructuralAlerts({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
  });

  // Combined loading state
  const loading = projectsLoading || tasksLoading || alertsLoading;

  // Local UI state
  const [selectedBIMElement, setSelectedBIMElement] = useState<any>(null);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ConstructionElement | null>(null);
  const [mcpStatus, setMcpStatus] = useState<string>('checking...');
  const [mcpScore, setMcpScore] = useState<number | null>(null);

  useEffect(() => {
    // Fetch MCP health status (ENTERPRISE FIX 2025-12-09: Use apiBaseUrl for health, not speckleServerUrl)
    fetch(`${config.apiBaseUrl}/health`)
      .then(r => r.json())
      .then(data => {
        if (data.status) {
          setMcpStatus(data.status);
        }
        if (data.score !== undefined) {
          setMcpScore(data.score);
        }
      })
      .catch(e => {
        logger.debug('MCP status check failed:', e);
        setMcpStatus('offline');
      });
  }, []);

  const handleBIMElementSelect = (elementId: string, properties: any) => {
    setSelectedBIMElement(properties);
  };

  const handleElementAction = (action: string, elementId: string) => {
    logger.debug(`Engineer action: ${action} on element ${elementId}`);
    switch (action) {
      case 'analyze':
        setAnalysisDialogOpen(true);
        break;
      case 'calculate_loads':
        logger.debug('Calculating loads for element', { elementId });
        break;
      default:
        logger.debug('Unknown action', { action });
    }
  };

  const performStructuralAnalysis = () => {
    logger.debug('Performing structural analysis', { elementName: selectedElement?.name });
    setAnalysisDialogOpen(false);
  };

  // Transform engineering tasks for TaskTable component
  const tasksForTable: Task[] = engineeringTasks.map(t => ({
    id: t.id,
    task: t.task,
    status: t.status,
    priority: t.priority,
  }));

  // Transform structural alerts for AlertList component
  const alertsForList: DashboardAlert[] = structuralAlerts.map(a => ({
    id: a.id,
    message: a.message,
    severity: a.severity as 'error' | 'warning' | 'info' | 'success',
    element: a.element,
    title: a.title,
    createdAt: a.createdAt,
  }));

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading engineer dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant='h4' sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Engineering color='primary' />
            Engineer Dashboard
          </Typography>
          <Chip
            data-testid='mcp-status'
            label={`MCP: ${mcpStatus}${mcpScore !== null ? ` (${mcpScore})` : ''}`}
            color={
              mcpStatus === 'operational' || mcpStatus === 'healthy'
                ? 'success'
                : mcpStatus === 'degraded'
                  ? 'warning'
                  : 'default'
            }
            size='small'
          />
        </Box>
        <Typography variant='subtitle1' color='text.secondary'>
          Welcome back, {user?.name}. Monitor structural integrity and perform engineering analysis.
        </Typography>
      </Box>

      {/* Stats Cards - Using reusable StatsGrid component */}
      <StatsGrid columns={4}>
        <StatsCard
          title='Active Analyses'
          value={engineeringStats.activeAnalyses}
          icon={<TrendingUp />}
          badge={`${engineeringStats.activeAnalyses} in progress`}
          status='info'
          testId='dashboard-card-analyses'
          loading={tasksLoading}
        />
        <StatsCard
          title='Completed Calculations'
          value={engineeringStats.completedCalculations}
          icon={<CheckCircleIcon />}
          badge='This month'
          status='success'
          testId='dashboard-card-calculations'
          loading={tasksLoading}
        />
        <StatsCard
          title='Pending Approvals'
          value={engineeringStats.pendingApprovals}
          icon={<PendingIcon />}
          badge='Awaiting review'
          status='warning'
          testId='dashboard-card-approvals'
          loading={tasksLoading}
        />
        <StatsCard
          title='Structural Alerts'
          value={alertCount}
          icon={<WarningIcon />}
          badge={criticalCount > 0 ? `${criticalCount} critical` : `${warningCount} warnings`}
          status={criticalCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success'}
          testId='dashboard-card-alerts'
          loading={alertsLoading}
        />
      </StatsGrid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Main BIM Viewer - Engineering Focus */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <ViewInAr color='primary' />
              <Typography variant='h6'>Structural Analysis View</Typography>
              <Chip
                label={config.enableSpeckle ? 'ENGINEER VIEW' : 'UNAVAILABLE'}
                color={config.enableSpeckle ? 'secondary' : 'default'}
                size='small'
              />
            </Box>

            {/* ENTERPRISE FIX (2025-12-18): ROOT CAUSE #57 - Feature flag guard for BIM viewer */}
            {config.enableSpeckle ? (
              <SpeckleBIMViewer
                streamId={undefined}
                objectId={undefined}
                stakeholderRole='engineer'
                onElementSelect={handleBIMElementSelect}
                height='600px'
                serverUrl={config.speckleApiUrl}
              />
            ) : (
              <Alert severity='info' sx={{ my: 4 }}>
                <strong>BIM Viewer Currently Unavailable</strong>
                <br />
                3D building visualization requires Speckle server configuration. This feature will
                be available when the platform is fully deployed.
              </Alert>
            )}
          </Paper>
        </Grid>

        {/* Engineering Tools and Properties */}
        <Grid item xs={12} lg={4}>
          {/* Element Properties Panel */}
          <ElementPropertiesPanel
            selectedElement={selectedBIMElement}
            stakeholderRole='engineer'
            onElementAction={handleElementAction}
          />

          {/* Analysis Tools */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Calculate color='primary' />
              <Typography variant='h6'>Analysis Tools</Typography>
            </Box>
            <Stack spacing={2}>
              <Button
                variant='contained'
                fullWidth
                startIcon={<Calculate />}
                onClick={() => setAnalysisDialogOpen(true)}
              >
                Structural Analysis
              </Button>
              <Button variant='outlined' fullWidth startIcon={<Speed />}>
                Load Calculations
              </Button>
              <Button variant='outlined' fullWidth startIcon={<Assessment />}>
                Generate Report
              </Button>
              <Button variant='outlined' fullWidth startIcon={<BarChart />}>
                Performance Analysis
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Engineering Tasks Overview - Using reusable components */}
      <Box sx={{ mt: 3 }}>
        <Alert severity='info' sx={{ mb: 2 }}>
          <strong>Real-time Structural Analysis:</strong> All design changes from the architectural
          team are automatically analyzed for structural integrity.
        </Alert>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <TaskTable
              tasks={tasksForTable}
              title='Engineering Tasks'
              icon={<Timeline color='primary' />}
              loading={tasksLoading}
              showPriority
              showStatusIcon
              emptyMessage='No engineering tasks assigned'
              onRowClick={task => {
                logger.debug('Task clicked', { taskId: task.id });
              }}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <AlertList
              alerts={alertsForList}
              title='Structural Alerts'
              loading={alertsLoading}
              showElement
              maxItems={5}
              emptyMessage='No structural alerts - all systems nominal'
            />
          </Grid>
        </Grid>
      </Box>

      {/* Analysis Dialog */}
      <Dialog
        open={analysisDialogOpen}
        onClose={() => setAnalysisDialogOpen(false)}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>Structural Analysis</DialogTitle>
        <DialogContent>
          <Typography variant='h6' sx={{ mb: 2 }}>
            Selected Element: {selectedElement?.name || selectedBIMElement?.name || 'None'}
          </Typography>

          {(selectedElement || selectedBIMElement) && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant='subtitle2'>Element Information</Typography>
                <Typography variant='body2'>
                  Type: {selectedElement?.type || selectedBIMElement?.speckle_type || 'Unknown'}
                </Typography>
                <Typography variant='body2'>
                  Material:{' '}
                  {selectedElement?.material || selectedBIMElement?.material || 'Not specified'}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant='subtitle2' sx={{ mt: 2 }}>
                  Analysis Parameters
                </Typography>
                <TextField
                  label='Load Factor'
                  type='number'
                  defaultValue='1.5'
                  size='small'
                  sx={{ mr: 2, mt: 1 }}
                />
                <TextField
                  label='Safety Factor'
                  type='number'
                  defaultValue='2.0'
                  size='small'
                  sx={{ mt: 1 }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnalysisDialogOpen(false)}>Cancel</Button>
          <Button onClick={performStructuralAnalysis} variant='contained'>
            Run Analysis
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EngineerDashboard;
