/**
 * StatsCard - Reusable statistics card for dashboards
 *
 * White-label ready component with consistent styling using design tokens.
 * Supports icons, status indicators, and trend badges.
 *
 * @module components/dashboard
 */

import React, { ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Chip, Skeleton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { colors, spacing, borderRadius, shadows, transitions, typography } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export type StatsStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatsCardProps {
  /** Card title/label */
  title: string;
  /** Primary value to display */
  value: string | number;
  /** Optional icon component */
  icon?: ReactNode;
  /** Status badge text */
  badge?: string;
  /** Status affects badge color */
  status?: StatsStatus;
  /** Loading state */
  loading?: boolean;
  /** Test ID for e2e testing */
  testId?: string;
  /** Click handler */
  onClick?: () => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StyledCard = styled(Card)<{ clickable?: boolean }>(({ clickable }) => ({
  height: '100%',
  minHeight: 140,
  borderRadius: borderRadius.lg,
  boxShadow: shadows.base,
  transition: transitions.default,
  cursor: clickable ? 'pointer' : 'default',
  backgroundColor: colors.background.paper,

  ...(clickable && {
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: shadows.md,
    },
  }),
}));

const CardContentStyled = styled(CardContent)({
  padding: spacing.lg,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
});

const TitleRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  marginBottom: spacing.sm,
});

const Title = styled(Typography)({
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  color: colors.grey[600],
});

const Value = styled(Typography)({
  fontSize: typography.fontSize['3xl'],
  fontWeight: typography.fontWeight.bold,
  color: colors.grey[900],
  lineHeight: 1.2,
  marginBottom: spacing.sm,
});

const IconWrapper = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  color: colors.primary.main,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getStatusColor = (status?: StatsStatus): 'success' | 'warning' | 'error' | 'info' | 'default' => {
  switch (status) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * StatsCard - Displays a single statistic with optional badge and icon
 *
 * @example
 * <StatsCard
 *   title="Active Tasks"
 *   value={42}
 *   icon={<AssignmentIcon />}
 *   badge="3 in progress"
 *   status="info"
 *   testId="dashboard-card-tasks"
 * />
 */
export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  badge,
  status = 'neutral',
  loading = false,
  testId,
  onClick,
}) => {
  if (loading) {
    return (
      <StyledCard data-testid={testId}>
        <CardContentStyled>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="40%" height={48} />
          <Skeleton variant="rectangular" width="50%" height={24} sx={{ borderRadius: 1 }} />
        </CardContentStyled>
      </StyledCard>
    );
  }

  return (
    <StyledCard data-testid={testId} clickable={!!onClick} onClick={onClick}>
      <CardContentStyled>
        <TitleRow>
          {icon && <IconWrapper>{icon}</IconWrapper>}
          <Title color="text.secondary">{title}</Title>
        </TitleRow>
        <Value>{value}</Value>
        {badge && (
          <Chip
            label={badge}
            size="small"
            color={getStatusColor(status)}
            sx={{ width: 'fit-content' }}
          />
        )}
      </CardContentStyled>
    </StyledCard>
  );
};

// ============================================================================
// STATS GRID
// ============================================================================

export interface StatsGridProps {
  /** Array of stat card configurations (alternative to children) */
  stats?: StatsCardProps[];
  /** Children elements (alternative to stats array) - preferred for flexibility */
  children?: ReactNode;
  /** Loading state - applied to all cards when using stats array */
  loading?: boolean;
  /** Number of columns at different breakpoints - can be a number or responsive object */
  columns?: number | {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
}

const GridContainer = styled(Box)<{ cols?: number | { xs?: number; sm?: number; md?: number; lg?: number } }>(({ cols }) => {
  // Handle simple number columns
  if (typeof cols === 'number') {
    return {
      display: 'grid',
      gap: spacing.lg,
      marginBottom: spacing.lg,
      gridTemplateColumns: 'repeat(1, 1fr)',

      '@media (min-width: 600px)': {
        gridTemplateColumns: `repeat(${Math.min(cols, 2)}, 1fr)`,
      },

      '@media (min-width: 960px)': {
        gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)`,
      },

      '@media (min-width: 1280px)': {
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      },
    };
  }

  // Handle responsive object columns
  const { xs = 1, sm = 2, md = 3, lg = 4 } = cols || {};
  return {
    display: 'grid',
    gap: spacing.lg,
    marginBottom: spacing.lg,
    gridTemplateColumns: `repeat(${xs}, 1fr)`,

    '@media (min-width: 600px)': {
      gridTemplateColumns: `repeat(${sm}, 1fr)`,
    },

    '@media (min-width: 960px)': {
      gridTemplateColumns: `repeat(${md}, 1fr)`,
    },

    '@media (min-width: 1280px)': {
      gridTemplateColumns: `repeat(${lg}, 1fr)`,
    },
  };
});

/**
 * StatsGrid - Grid layout for multiple stat cards
 *
 * Supports two usage patterns:
 *
 * @example Array-based (legacy)
 * <StatsGrid stats={statsArray} loading={isLoading} />
 *
 * @example Children-based (preferred for white-labeling)
 * <StatsGrid columns={4}>
 *   <StatsCard title="Users" value={42} icon={<UsersIcon />} />
 *   <StatsCard title="Revenue" value="$1.2M" icon={<MoneyIcon />} />
 * </StatsGrid>
 */
export const StatsGrid: React.FC<StatsGridProps> = ({ stats, children, loading = false, columns = 4 }) => {
  // Children-based usage (preferred)
  if (children) {
    return (
      <GridContainer cols={columns}>
        {children}
      </GridContainer>
    );
  }

  // Array-based usage (legacy support)
  if (stats) {
    return (
      <GridContainer cols={columns}>
        {stats.map((stat, index) => (
          <StatsCard key={stat.testId || index} {...stat} loading={loading} />
        ))}
      </GridContainer>
    );
  }

  return null;
};

export default StatsCard;
