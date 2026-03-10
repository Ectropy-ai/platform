/**
 * TaskTable - Reusable task list table for dashboards
 *
 * White-label ready component for displaying engineering or construction tasks.
 * Supports status indicators, priority badges, and action buttons.
 *
 * @module components/dashboard
 */

import React from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Button,
  Skeleton,
  Alert,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TimelineIcon from '@mui/icons-material/Timeline';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus = 'completed' | 'in_progress' | 'pending';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: string | number;
  task: string;
  status: TaskStatus;
  priority?: TaskPriority;
  crew?: string;
  deadline?: string;
  progress?: number;
}

export interface TaskTableProps {
  /** Array of tasks to display */
  tasks: Task[];
  /** Table title */
  title?: string;
  /** Show priority column */
  showPriority?: boolean;
  /** Show crew column */
  showCrew?: boolean;
  /** Show deadline column */
  showDeadline?: boolean;
  /** Show progress column */
  showProgress?: boolean;
  /** Show action buttons */
  showActions?: boolean;
  /** Show status icon next to task name */
  showStatusIcon?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Action button handler */
  onAction?: (taskId: string | number, action: 'start' | 'continue' | 'view') => void;
  /** Row click handler - enables row selection */
  onRowClick?: (task: Task) => void;
  /** Optional header icon */
  icon?: React.ReactNode;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StyledPaper = styled(Paper)({
  borderRadius: borderRadius.lg,
  boxShadow: shadows.base,
  overflow: 'hidden',
});

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  padding: spacing.lg,
  borderBottom: `1px solid ${colors.grey[200]}`,
});

const HeaderTitle = styled(Typography)({
  fontSize: typography.fontSize.lg,
  fontWeight: typography.fontWeight.semiBold,
  color: colors.grey[900],
});

const StyledTable = styled(Table)({
  '& .MuiTableCell-head': {
    backgroundColor: colors.grey[50],
    fontWeight: typography.fontWeight.semiBold,
    fontSize: typography.fontSize.sm,
    color: colors.grey[700],
  },
  '& .MuiTableCell-body': {
    fontSize: typography.fontSize.sm,
  },
});

const TaskCell = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
});

const ProgressBar = styled(Box)<{ value: number }>(({ value }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  '& .bar': {
    width: 60,
    height: 6,
    backgroundColor: colors.grey[200],
    borderRadius: 3,
    overflow: 'hidden',
    '& .fill': {
      height: '100%',
      backgroundColor: value === 100 ? colors.success.main : colors.primary.main,
      width: `${value}%`,
      transition: 'width 0.3s ease',
    },
  },
}));

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatusIcon: React.FC<{ status: TaskStatus }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon color="success" fontSize="small" />;
    case 'in_progress':
      return <AutoFixHighIcon color="warning" fontSize="small" />;
    case 'pending':
    default:
      return <ScheduleIcon color="action" fontSize="small" />;
  }
};

const getStatusChipColor = (status: TaskStatus): 'success' | 'warning' | 'default' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
      return 'warning';
    default:
      return 'default';
  }
};

const getPriorityChipColor = (priority?: TaskPriority): 'error' | 'warning' | 'default' => {
  switch (priority) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'default';
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * TaskTable - Displays a list of tasks with status, priority, and actions
 *
 * @example
 * <TaskTable
 *   title="Engineering Tasks"
 *   tasks={tasks}
 *   showPriority
 *   showActions
 *   onAction={(id, action) => console.log(id, action)}
 * />
 */
export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  title = 'Tasks',
  showPriority = false,
  showCrew = false,
  showDeadline = false,
  showProgress = false,
  showActions = true,
  showStatusIcon = true,
  loading = false,
  emptyMessage = 'No tasks found',
  onAction,
  onRowClick,
  icon,
}) => {
  if (loading) {
    return (
      <StyledPaper>
        <Header>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width={200} height={28} />
        </Header>
        <Box sx={{ p: spacing.lg }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="text" height={48} sx={{ mb: 1 }} />
          ))}
        </Box>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Header>
        {icon || <TimelineIcon color="primary" />}
        <HeaderTitle>{title}</HeaderTitle>
      </Header>

      {tasks.length === 0 ? (
        <Box sx={{ p: spacing.lg }}>
          <Alert severity="info">{emptyMessage}</Alert>
        </Box>
      ) : (
        <StyledTable size="small">
          <TableHead>
            <TableRow>
              <TableCell>Task</TableCell>
              <TableCell>Status</TableCell>
              {showPriority && <TableCell>Priority</TableCell>}
              {showCrew && <TableCell>Crew</TableCell>}
              {showProgress && <TableCell>Progress</TableCell>}
              {showDeadline && <TableCell>Deadline</TableCell>}
              {showActions && <TableCell>Action</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow
                key={task.id}
                hover
                onClick={onRowClick ? () => onRowClick(task) : undefined}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                <TableCell>
                  <TaskCell>
                    {showStatusIcon && <StatusIcon status={task.status} />}
                    {task.task}
                  </TaskCell>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={task.status.replace('_', ' ')}
                    color={getStatusChipColor(task.status)}
                  />
                </TableCell>
                {showPriority && (
                  <TableCell>
                    <Chip
                      size="small"
                      label={task.priority || 'normal'}
                      color={getPriorityChipColor(task.priority)}
                      variant="outlined"
                    />
                  </TableCell>
                )}
                {showCrew && <TableCell>{task.crew || '-'}</TableCell>}
                {showProgress && (
                  <TableCell>
                    <ProgressBar value={task.progress || 0}>
                      <Box className="bar">
                        <Box className="fill" />
                      </Box>
                      <Typography variant="body2">{task.progress || 0}%</Typography>
                    </ProgressBar>
                  </TableCell>
                )}
                {showDeadline && <TableCell>{task.deadline || '-'}</TableCell>}
                {showActions && (
                  <TableCell>
                    {task.status !== 'completed' && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          onAction?.(task.id, task.status === 'pending' ? 'start' : 'continue')
                        }
                      >
                        {task.status === 'pending' ? 'Start' : 'Continue'}
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </StyledTable>
      )}
    </StyledPaper>
  );
};

export default TaskTable;
