/**
 * CrewList - Reusable crew/team member list for dashboards
 *
 * White-label ready component for displaying team members.
 * Supports avatars, status indicators, and role badges.
 *
 * @module components/dashboard
 */

import React from 'react';
import {
  Box,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Avatar,
  Skeleton,
  Alert,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import PeopleIcon from '@mui/icons-material/People';
import { colors, spacing, borderRadius, shadows, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export type CrewStatus = 'active' | 'scheduled' | 'inactive' | 'on_break';

export interface CrewMember {
  id: string | number;
  name: string;
  role: string;
  status: CrewStatus;
  crew?: string;
  email?: string;
  company?: string;
  avatar?: string;
}

export interface CrewListProps {
  /** Array of crew members to display */
  crew: CrewMember[];
  /** List title */
  title?: string;
  /** Maximum number of members to show */
  maxItems?: number;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Show crew/team assignment */
  showTeam?: boolean;
  /** Show company/organization */
  showCompany?: boolean;
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

const StyledAvatar = styled(Avatar)({
  width: 36,
  height: 36,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semiBold,
  backgroundColor: colors.primary.main,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStatusColor(status: CrewStatus): 'success' | 'warning' | 'default' | 'error' {
  switch (status) {
    case 'active':
      return 'success';
    case 'scheduled':
      return 'warning';
    case 'on_break':
      return 'default';
    case 'inactive':
      return 'error';
    default:
      return 'default';
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * CrewList - Displays a list of crew/team members with status
 *
 * @example
 * <CrewList
 *   title="Active Crew"
 *   crew={crewMembers}
 *   showTeam
 *   maxItems={5}
 * />
 */
export const CrewList: React.FC<CrewListProps> = ({
  crew,
  title = 'Crew Members',
  maxItems,
  loading = false,
  emptyMessage = 'No crew members assigned',
  showTeam = true,
  showCompany = false,
  icon,
  dense = false,
}) => {
  const displayCrew = maxItems ? crew.slice(0, maxItems) : crew;
  const activeCount = crew.filter((c) => c.status === 'active').length;

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
              <ListItemIcon>
                <Skeleton variant="circular" width={36} height={36} />
              </ListItemIcon>
              <ListItemText
                primary={<Skeleton variant="text" width="60%" />}
                secondary={<Skeleton variant="text" width="40%" />}
              />
              <Skeleton variant="rectangular" width={60} height={24} sx={{ borderRadius: 1 }} />
            </ListItem>
          ))}
        </StyledList>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Header>
        {icon || <PeopleIcon color="primary" />}
        <HeaderTitle>{title}</HeaderTitle>
        {crew.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {activeCount} active
          </Typography>
        )}
      </Header>

      {displayCrew.length === 0 ? (
        <Box sx={{ p: spacing.lg }}>
          <Alert severity="info">{emptyMessage}</Alert>
        </Box>
      ) : (
        <StyledList dense={dense}>
          {displayCrew.map((member) => (
            <StyledListItem key={member.id}>
              <ListItemIcon>
                <StyledAvatar src={member.avatar}>
                  {getInitials(member.name)}
                </StyledAvatar>
              </ListItemIcon>
              <ListItemText
                primary={member.name}
                secondary={
                  <Box component="span">
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                    >
                      {member.role}
                    </Typography>
                    {showTeam && member.crew && (
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        Team: {member.crew}
                      </Typography>
                    )}
                    {showCompany && member.company && (
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {member.company}
                      </Typography>
                    )}
                  </Box>
                }
                primaryTypographyProps={{
                  fontWeight: typography.fontWeight.medium,
                  fontSize: typography.fontSize.sm,
                }}
              />
              <Chip
                size="small"
                label={member.status.replace('_', ' ')}
                color={getStatusColor(member.status)}
              />
            </StyledListItem>
          ))}
        </StyledList>
      )}

      {maxItems && crew.length > maxItems && (
        <Box
          sx={{
            p: spacing.md,
            textAlign: 'center',
            borderTop: `1px solid ${colors.grey[200]}`,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            +{crew.length - maxItems} more members
          </Typography>
        </Box>
      )}
    </StyledPaper>
  );
};

export default CrewList;
