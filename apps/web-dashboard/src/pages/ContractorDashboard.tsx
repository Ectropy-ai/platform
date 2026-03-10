import React, { useState, useEffect } from 'react';
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
  Build,
  Timeline,
  People,
  PhotoCamera,
  Assignment,
  ViewInAr,
  Construction,
  Update,
  CheckCircle as CheckCircleIcon,
  Groups as GroupsIcon,
  TrendingUp,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useProjects, useElements, useConstructionData, useCrewMembers } from '../hooks/queries';
import SpeckleBIMViewer from '../components/BIMViewer/SpeckleBIMViewer';
import ElementPropertiesPanel from '../components/BIMViewer/ElementPropertiesPanel';
import { config } from '../services/config';
import { logger } from '../services/logger';
import {
  StatsCard,
  StatsGrid,
  TaskTable,
  CrewList,
  type Task,
  type CrewMember as DashboardCrewMember,
} from '../components/dashboard';

interface ContractorDashboardProps {}

const ContractorDashboard: React.FC<ContractorDashboardProps> = () => {
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
    tasks: constructionTasks,
    stats: contractorStats,
    isLoading: tasksLoading,
  } = useConstructionData({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
  });

  const {
    crew: crewMembers,
    count: crewCount,
    activeCount: activeCrewCount,
    isLoading: crewLoading,
  } = useCrewMembers({
    projectId: selectedProject?.id,
    enabled: !!selectedProject?.id,
  });

  // Combined loading state
  const loading = projectsLoading || tasksLoading || crewLoading;

  // Local UI state
  const [selectedBIMElement, setSelectedBIMElement] = useState<any>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
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
        logger.debug('[ContractorDashboard] MCP status check failed', { error: e });
        setMcpStatus('offline');
      });
  }, []);

  const handleBIMElementSelect = (elementId: string, properties: any) => {
    setSelectedBIMElement(properties);
  };

  const handleElementAction = (action: string, elementId: string) => {
    logger.debug('[ContractorDashboard] Action triggered', { action, elementId });
    switch (action) {
      case 'update_progress':
        setProgressDialogOpen(true);
        break;
      case 'assign_crew':
        logger.debug('[ContractorDashboard] Assigning crew', { elementId });
        break;
      default:
        logger.debug('[ContractorDashboard] Unknown action', { action });
    }
  };

  const updateProgress = () => {
    logger.debug('[ContractorDashboard] Updating progress', { element: selectedBIMElement?.name });
    setProgressDialogOpen(false);
  };

  // Transform construction tasks for TaskTable component
  const tasksForTable: Task[] = constructionTasks.map(t => ({
    id: t.id,
    task: t.task,
    status: t.status,
    crew: t.crew,
    deadline: t.deadline,
    progress: t.progress,
  }));

  // Transform crew members for CrewList component
  const crewForList: DashboardCrewMember[] = crewMembers.map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    status: m.status as 'active' | 'scheduled' | 'inactive',
    crew: m.crew,
    email: m.email,
    company: m.company,
  }));

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading contractor dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant='h4' sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Build color='primary' />
            Contractor Dashboard
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
          Welcome back, {user?.name}. Manage construction progress and coordinate teams.
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
          Construction execution and progress tracking - Monitor installations, manage crews, and
          ensure quality control.
        </Typography>
      </Box>

      {/* Stats Cards - Using reusable StatsGrid component */}
      <StatsGrid columns={4}>
        <StatsCard
          title='Total Tasks'
          value={contractorStats.totalTasks}
          icon={<Timeline />}
          badge={`${contractorStats.completedTasks} completed`}
          status='success'
          testId='dashboard-card-tasks'
          loading={tasksLoading}
        />
        <StatsCard
          title='Active Crew'
          value={activeCrewCount}
          icon={<GroupsIcon />}
          badge='On site today'
          status='info'
          testId='dashboard-card-crew'
          loading={crewLoading}
        />
        <StatsCard
          title='Schedule Status'
          value={contractorStats.onSchedule}
          icon={<ScheduleIcon />}
          badge='On track'
          status='success'
          testId='dashboard-card-schedule'
          loading={tasksLoading}
        />
        <StatsCard
          title='Progress'
          value={`${contractorStats.overallProgress}%`}
          icon={<TrendingUp />}
          badge='This month'
          status={contractorStats.overallProgress >= 50 ? 'success' : 'warning'}
          testId='dashboard-card-progress'
          loading={tasksLoading}
        />
      </StatsGrid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Main BIM Viewer - Construction Focus */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <ViewInAr color='primary' />
              <Typography variant='h6'>Construction Progress View</Typography>
              <Chip
                label={config.enableSpeckle ? 'CONTRACTOR VIEW' : 'UNAVAILABLE'}
                color={config.enableSpeckle ? 'warning' : 'default'}
                size='small'
              />
            </Box>

            {/* ENTERPRISE FIX (2025-12-18): ROOT CAUSE #57 - Feature flag guard for BIM viewer */}
            {config.enableSpeckle ? (
              <SpeckleBIMViewer
                streamId={undefined}
                objectId={undefined}
                stakeholderRole='contractor'
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

        {/* Construction Management Tools */}
        <Grid item xs={12} lg={4}>
          {/* Element Properties Panel */}
          <ElementPropertiesPanel
            selectedElement={selectedBIMElement}
            stakeholderRole='contractor'
            onElementAction={handleElementAction}
          />

          {/* Construction Tools */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Construction color='primary' />
              <Typography variant='h6'>Construction Tools</Typography>
            </Box>
            <Stack spacing={2}>
              <Button
                variant='contained'
                fullWidth
                startIcon={<Update />}
                onClick={() => setProgressDialogOpen(true)}
              >
                Update Progress
              </Button>
              <Button variant='outlined' fullWidth startIcon={<PhotoCamera />}>
                Progress Photos
              </Button>
              <Button variant='outlined' fullWidth startIcon={<People />}>
                Assign Crew
              </Button>
              <Button variant='outlined' fullWidth startIcon={<Assignment />}>
                Daily Report
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Construction Tasks and Crew Management - Using reusable components */}
      <Box sx={{ mt: 3 }}>
        <Alert severity='info' sx={{ mb: 2 }}>
          <strong>Live Construction Coordination:</strong> All design updates and engineering
          changes are automatically reflected in your construction sequence.
        </Alert>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <TaskTable
              tasks={tasksForTable}
              title='Construction Tasks'
              icon={<Timeline color='primary' />}
              loading={tasksLoading}
              showCrew
              showDeadline
              showProgress
              showStatusIcon
              emptyMessage='No construction tasks scheduled'
              onRowClick={task => {
                logger.debug('[ContractorDashboard] Task clicked', { taskId: task.id });
              }}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <CrewList
              crew={crewForList}
              title='Active Crew'
              icon={<People color='primary' />}
              loading={crewLoading}
              showTeam
              maxItems={8}
              emptyMessage='No crew members assigned'
            />
          </Grid>
        </Grid>
      </Box>

      {/* Progress Update Dialog */}
      <Dialog
        open={progressDialogOpen}
        onClose={() => setProgressDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Update Construction Progress</DialogTitle>
        <DialogContent>
          <Typography variant='h6' sx={{ mb: 2 }}>
            Selected Element: {selectedBIMElement?.name || 'None'}
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                label='Progress Percentage'
                type='number'
                defaultValue='0'
                inputProps={{ min: 0, max: 100 }}
                fullWidth
                sx={{ mb: 2 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Crew Assignment'
                defaultValue='Foundation Team'
                fullWidth
                sx={{ mb: 2 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='Progress Notes'
                multiline
                rows={3}
                placeholder='Add notes about current progress, issues, or next steps...'
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressDialogOpen(false)}>Cancel</Button>
          <Button onClick={updateProgress} variant='contained'>
            Update Progress
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ContractorDashboard;
