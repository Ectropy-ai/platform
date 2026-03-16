/**
 * Viewer Page
 * Enterprise BIM viewer with stream management, IFC upload, and project integration
 *
 * Features:
 * - Dynamic project selection (fetches user's accessible projects)
 * - Speckle stream management per project
 * - IFC file upload with progress tracking
 * - Role-based viewer controls
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Stack,
  Tabs,
  Tab,
  Alert,
  Divider,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import { ViewInAr, CloudUpload, Settings, FolderOpen, GridView } from '@mui/icons-material';
import SpeckleBIMViewer from '../components/BIMViewer/SpeckleBIMViewer';
import { BIMViewerErrorBoundary } from '../components/BIMViewer/BIMViewerErrorBoundary';
import { IFCUploader } from '../components/BIMViewer/IFCUploader';
import { StreamSelector } from '../components/BIMViewer/StreamSelector';
import { ROSMROView } from '../components/BIMViewer/ROSMROView';
import { useAuth } from '../hooks/useAuth';
import { apiService, type Project } from '../services/api';
import { config } from '../services/config';
import type {
  SpeckleStream,
  SpeckleImportResult,
  SpeckleInitializeResult,
} from '../services/speckle.service';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role='tabpanel'
      hidden={value !== index}
      id={`viewer-tabpanel-${index}`}
      aria-labelledby={`viewer-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export function ViewerPage() {
  const { user } = useAuth();
  // FIX (2026-03-16): Stable primitive for useEffect deps — user object reference
  // changes on every auth refresh, causing project fetch to re-fire and BIMViewer to unmount
  const userId = user?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState(0);
  const [selectedStream, setSelectedStream] = useState<SpeckleStream | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [streamRefreshTrigger, setStreamRefreshTrigger] = useState(0);

  // Project state - enterprise-grade dynamic project selection
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // PHASE 1: Role Switcher Removal (2026-02-09)
  // Project-specific role state - fetched from project_roles table
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [projectRoleLoading, setProjectRoleLoading] = useState(false);
  const [projectRoleError, setProjectRoleError] = useState<string | null>(null);

  // Read URL parameters — stream (BIM viewer) and project (demo project creation)
  const streamIdFromUrl = searchParams.get('stream');
  // FIX (2026-03-06): Five Why — portfolio.routes.ts returns ?project=id but ViewerPage
  // only read ?stream=. Demo project creation navigates to /viewer?project=id, which was
  // ignored, causing flash-to-dashboard. Now reads both params.
  const projectIdFromUrl = searchParams.get('project');

  /**
   * INVESTIGATION: Track selectedStream state changes to identify component unmount cause
   */
  useEffect(() => {
    console.log('🔍 [ViewerPage] selectedStream changed:', {
      stream_id: selectedStream?.stream_id || 'null',
      has_object_id: !!selectedStream?.latest_object_id,
      stream: selectedStream,
    });
  }, [selectedStream]);

  /**
   * Fetch user's accessible projects on mount
   * ENTERPRISE FIX (2026-02-13): Auto-create default project for new users
   * ROOT CAUSE: ViewerPage conditional rendering breaks E2E tests when user has no projects
   * SOLUTION: Auto-create "My First Project" to ensure viewer always has context
   * BENEFITS:
   *   - Solves E2E test failures (7 of 9 viewer tests)
   *   - Improves UX for trial users (immediate access to BIM viewer)
   *   - Supports 60s time-to-value onboarding goal
   * REFERENCE: .roadmap/FIVE_WHY_E2E_TEST_FAILURES_2026-02-13.json
   */
  useEffect(() => {
    let cancelled = false;

    const fetchProjects = async () => {
      setProjectsLoading(true);
      setProjectsError(null);

      try {
        const projectList = await apiService.getProjects();

        if (cancelled) {
          return;
        }

        // AUTO-CREATE DEFAULT PROJECT with deduplication guard
        // Only create if user truly has zero projects AND no "My First Project" exists
        // Platform admins (no tenant_id) skip auto-create — they manage tenants, not own projects
        if (projectList.length === 0 && user?.is_platform_admin) {
          console.log(
            '🔒 [ViewerPage] Platform admin with no projects — skipping auto-create (no tenant_id)',
          );
          setProjects([]);
          setProjectsLoading(false);
          return;
        }

        if (projectList.length === 0) {
          console.log(
            '🆕 [ViewerPage] No projects found - checking for deduplication before auto-create',
          );

          try {
            // Re-fetch to guard against race conditions (StrictMode double-invoke, concurrent tabs)
            const recheck = await apiService.getProjects();
            if (cancelled) {
              return;
            }

            if (recheck.length > 0) {
              console.log('🔄 [ViewerPage] Projects found on recheck - skipping auto-create');
              setProjects(recheck);
              setSelectedProjectId(prev => prev || recheck[0].id);
              return;
            }

            const defaultProject = await apiService.createProject({
              name: 'My First Project',
              description:
                'Welcome to Ectropy! Upload your first IFC file to get started with BIM collaboration.',
            });

            if (cancelled) {
              return;
            }

            console.log('✅ [ViewerPage] Default project created:', defaultProject.id);
            setProjects([defaultProject]);
            setSelectedProjectId(defaultProject.id);
            return;
          } catch (createError) {
            if (cancelled) {
              return;
            }
            const createErrorMessage =
              createError instanceof Error
                ? createError.message
                : 'Failed to create default project';
            console.error('❌ [ViewerPage] Failed to auto-create default project:', createError);
            setProjectsError(`No projects found. ${createErrorMessage}`);
            setProjects([]);
            return;
          }
        }

        // Original logic: Set projects and auto-select
        setProjects(projectList);

        // Auto-select: prefer ?project= URL param, then first project in list
        if (projectIdFromUrl && projectList.find(p => p.id === projectIdFromUrl)) {
          setSelectedProjectId(projectIdFromUrl);
        } else if (projectList.length > 0) {
          setSelectedProjectId(prev => prev || projectList[0].id);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Failed to load projects';
        setProjectsError(errorMessage);
        console.error('Failed to fetch projects:', error);
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    };

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, [userId, projectIdFromUrl]); // Re-fetch when auth state or URL project param changes

  /**
   * Fetch project-specific role when selected project changes
   * PHASE 1: Role Switcher Removal (2026-02-09)
   * Queries project_roles table to get user's role for selected project
   */
  useEffect(() => {
    const fetchProjectRole = async () => {
      if (!selectedProjectId) {
        setProjectRole(null);
        return;
      }

      setProjectRoleLoading(true);
      setProjectRoleError(null);

      try {
        const roleData = await apiService.getMyProjectRole(selectedProjectId);
        setProjectRole(roleData.role);
        console.log('✅ [ViewerPage] Fetched project role:', {
          projectId: selectedProjectId,
          role: roleData.role,
          permissions: roleData.permissions,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load project role';
        setProjectRoleError(errorMessage);
        console.error('❌ [ViewerPage] Failed to fetch project role:', error);
        // Fallback to contractor if role fetch fails
        setProjectRole('contractor');
      } finally {
        setProjectRoleLoading(false);
      }
    };

    fetchProjectRole();
  }, [selectedProjectId]); // Re-fetch when selected project changes

  /**
   * Handle project selection change
   */
  const handleProjectChange = useCallback((event: { target: { value: string } }) => {
    const newProjectId = event.target.value;
    console.log('📁 [ViewerPage] Project changed:', newProjectId);
    setSelectedProjectId(newProjectId);
    // Reset stream selection when project changes
    console.log('🔄 [ViewerPage] Clearing selectedStream (project changed)');
    setSelectedStream(null);
    setSuccessMessage(null);
  }, []);

  // Get the current project ID (selected or empty if none available)
  const projectId = selectedProjectId;

  /**
   * Handle stream selection
   */
  const handleStreamSelect = useCallback(
    (stream: SpeckleStream | null) => {
      console.log('🎯 [ViewerPage] Stream selected:', stream?.stream_id || 'null', stream);
      setSelectedStream(stream);
      setSuccessMessage(null);

      // ENTERPRISE FIX (2026-01-12): Prevent stream=undefined in URL
      // ROOT CAUSE: stream.stream_id could be undefined/null, resulting in literal "undefined" string
      // SOLUTION: Only set URL param if stream_id is valid, otherwise clear all params
      if (stream?.stream_id) {
        setSearchParams({ stream: stream.stream_id });
      } else {
        console.log('🔄 [ViewerPage] Clearing URL params (no stream_id)');
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  /**
   * Handle IFC upload completion
   * ENTERPRISE FIX (2026-01-13): Trigger stream reload to get full stream data with objectId
   */
  const handleUploadComplete = useCallback(
    (result: SpeckleImportResult) => {
      setSuccessMessage(
        `Successfully imported ${result.elementsImported} of ${result.elementsProcessed} elements`,
      );

      // CRITICAL FIX (2026-01-13): Trigger stream reload instead of creating temporary stream
      // ROOT CAUSE: Temporary stream didn't have latest_object_id needed for 3D rendering
      // SOLUTION: Reload streams from backend to get complete data including objectId
      if (result.speckleStreamId) {
        // Set URL parameter to select the stream after reload
        setSearchParams({ stream: result.speckleStreamId });

        // Trigger stream reload - StreamSelector will auto-select based on URL
        setStreamRefreshTrigger(prev => prev + 1);
      }

      // Switch to viewer tab after successful upload
      setCurrentTab(0);
    },
    [setSearchParams],
  );

  /**
   * Handle stream initialization
   */
  const handleStreamInitialized = useCallback((result: SpeckleInitializeResult) => {
    setSuccessMessage(`Stream initialized successfully: ${result.streamId}`);
  }, []);

  /**
   * Handle element selection in viewer
   */
  const handleElementSelect = useCallback((elementId: string, properties: any) => {
    console.log('Element selected:', elementId, properties);
    // In production, this would update a properties panel or trigger other actions
  }, []);

  return (
    <Container maxWidth='xl' sx={{ py: 3 }}>
      <Paper elevation={2}>
        {/* Header */}
        <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent='space-between'
            spacing={2}
          >
            <Stack direction='row' alignItems='center' spacing={2}>
              <ViewInAr sx={{ fontSize: 40, color: 'primary.main' }} />
              <Box>
                <Typography variant='h4' component='h1'>
                  BIM Viewer
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  View and manage 3D building models with Speckle integration
                </Typography>
              </Box>
            </Stack>

            {/* Project Selector */}
            <Box sx={{ minWidth: 280 }}>
              {projectsLoading ? (
                <Skeleton variant='rectangular' height={56} />
              ) : (
                <FormControl fullWidth variant='outlined' size='medium'>
                  <InputLabel id='project-selector-label'>Select Project</InputLabel>
                  <Select
                    labelId='project-selector-label'
                    value={selectedProjectId}
                    onChange={handleProjectChange}
                    label='Select Project'
                    disabled={projects.length === 0}
                    startAdornment={<FolderOpen sx={{ ml: 1, mr: 1, color: 'action.active' }} />}
                  >
                    {projects.length === 0 && (
                      <MenuItem disabled value=''>
                        <em>No projects available</em>
                      </MenuItem>
                    )}
                    {projects.map(project => (
                      <MenuItem key={project.id} value={project.id}>
                        <Box>
                          <Typography variant='body2'>{project.name}</Typography>
                          <Typography variant='caption' color='text.secondary'>
                            {project.status}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          </Stack>

          {/* Projects Error */}
          {projectsError && (
            <Alert severity='warning' onClose={() => setProjectsError(null)} sx={{ mt: 2 }}>
              {projectsError}. Using demo projects.
            </Alert>
          )}

          {/* Success Message */}
          {successMessage && (
            <Alert severity='success' onClose={() => setSuccessMessage(null)} sx={{ mt: 2 }}>
              {successMessage}
            </Alert>
          )}

          {/* No Project Warning */}
          {!projectsLoading && projects.length === 0 && user?.is_platform_admin && (
            <Alert severity='info' sx={{ mt: 2 }}>
              <Typography variant='body2'>
                Platform admin view — no personal projects. Use the admin console to manage tenants and provision demo users.
              </Typography>
              <Button variant='contained' size='small' href='/admin/dashboard' sx={{ mt: 1 }}>
                Admin Console
              </Button>
            </Alert>
          )}
          {!projectsLoading && projects.length === 0 && !user?.is_platform_admin && (
            <Alert severity='info' sx={{ mt: 2 }}>
              <Typography variant='body2'>
                No projects found. Create a project first to use the BIM viewer.
              </Typography>
              <Button variant='contained' size='small' href='/projects' sx={{ mt: 1 }}>
                Go to Projects
              </Button>
            </Alert>
          )}
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={currentTab}
            onChange={(_, newValue) => setCurrentTab(newValue)}
            aria-label='viewer tabs'
          >
            <Tab icon={<ViewInAr />} label='Viewer' id='viewer-tab-0' />
            <Tab icon={<GridView />} label='Coordination' id='viewer-tab-1' />
            <Tab icon={<CloudUpload />} label='Upload' id='viewer-tab-2' />
            <Tab icon={<Settings />} label='Settings' id='viewer-tab-3' />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ p: 3 }}>
          {/* Viewer Tab */}
          <TabPanel value={currentTab} index={0}>
            <Stack spacing={3}>
              {/* Show content only when a project is selected */}
              {projectId ? (
                <>
                  {/* Stream Selector */}
                  <StreamSelector
                    projectId={projectId}
                    authToken={user?.accessToken}
                    selectedStreamId={streamIdFromUrl || selectedStream?.stream_id}
                    onStreamSelect={handleStreamSelect}
                    onStreamInitialized={handleStreamInitialized}
                    showActions={true}
                    refreshTrigger={streamRefreshTrigger}
                  />

                  <Divider />

                  {/* BIM Viewer */}
                  {/* ENTERPRISE FIX (2026-01-13): Always render BIMViewer to prevent unmount/remount */}
                  {/* ROOT CAUSE: Conditional rendering caused viewer disposal on stream changes */}
                  {/* SOLUTION: Keep component mounted, pass undefined streamId when no stream */}
                  {(() => {
                    console.log('🎨 [ViewerPage] Rendering BIM Viewer, selectedStream:', {
                      exists: !!selectedStream,
                      stream_id: selectedStream?.stream_id || 'null',
                      will_render_viewer: true, // Always render now
                    });
                    return null;
                  })()}
                  <BIMViewerErrorBoundary
                    onError={(error, errorInfo) => {
                      console.error('BIM Viewer Error:', error, errorInfo);
                      // Track error for analytics
                      if (typeof window !== 'undefined' && (window as any).gtag) {
                        (window as any).gtag('event', 'exception', {
                          description: `BIM Viewer Error: ${error.message}`,
                          fatal: false,
                        });
                      }
                    }}
                  >
                    <SpeckleBIMViewer
                      streamId={selectedStream?.stream_id || undefined}
                      objectId={selectedStream?.latest_object_id || undefined}
                      stakeholderRole={(projectRole || 'contractor') as any}
                      onElementSelect={handleElementSelect}
                      height='600px'
                      serverUrl={config.speckleApiUrl}
                    />
                  </BIMViewerErrorBoundary>
                </>
              ) : (
                <Paper
                  variant='outlined'
                  sx={{
                    height: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.50',
                  }}
                >
                  <Stack alignItems='center' spacing={2}>
                    {projectsLoading ? (
                      <>
                        <CircularProgress size={48} />
                        <Typography variant='h6' color='text.secondary'>
                          Loading projects...
                        </Typography>
                      </>
                    ) : (
                      <>
                        <FolderOpen sx={{ fontSize: 60, color: 'text.disabled' }} />
                        <Typography variant='h6' color='text.secondary'>
                          No project selected
                        </Typography>
                        <Typography variant='body2' color='text.secondary'>
                          Select a project from the dropdown above or create a new one
                        </Typography>
                        <Button variant='contained' href='/projects'>
                          Create Project
                        </Button>
                      </>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </TabPanel>

          {/* Coordination Tab - ROS MRO View */}
          <TabPanel value={currentTab} index={1}>
            <Stack spacing={3}>
              {projectId ? (
                <ROSMROView
                  projectId={projectId}
                  stakeholderRole={
                    (['architect', 'engineer', 'contractor', 'owner'].includes(projectRole || '')
                      ? projectRole
                      : 'contractor') as 'architect' | 'engineer' | 'contractor' | 'owner'
                  }
                />
              ) : (
                <Alert severity='info'>
                  <Typography variant='body2'>
                    Select a project to view the ROS MRO coordination matrix.
                  </Typography>
                </Alert>
              )}
            </Stack>
          </TabPanel>

          {/* Upload Tab */}
          <TabPanel value={currentTab} index={2}>
            <Stack spacing={3}>
              {projectId ? (
                <>
                  <Box>
                    <Typography variant='h6' gutterBottom>
                      Upload IFC File
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      Upload an IFC file to import building elements into Speckle. Maximum file
                      size: 1GB
                    </Typography>
                    {projects.length > 0 && (
                      <Typography variant='body2' color='primary' sx={{ mt: 1 }}>
                        <strong>Target project:</strong>{' '}
                        {projects.find(p => p.id === projectId)?.name || projectId}
                      </Typography>
                    )}
                  </Box>

                  <IFCUploader
                    projectId={projectId}
                    authToken={user?.accessToken}
                    onUploadComplete={handleUploadComplete}
                    showAdvancedOptions={true}
                  />

                  <Alert severity='info'>
                    <Typography variant='body2'>
                      <strong>Supported Format:</strong> IFC 2x3, IFC4
                    </Typography>
                    <Typography variant='body2'>
                      <strong>Processing Time:</strong> Large files may take several minutes to
                      process
                    </Typography>
                  </Alert>
                </>
              ) : (
                <Alert severity='warning'>
                  <Typography variant='body2'>
                    Please select a project from the dropdown above before uploading IFC files.
                  </Typography>
                </Alert>
              )}
            </Stack>
          </TabPanel>

          {/* Settings Tab */}
          <TabPanel value={currentTab} index={3}>
            <Stack spacing={3}>
              <Box>
                <Typography variant='h6' gutterBottom>
                  Viewer Settings
                </Typography>
                <Typography variant='body2' color='text.secondary'>
                  Configure viewer preferences and display options
                </Typography>
              </Box>

              <Alert severity='info'>
                Settings panel coming soon. Default view mode: {projectRole || 'contractor'}
              </Alert>
            </Stack>
          </TabPanel>
        </Box>
      </Paper>
    </Container>
  );
}

export default ViewerPage;
