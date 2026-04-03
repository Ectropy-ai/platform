/**
 * ROS MRO (Remote Operations Site - Maintenance, Repair, Operations) View
 *
 * Enterprise-grade 3D visualization combining BIM mesh with voxel overlay
 * for live site coordination, decision surface navigation, and real-time
 * project status monitoring.
 *
 * Features:
 * - BIM mesh rendering via Speckle
 * - Voxel overlay for spatial decision attachment
 * - Real-time status updates via WebSocket
 * - Multi-stakeholder view modes
 * - Decision surface navigation
 * - Activity feed integration
 *
 * @module components/BIMViewer/ROSMROView
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Grid,
  Typography,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Badge,
  Tooltip,
  Divider,
  LinearProgress,
  Alert,
  Button,
  Stack,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Notifications,
  Timeline,
  Map as MapIcon,
  Layers,
  Info,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Refresh,
  Settings,
  FilterList,
  ZoomIn,
  ZoomOut,
  CenterFocusStrong,
  ViewInAr,
  Build,
  ElectricalServices,
  Plumbing,
  AcUnit,
  LocalFireDepartment,
  Architecture,
  Wifi,
  WifiOff,
  SmartToy,
} from '@mui/icons-material';
import Fab from '@mui/material/Fab';
import * as THREE from 'three';

import SpeckleBIMViewer from './SpeckleBIMViewer';
import {
  VoxelColorScheme,
  VoxelVisualizationMode,
  type VoxelData,
} from './VoxelTypes';
import { VoxelLegend } from './VoxelLegend';
import { VoxelDecisionSurfaceExtension } from './VoxelDecisionSurfaceExtension';
import type { IViewer } from '@speckle/viewer';
// SPRINT 5: Import React Query hooks for real data (2026-01-24)
import {
  useROSMROData,
  useVoxelStream,
  type VoxelData as HookVoxelData,
  type VoxelAggregation as HookVoxelAggregation,
  type VoxelActivity as HookVoxelActivity,
} from '../../hooks/queries';
// M6: SEPPA AI Assistant integration
import SEPPAChatPanel from '../seppa-chat/SEPPAChatPanel';
import { type AuthorityLevel } from '../../services/seppa';

// ==============================================================================
// Types
// ==============================================================================

export interface ROSMROViewProps {
  projectId: string;
  modelId?: string;
  streamId?: string;
  objectId?: string;
  objectIds?: string[]; // Multi-discipline: all commit object IDs
  stakeholderRole: 'architect' | 'engineer' | 'contractor' | 'owner';
  serverUrl?: string;
  viewerToken?: string; // DEC-015: VST for geometry proxy auth
  onDecisionSelect?: (decisionId: string, voxelId: string) => void;
  onVoxelSelect?: (voxelId: string, voxelData: VoxelData | null) => void;
  /** User ID for SEPPA conversation tracking */
  userId?: string;
  /** User display name for SEPPA */
  userName?: string;
  /** User authority level (0-6) for SEPPA decision routing */
  userAuthority?: AuthorityLevel;
  /** Whether this tab is currently visible — defers BIM mount until active */
  isActive?: boolean;
}

interface VoxelAggregation {
  key: string;
  voxelCount: number;
  plannedCount: number;
  inProgressCount: number;
  completeCount: number;
  blockedCount: number;
  decisionCount: number;
  overallProgress: number;
  healthScore: number;
}

interface ActivityItem {
  id: string;
  type: 'status_change' | 'decision_attached' | 'inspection' | 'issue';
  title: string;
  description: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'success';
  voxelId?: string;
}

interface ViewState {
  showVoxels: boolean;
  showMesh: boolean;
  showDecisions: boolean;
  showActivity: boolean;
  colorScheme: VoxelColorScheme;
  visualizationMode: VoxelVisualizationMode;
  filterSystems: string[];
  filterStatuses: string[];
  selectedVoxelId: string | null;
}

// ==============================================================================
// Constants
// ==============================================================================

