/**
 * DemoTimeline - Visual timeline for demo scenario playback
 *
 * DEMO PIPELINE (Sprint 2 - 2026-01-23)
 *
 * Displays:
 * - Current position in the timeline
 * - Milestones with click-to-jump navigation
 * - Event markers at their positions
 * - Progress indicator
 *
 * @example
 * ```tsx
 * <DemoTimeline
 *   scenarioId="happy-path"
 *   instanceId="instance-123"
 *   onMilestoneClick={(id) => jumpToMilestone(id)}
 * />
 * ```
 */

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Tooltip,
  Paper,
  Skeleton,
  useTheme,
} from '@mui/material';
import {
  Flag as MilestoneIcon,
  Circle as EventIcon,
  PlayArrow as CurrentIcon,
} from '@mui/icons-material';

import {
  useScenarioDetails,
  useScenarioInstance,
  type MilestoneDetail,
  type TimelinePosition,
} from '../../hooks/queries';

// ============================================================================
// TYPES
// ============================================================================

interface DemoTimelineProps {
  scenarioId: string;
  instanceId?: string;
  onMilestoneClick?: (milestoneId: string) => void;
  height?: number;
}

interface TimelineMarkerProps {
  position: number; // 0-100 percentage
  type: 'milestone' | 'event' | 'current';
  label: string;
  color?: string;
  onClick?: () => void;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert timeline position to percentage (0-100)
 */
function positionToPercent(
  position: TimelinePosition,
  totalWeeks: number
): number {
  const totalHours = totalWeeks * 7 * 24;
  const currentHour =
    (position.week - 1) * 7 * 24 +
    (position.day - 1) * 24 +
    position.hour;
  return Math.min(100, Math.max(0, (currentHour / totalHours) * 100));
}

/**
 * Format position for display
 */
function formatPosition(position: TimelinePosition): string {
  return `Week ${position.week}, Day ${position.day}, ${position.hour}:00`;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  position,
  type,
  label,
  color,
  onClick,
}) => {
  const theme = useTheme();

  const markerStyles = {
    milestone: {
      icon: <MilestoneIcon sx={{ fontSize: 20 }} />,
      color: color || theme.palette.warning.main,
      size: 28,
      zIndex: 3,
    },
    event: {
      icon: <EventIcon sx={{ fontSize: 8 }} />,
      color: color || theme.palette.grey[400],
      size: 12,
      zIndex: 1,
    },
    current: {
      icon: <CurrentIcon sx={{ fontSize: 16 }} />,
      color: color || theme.palette.primary.main,
      size: 24,
      zIndex: 4,
    },
  };

  const style = markerStyles[type];

  return (
    <Tooltip title={label} arrow placement="top">
      <Box
        onClick={onClick}
        sx={{
          position: 'absolute',
          left: `${position}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: style.size,
          height: style.size,
          borderRadius: '50%',
          backgroundColor: style.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          cursor: onClick ? 'pointer' : 'default',
          zIndex: style.zIndex,
          transition: 'transform 0.2s, box-shadow 0.2s',
          '&:hover': onClick
            ? {
                transform: 'translate(-50%, -50%) scale(1.2)',
                boxShadow: `0 0 10px ${style.color}`,
              }
            : {},
        }}
      >
        {style.icon}
      </Box>
    </Tooltip>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DemoTimeline: React.FC<DemoTimelineProps> = ({
  scenarioId,
  instanceId,
  onMilestoneClick,
  height = 80,
}) => {
  const theme = useTheme();

  // Fetch scenario details
  const { scenario, isLoading: loadingScenario } = useScenarioDetails(scenarioId);

  // Fetch instance if provided
  const { instance, isLoading: loadingInstance } = useScenarioInstance(instanceId, {
    enabled: !!instanceId,
    refetchInterval: 2000, // Poll for position updates
  });

  // Calculate positions
  const { milestoneMarkers, currentPosition, totalWeeks } = useMemo(() => {
    if (!scenario) {
      return { milestoneMarkers: [], currentPosition: null, totalWeeks: 8 };
    }

    const weeks = scenario.duration.weeks;
    const markers = scenario.milestones.map((m) => ({
      id: m.id,
      position: positionToPercent(m.position, weeks),
      label: `${m.name} - ${formatPosition(m.position)}`,
    }));

    const current = instance
      ? positionToPercent(instance.currentPosition, weeks)
      : null;

    return {
      milestoneMarkers: markers,
      currentPosition: current,
      totalWeeks: weeks,
    };
  }, [scenario, instance]);

  // Loading state
  if (loadingScenario) {
    return <Skeleton variant="rectangular" height={height} />;
  }

  if (!scenario) {
    return (
      <Paper sx={{ p: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">Scenario not found</Typography>
      </Paper>
    );
  }

  // Week markers for the track
  const weekMarkers = Array.from({ length: totalWeeks + 1 }, (_, i) => ({
    week: i,
    position: (i / totalWeeks) * 100,
  }));

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">{scenario.name} Timeline</Typography>
        {instance && (
          <Typography variant="caption" color="text.secondary">
            {formatPosition(instance.currentPosition)}
          </Typography>
        )}
      </Box>

      {/* Timeline Track */}
      <Box
        sx={{
          position: 'relative',
          height: height,
          backgroundColor: theme.palette.grey[100],
          borderRadius: 1,
          overflow: 'visible',
        }}
      >
        {/* Progress fill */}
        {currentPosition !== null && (
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${currentPosition}%`,
              height: '100%',
              backgroundColor: theme.palette.primary.light,
              opacity: 0.3,
              borderRadius: 1,
              transition: 'width 0.5s ease-out',
            }}
          />
        )}

        {/* Week markers */}
        {weekMarkers.map(({ week, position }) => (
          <Box
            key={week}
            sx={{
              position: 'absolute',
              left: `${position}%`,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: theme.palette.grey[300],
            }}
          >
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: -20,
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'text.secondary',
              }}
            >
              W{week}
            </Typography>
          </Box>
        ))}

        {/* Milestone markers */}
        {milestoneMarkers.map((marker) => (
          <TimelineMarker
            key={marker.id}
            position={marker.position}
            type="milestone"
            label={marker.label}
            onClick={
              onMilestoneClick ? () => onMilestoneClick(marker.id) : undefined
            }
          />
        ))}

        {/* Current position marker */}
        {currentPosition !== null && (
          <TimelineMarker
            position={currentPosition}
            type="current"
            label={`Current: ${instance ? formatPosition(instance.currentPosition) : ''}`}
          />
        )}
      </Box>

      {/* Legend */}
      <Box display="flex" gap={2} mt={3} justifyContent="center">
        <Box display="flex" alignItems="center" gap={0.5}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: theme.palette.warning.main,
            }}
          />
          <Typography variant="caption">Milestone</Typography>
        </Box>
        {instanceId && (
          <Box display="flex" alignItems="center" gap={0.5}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: theme.palette.primary.main,
              }}
            />
            <Typography variant="caption">Current Position</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default DemoTimeline;
