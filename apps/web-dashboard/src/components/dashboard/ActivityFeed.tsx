/**
 * ActivityFeed - Reusable activity/event feed for dashboards
 *
 * White-label ready component for displaying activity history.
 * Supports timestamps, user attribution, and action types.
 *
 * @module components/dashboard
 */

import React from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Typography,
  Skeleton,
  Alert,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import HistoryIcon from '@mui/icons-material/History';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export interface Activity {
  id: string | number;
  action: string;
  entityType?: string;
  timestamp: string;
  user?: string;
  details?: Record<string, unknown>;
}

export interface ActivityFeedProps {
  /** Array of activities to display */
  activities: Activity[];
  /** Feed title */
  title?: string;
  /** Maximum number of items to show */
  maxItems?: number;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Show user attribution */
  showUser?: boolean;
  /** Show entity type */
  showEntityType?: boolean;
  /** Optional header icon */
  icon?: React.ReactNode;
  /** Dense display mode */
  dense?: boolean;
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

const StyledList = styled(List)({
  padding: 0,
});

const StyledListItem = styled(ListItem)({
  '&:not(:last-child)': {
    borderBottom: `1px solid ${colors.grey[100]}`,
  },
  '&:hover': {
    backgroundColor: colors.grey[50],
  },
});

const TimelineDot = styled(Box)({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: colors.primary.main,
  marginRight: spacing.md,
  flexShrink: 0,
});

const TimelineConnector = styled(Box)({
  position: 'absolute',
  left: 28,
  top: 20,
  bottom: 0,
  width: 2,
  backgroundColor: colors.grey[200],
});

const ActivityContent = styled(Box)({
  display: 'flex',
  alignItems: 'flex-start',
  gap: spacing.sm,
  width: '100%',
});

const Timestamp = styled(Typography)({
  fontSize: typography.fontSize.xs,
  color: colors.grey[500],
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
  paddingLeft: spacing.md,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatAction(action: string): string {
  // Convert snake_case or SCREAMING_CASE to Title Case
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ActivityFeed - Displays a timeline of recent activities
 *
 * @example
 * <ActivityFeed
 *   title="Recent Activity"
 *   activities={activities}
 *   showUser
 *   maxItems={10}
 * />
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  title = 'Recent Activity',
  maxItems,
  loading = false,
  emptyMessage = 'No recent activity',
  showUser = true,
  showEntityType = false,
  icon,
  dense = false,
}) => {
  const displayActivities = maxItems ? activities.slice(0, maxItems) : activities;

  if (loading) {
    return (
      <StyledPaper>
        <Header>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width={150} height={28} />
        </Header>
        <StyledList>
          {[1, 2, 3, 4].map((i) => (
            <ListItem key={i}>
              <ListItemText
                primary={<Skeleton variant="text" width="70%" />}
                secondary={<Skeleton variant="text" width="40%" />}
              />
            </ListItem>
          ))}
        </StyledList>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Header>
        {icon || <HistoryIcon color="primary" />}
        <HeaderTitle>{title}</HeaderTitle>
      </Header>

      {displayActivities.length === 0 ? (
        <Box sx={{ p: spacing.lg }}>
          <Alert severity="info">{emptyMessage}</Alert>
        </Box>
      ) : (
        <StyledList dense={dense}>
          {displayActivities.map((activity, index) => (
            <StyledListItem
              key={activity.id}
              sx={{ position: 'relative' }}
            >
              {index < displayActivities.length - 1 && <TimelineConnector />}
              <ActivityContent>
                <TimelineDot />
                <ListItemText
                  primary={formatAction(activity.action)}
                  secondary={
                    <Box component="span">
                      {showUser && activity.user && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          {activity.user}
                        </Typography>
                      )}
                      {showEntityType && activity.entityType && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          display="block"
                        >
                          {activity.entityType}
                        </Typography>
                      )}
                    </Box>
                  }
                  primaryTypographyProps={{
                    fontWeight: typography.fontWeight.medium,
                    fontSize: typography.fontSize.sm,
                  }}
                />
                <Timestamp>{formatTimestamp(activity.timestamp)}</Timestamp>
              </ActivityContent>
            </StyledListItem>
          ))}
        </StyledList>
      )}

      {maxItems && activities.length > maxItems && (
        <Box
          sx={{
            p: spacing.md,
            textAlign: 'center',
            borderTop: `1px solid ${colors.grey[200]}`,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            +{activities.length - maxItems} more activities
          </Typography>
        </Box>
      )}
    </StyledPaper>
  );
};

export default ActivityFeed;