const SYSTEM_ICONS: Record<string, React.ReactElement> = {
  STRUCT: <Architecture />,
  MECH: <Build />,
  ELEC: <ElectricalServices />,
  PLUMB: <Plumbing />,
  HVAC: <AcUnit />,
  FIRE: <LocalFireDepartment />,
};

const STATUS_COLORS: Record<string, string> = {
  PLANNED: '#3498db',
  IN_PROGRESS: '#f39c12',
  COMPLETE: '#27ae60',
  ON_HOLD: '#95a5a6',
  INSPECTION_REQUIRED: '#9b59b6',
  BLOCKED: '#e74c3c',
  ISSUE: '#c0392b',
};

const DEFAULT_VIEW_STATE: ViewState = {
  showVoxels: true,
  showMesh: true,
  showDecisions: true,
  showActivity: true,
  colorScheme: VoxelColorScheme.BY_STATUS,
  visualizationMode: VoxelVisualizationMode.SOLID,
  filterSystems: [],
  filterStatuses: [],
  selectedVoxelId: null,
};

// ==============================================================================
// Sub-Components
// ==============================================================================

interface StatusSummaryProps {
  aggregations: VoxelAggregation[];
}

const StatusSummary: React.FC<StatusSummaryProps> = ({ aggregations }) => {
  const totals = useMemo(() => {
    return aggregations.reduce(
      (acc, agg) => ({
        voxels: acc.voxels + agg.voxelCount,
        planned: acc.planned + agg.plannedCount,
        inProgress: acc.inProgress + agg.inProgressCount,
        complete: acc.complete + agg.completeCount,
        blocked: acc.blocked + agg.blockedCount,
        decisions: acc.decisions + agg.decisionCount,
      }),
      { voxels: 0, planned: 0, inProgress: 0, complete: 0, blocked: 0, decisions: 0 },
    );
  }, [aggregations]);

  const overallProgress =
    totals.voxels > 0
      ? Math.round((totals.complete * 100 + totals.inProgress * 50) / totals.voxels)
      : 0;

  return (
    <Card variant='outlined' sx={{ mb: 2 }}>
      <CardContent sx={{ pb: '8px !important' }}>
        <Typography variant='subtitle2' gutterBottom>
          Project Status
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant='caption'>Overall Progress</Typography>
            <Typography variant='caption' fontWeight='bold'>
              {overallProgress}%
            </Typography>
          </Box>
          <LinearProgress
            variant='determinate'
            value={overallProgress}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        <Grid container spacing={1}>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant='h6' color={STATUS_COLORS.PLANNED}>
                {totals.planned}
              </Typography>
              <Typography variant='caption'>Planned</Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant='h6' color={STATUS_COLORS.IN_PROGRESS}>
                {totals.inProgress}
              </Typography>
              <Typography variant='caption'>In Progress</Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant='h6' color={STATUS_COLORS.COMPLETE}>
                {totals.complete}
              </Typography>
              <Typography variant='caption'>Complete</Typography>
            </Box>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant='h6' color={STATUS_COLORS.BLOCKED}>
                {totals.blocked}
              </Typography>
              <Typography variant='caption'>Blocked</Typography>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Chip
            icon={<ViewInAr />}
            label={`${totals.voxels} Voxels`}
            size='small'
            variant='outlined'
          />
          <Chip
            icon={<Info />}
            label={`${totals.decisions} Decisions`}
            size='small'
            variant='outlined'
          />
        </Box>
      </CardContent>
    </Card>
  );
};

interface ActivityFeedProps {
  activities: ActivityItem[];
  onActivityClick?: (activity: ActivityItem) => void;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, onActivityClick }) => {
  const getSeverityIcon = (severity: ActivityItem['severity']) => {
    switch (severity) {
      case 'success':
        return <CheckCircle color='success' />;
      case 'warning':
        return <Warning color='warning' />;
      case 'error':
        return <ErrorIcon color='error' />;
      default:
        return <Info color='info' />;
    }
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    if (diff < 60000) {
      return 'Just now';
    }
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    }
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    }
    return date.toLocaleDateString();
  };

  return (
    <List dense sx={{ py: 0 }}>
      {activities.map((activity, index) => (
        <React.Fragment key={activity.id}>
          <ListItemButton onClick={() => onActivityClick?.(activity)} sx={{ py: 1 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>{getSeverityIcon(activity.severity)}</ListItemIcon>
            <ListItemText
              primary={
                <Typography variant='body2' noWrap>
                  {activity.title}
                </Typography>
              }
              secondary={
                <React.Fragment>
                  <Typography variant='caption' color='text.secondary' noWrap>
                    {activity.description}
                  </Typography>
                  <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>
                    {formatTime(activity.timestamp)}
                  </Typography>
                </React.Fragment>
              }
            />
          </ListItemButton>
          {index < activities.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </List>
  );
};

interface LevelProgressProps {
  aggregations: VoxelAggregation[];
  onLevelClick?: (level: string) => void;
}

const LevelProgress: React.FC<LevelProgressProps> = ({ aggregations, onLevelClick }) => {
  return (
    <List dense sx={{ py: 0 }}>
      {aggregations.map(agg => (
        <ListItemButton key={agg.key} onClick={() => onLevelClick?.(agg.key)} sx={{ py: 1 }}>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant='body2'>{agg.key}</Typography>
                <Typography variant='caption' color='text.secondary'>
                  {agg.voxelCount} voxels
                </Typography>
              </Box>
            }
            secondary={
              <Box sx={{ mt: 0.5 }}>
                <LinearProgress
                  variant='determinate'
                  value={agg.overallProgress}
                  sx={{ height: 6, borderRadius: 1 }}
                  color={
                    agg.healthScore > 80 ? 'success' : agg.healthScore > 50 ? 'warning' : 'error'
                  }
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                  <Typography variant='caption' color='text.secondary'>
                    {agg.overallProgress}% complete
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    Health: {agg.healthScore}%
                  </Typography>
                </Box>
              </Box>
            }
          />
        </ListItemButton>
      ))}
    </List>
  );
};

interface VoxelDetailsPanelProps {
  voxel: VoxelData | null;
  onClose: () => void;
  onNavigateToDecision?: (decisionId: string) => void;
}

const VoxelDetailsPanel: React.FC<VoxelDetailsPanelProps> = ({
  voxel,
  onClose,
  onNavigateToDecision,
}) => {
  if (!voxel) {
    return null;
  }

  return (
    <Card variant='outlined' sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant='subtitle1' fontWeight='bold'>
            {voxel.voxelId}
          </Typography>
          <IconButton size='small' onClick={onClose}>
            <Settings fontSize='small' />
          </IconButton>
        </Box>

        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Typography variant='caption' color='text.secondary'>
              System
            </Typography>
            <Typography variant='body2'>{voxel.system}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant='caption' color='text.secondary'>
              Status
            </Typography>
            <Chip
              label={voxel.status}
              size='small'
              sx={{
                bgcolor: STATUS_COLORS[voxel.status] || '#ccc',
                color: 'white',
              }}
            />
          </Grid>
          <Grid item xs={6}>
            <Typography variant='caption' color='text.secondary'>
              Health
            </Typography>
            <Typography variant='body2'>{voxel.healthStatus}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant='caption' color='text.secondary'>
              Progress
            </Typography>
            <Typography variant='body2'>
              {voxel.percentComplete !== undefined ? `${voxel.percentComplete}%` : 'N/A'}
            </Typography>
          </Grid>
        </Grid>

        <Divider sx={{ my: 1 }} />

        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
          Location
        </Typography>
        <Typography variant='body2'>
          X: {voxel.center.x.toFixed(0)}mm, Y: {voxel.center.y.toFixed(0)}mm, Z:{' '}
          {voxel.center.z.toFixed(0)}mm
        </Typography>

        {voxel.decisionCount > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant='caption' color='text.secondary'>
                {voxel.decisionCount} Linked Decision{voxel.decisionCount !== 1 ? 's' : ''}
              </Typography>
              <Button size='small' onClick={() => onNavigateToDecision?.(`dec-${voxel.id}`)}>
                View
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ==============================================================================
// Main Component
// ==============================================================================

export const ROSMROView: React.FC<ROSMROViewProps> = ({
  projectId,
  modelId,
  streamId,
  objectId,
  objectIds,
  stakeholderRole,
  serverUrl,
  viewerToken,
  onDecisionSelect,
  onVoxelSelect,
  userId = 'anonymous',
  userName,
  userAuthority = 3, // Default to PM level
  isActive = true,
}) => {
  // SPRINT 5: Use React Query hooks for real data (2026-01-24)
  // Replaces local state + useEffect with centralized data fetching
  const {
    voxels: hookVoxels,
    aggregations: hookAggregations,
    activities: hookActivities,
    alertCount,
    isLoading: loading,
    error: queryError,
    refetchAll,
  } = useROSMROData({ projectId, enabled: !!projectId });

  // SPRINT 5: Real-time voxel updates via WebSocket
  const {
    isConnected: wsConnected,
    connectionState,
    lastUpdate,
    updateCount,
  } = useVoxelStream({
    projectId,
    enabled: !!projectId,
    onVoxelUpdate: event => {
      console.log('[ROSMROView] Real-time voxel update:', event.voxelId, event.status);
    },
  });

  // Transform hook data to component types (compatible with VoxelOverlay)
  const voxels = useMemo<VoxelData[]>(
    () =>
      hookVoxels.map(v => ({
        id: v.id,
        voxelId: v.voxelId,
        center: v.center,
        resolution: v.resolution,
        system: v.system,
        status: v.status,
        healthStatus: v.healthStatus,
        decisionCount: v.decisionCount,
        percentComplete: v.percentComplete,
      })),
    [hookVoxels],
  );

  const aggregations = hookAggregations;

  // Transform activities to component format (timestamp as Date)
  const activities = useMemo<ActivityItem[]>(
    () =>
      hookActivities.map(a => ({
        id: a.id,
        type: a.type as ActivityItem['type'],
        title: a.title,
        description: a.description,
        timestamp: new Date(a.timestamp),
        severity: a.severity as ActivityItem['severity'],
        voxelId: a.voxelId,
      })),
    [hookActivities],
  );

  const error = queryError ? String(queryError) : null;

  // Local UI state
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const [selectedVoxel, setSelectedVoxel] = useState<VoxelData | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  const [voxelExt, setVoxelExt] = useState<VoxelDecisionSurfaceExtension | null>(null);

  // Defer SpeckleBIMViewer mount until tab is visible (non-zero canvas dimensions)
  useEffect(() => {
    if (isActive) setHasBeenActive(true);
  }, [isActive]);

  // M6: SEPPA AI Assistant state
  const [seppaOpen, setSeppaOpen] = useState(false);

  // DEC-009: Ref for projectId to avoid stale closure in handleViewerReady
  const projectIdRef = React.useRef(projectId);
  projectIdRef.current = projectId;

  // DEC-008: Get extension ref when viewer is ready
  // DEC-009: Trigger BOX generation after model load
  const handleViewerReady = useCallback((viewer: IViewer) => {
    console.log('[DEC-008 wiring] handleViewerReady called, ext:', viewer.getExtension(VoxelDecisionSurfaceExtension));
    const ext = viewer.getExtension(VoxelDecisionSurfaceExtension) as VoxelDecisionSurfaceExtension;
    setVoxelExt(ext);
    // DEC-009: Generate BOX cells from WorldTree after model load completes
    const pid = projectIdRef.current;
    if (ext && pid && streamId) {
      ext.generateAndPersistBoxes(pid, streamId, objectId ?? '').catch((err: unknown) => {
        console.error('[BOX] generateAndPersistBoxes failed:', err);
      });
    }
  }, []);

  // DEC-008: Sync voxel data to extension when data loads/changes
  useEffect(() => {
    console.log('[DEC-008 wiring] updateVoxels effect firing, voxelExt:', !!voxelExt, 'voxels:', voxels?.length);
    if (!voxelExt || !voxels?.length) return;
    voxelExt.updateVoxels(voxels);
  }, [voxelExt, voxels]);

  // DEC-008: Sync visibility toggle
  useEffect(() => {
    voxelExt?.setVisible(viewState.showVoxels ?? true);
  }, [voxelExt, viewState.showVoxels]);


  // Handle voxel click
  const handleVoxelClick = useCallback(
    (voxelId: string) => {
      const voxel = voxels.find(v => v.id === voxelId);
      setSelectedVoxel(voxel || null);
      setViewState(prev => ({ ...prev, selectedVoxelId: voxelId }));
      onVoxelSelect?.(voxelId, voxel || null);
    },
    [voxels, onVoxelSelect],
  );

  // Handle voxel hover
  const handleVoxelHover = useCallback((voxelId: string | null) => {
    // Could show tooltip or highlight
  }, []);

  // Handle system filter toggle
  const handleSystemFilter = useCallback((system: string) => {
    setViewState(prev => {
      const newFilters = prev.filterSystems.includes(system)
        ? prev.filterSystems.filter(s => s !== system)
        : [...prev.filterSystems, system];
      return { ...prev, filterSystems: newFilters };
    });
  }, []);

  // Handle status filter toggle
  const handleStatusFilter = useCallback((status: string) => {
    setViewState(prev => {
      const newFilters = prev.filterStatuses.includes(status)
        ? prev.filterStatuses.filter(s => s !== status)
        : [...prev.filterStatuses, status];
      return { ...prev, filterStatuses: newFilters };
    });
  }, []);

  // Handle activity click
  const handleActivityClick = useCallback(
    (activity: ActivityItem) => {
      if (activity.voxelId) {
        const voxel = voxels.find(v => v.id === activity.voxelId);
        if (voxel) {
          handleVoxelClick(voxel.id);
        }
      }
    },
    [voxels, handleVoxelClick],
  );

  // Handle element select from BIM viewer
  const handleBIMElementSelect = useCallback((elementId: string, properties: any) => {
    // Find corresponding voxel based on element location
    // In production, this would use spatial queries
    console.log('[ROS MRO] BIM element selected:', elementId, properties);
  }, []);

  // Available systems for filtering
  const availableSystems = useMemo(() => {
    const systems = new Set(voxels.map(v => v.system));
    return Array.from(systems);
  }, [voxels]);

  // Available statuses for filtering
  const availableStatuses = useMemo(() => {
    const statuses = new Set(voxels.map(v => v.status));
    return Array.from(statuses);
  }, [voxels]);

  if (error) {
    return (
      <Alert severity='error' sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ px: 2, py: 1, borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant='h6'>ROS MRO Coordination View</Typography>
            <Chip label={stakeholderRole.toUpperCase()} size='small' color='primary' />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* M5: WebSocket Connection Status Indicator */}
            <Tooltip
              title={
                wsConnected
                  ? `Real-time updates active (${updateCount} updates)`
                  : `Connecting... (${connectionState})`
              }
            >
              <Chip
                icon={wsConnected ? <Wifi /> : <WifiOff />}
                label={wsConnected ? 'Live' : 'Offline'}
                size='small'
                color={wsConnected ? 'success' : 'default'}
                variant={wsConnected ? 'filled' : 'outlined'}
                sx={{ mr: 1 }}
              />
            </Tooltip>
            <FormControlLabel
              control={
                <Switch
                  checked={viewState.showVoxels}
                  onChange={e => setViewState(prev => ({ ...prev, showVoxels: e.target.checked }))}
                  size='small'
                />
              }
              label='Voxels'
            />
            <FormControlLabel
              control={
                <Switch
                  checked={viewState.showMesh}
                  onChange={e => setViewState(prev => ({ ...prev, showMesh: e.target.checked }))}
                  size='small'
                />
              }
              label='Mesh'
            />
            <Tooltip title='Notifications'>
              <IconButton size='small'>
                <Badge
                  badgeContent={
                    activities.filter(a => a.severity === 'warning' || a.severity === 'error')
                      .length
                  }
                  color='error'
                >
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title='Toggle Panel'>
              <IconButton size='small' onClick={() => setShowControlPanel(!showControlPanel)}>
                <Layers />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 600 }}>
        {/* 3D Viewer */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {/* BIM Mesh Viewer with VoxelOverlay integration */}
          {viewState.showMesh && hasBeenActive && (
            <SpeckleBIMViewer
              streamId={streamId}
              objectId={objectId}
              objectIds={objectIds}
              stakeholderRole={stakeholderRole}
              serverUrl={serverUrl}
              viewerToken={viewerToken}
              onElementSelect={handleBIMElementSelect}
              onViewerReady={handleViewerReady}
              height='100%'
            />
          )}

          {/* Floating Legend */}
          {viewState.showVoxels && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                zIndex: 10,
              }}
            >
              <VoxelLegend colorScheme={viewState.colorScheme} />
            </Box>
          )}

          {/* Floating Controls */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Paper sx={{ p: 0.5 }}>
              <Tooltip title='Zoom In'>
                <IconButton size='small'>
                  <ZoomIn />
                </IconButton>
              </Tooltip>
              <Tooltip title='Zoom Out'>
                <IconButton size='small'>
                  <ZoomOut />
                </IconButton>
              </Tooltip>
              <Tooltip title='Center View'>
                <IconButton size='small'>
                  <CenterFocusStrong />
                </IconButton>
              </Tooltip>
            </Paper>
          </Box>

          {/* Loading Overlay */}
          {loading && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255,255,255,0.8)',
                zIndex: 20,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant='h6' gutterBottom>
                  Loading Coordination View...
                </Typography>
                <LinearProgress sx={{ width: 200 }} />
              </Box>
            </Box>
          )}
        </Box>

        {/* Control Panel */}
        {showControlPanel && (
          <Paper
            sx={{
              width: 320,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 0,
              borderLeft: 1,
              borderColor: 'divider',
            }}
          >
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant='fullWidth'
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab icon={<MapIcon />} label='Status' />
              <Tab icon={<Timeline />} label='Activity' />
              <Tab icon={<FilterList />} label='Filters' />
            </Tabs>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {/* Status Tab */}
              {activeTab === 0 && (
                <>
                  <StatusSummary aggregations={aggregations} />

                  {selectedVoxel && (
                    <VoxelDetailsPanel
                      voxel={selectedVoxel}
                      onClose={() => {
                        setSelectedVoxel(null);
                        setViewState(prev => ({ ...prev, selectedVoxelId: null }));
                      }}
                      onNavigateToDecision={id => onDecisionSelect?.(id, selectedVoxel.id)}
                    />
                  )}

                  <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    Level Progress
                  </Typography>
                  <LevelProgress aggregations={aggregations} />
                </>
              )}

              {/* Activity Tab */}
              {activeTab === 1 && (
                <>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography variant='subtitle2'>Recent Activity</Typography>
                    <Tooltip title='Refresh'>
                      <IconButton size='small'>
                        <Refresh fontSize='small' />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <ActivityFeed activities={activities} onActivityClick={handleActivityClick} />
                </>
              )}

              {/* Filters Tab */}
              {activeTab === 2 && (
                <>
                  <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    Color Scheme
                  </Typography>
                  <FormControl fullWidth size='small' sx={{ mb: 2 }}>
                    <InputLabel>Color By</InputLabel>
                    <Select
                      value={viewState.colorScheme}
                      label='Color By'
                      onChange={e =>
                        setViewState(prev => ({
                          ...prev,
                          colorScheme: e.target.value as VoxelColorScheme,
                        }))
                      }
                    >
                      <MenuItem value={VoxelColorScheme.BY_STATUS}>Status</MenuItem>
                      <MenuItem value={VoxelColorScheme.BY_SYSTEM}>System</MenuItem>
                      <MenuItem value={VoxelColorScheme.BY_HEALTH}>Health</MenuItem>
                      <MenuItem value={VoxelColorScheme.BY_PROGRESS}>Progress</MenuItem>
                    </Select>
                  </FormControl>

                  <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    Visualization Mode
                  </Typography>
                  <FormControl fullWidth size='small' sx={{ mb: 2 }}>
                    <InputLabel>Mode</InputLabel>
                    <Select
                      value={viewState.visualizationMode}
                      label='Mode'
                      onChange={e =>
                        setViewState(prev => ({
                          ...prev,
                          visualizationMode: e.target.value as VoxelVisualizationMode,
                        }))
                      }
                    >
                      <MenuItem value={VoxelVisualizationMode.SOLID}>Solid</MenuItem>
                      <MenuItem value={VoxelVisualizationMode.WIREFRAME}>Wireframe</MenuItem>
                      <MenuItem value={VoxelVisualizationMode.HEATMAP}>Heatmap</MenuItem>
                    </Select>
                  </FormControl>

                  <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    Filter by System
                  </Typography>
                  <Stack direction='row' flexWrap='wrap' gap={0.5} sx={{ mb: 2 }}>
                    {availableSystems.map(system => (
                      <Chip
                        key={system}
                        label={system}
                        icon={SYSTEM_ICONS[system] || <Build />}
                        size='small'
                        variant={viewState.filterSystems.includes(system) ? 'filled' : 'outlined'}
                        color={viewState.filterSystems.includes(system) ? 'primary' : 'default'}
                        onClick={() => handleSystemFilter(system)}
                      />
                    ))}
                  </Stack>

                  <Typography variant='subtitle2' sx={{ mb: 1 }}>
                    Filter by Status
                  </Typography>
                  <Stack direction='row' flexWrap='wrap' gap={0.5}>
                    {availableStatuses.map(status => (
                      <Chip
                        key={status}
                        label={status}
                        size='small'
                        variant={viewState.filterStatuses.includes(status) ? 'filled' : 'outlined'}
                        sx={{
                          bgcolor: viewState.filterStatuses.includes(status)
                            ? STATUS_COLORS[status]
                            : 'transparent',
                          color: viewState.filterStatuses.includes(status) ? 'white' : 'inherit',
                          borderColor: STATUS_COLORS[status],
                        }}
                        onClick={() => handleStatusFilter(status)}
                      />
                    ))}
                  </Stack>
                </>
              )}
            </Box>
          </Paper>
        )}
      </Box>

      {/* M6: SEPPA AI Assistant FAB Button */}
      <Tooltip title='Ask SEPPA AI Assistant'>
        <Fab
          color='primary'
          onClick={() => setSeppaOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
          }}
        >
          <SmartToy />
        </Fab>
      </Tooltip>

      {/* M6: SEPPA AI Assistant Panel with voxel context */}
      <SEPPAChatPanel
        open={seppaOpen}
        onClose={() => setSeppaOpen(false)}
        projectId={projectId}
        selectedVoxelId={selectedVoxel?.id}
        selectedVoxelData={
          selectedVoxel
            ? {
                system: selectedVoxel.system,
                status: selectedVoxel.status,
                healthStatus: selectedVoxel.healthStatus,
                percentComplete: selectedVoxel.percentComplete,
                decisionCount: selectedVoxel.decisionCount,
                center: selectedVoxel.center,
              }
            : undefined
        }
        userAuthority={userAuthority}
        userId={userId}
        userName={userName}
      />
    </Box>
  );
};

export default ROSMROView;
