/**
 * MetricsCard Template Component
 *
 * Reusable metrics/KPI card template that explicitly uses design tokens
 * from apps/web-dashboard/src/theme/tokens.ts for consistent styling.
 *
 * Part of Phase 3: Theme Page Templates
 */

import React, { ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { styled } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { colors, spacing, typography, shadows, transitions, borderRadius } from '../../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type MetricStatus = 'pending' | 'inProgress' | 'completed' | 'blocked' | 'review';
export type TrendDirection = 'up' | 'down' | 'neutral';

export interface MetricsCardProps {
  /** Metric title/label */
  title: string;
  /** Primary value to display */
  value: string | number;
  /** Unit of measurement (e.g., "%", "ms", "GB") */
  unit?: string;
  /** Status of the metric (affects color) */
  status?: MetricStatus;
  /** Description or subtitle */
  description?: string;
  /** Trend direction indicator */
  trend?: TrendDirection;
  /** Trend value (e.g., "+12%", "-5%") */
  trendValue?: string;
  /** Custom icon */
  icon?: ReactNode;
  /** Whether to show loading state */
  loading?: boolean;
  /** Custom color override */
  color?: string;
  /** Click handler */
  onClick?: () => void;
  /** Card elevation */
  elevation?: number;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const StyledCard = styled(Card)<{ clickable?: boolean }>(({ clickable }) => ({
  height: '100%',
  borderRadius: borderRadius.lg,
  boxShadow: shadows.base,
  transition: transitions.default,
  cursor: clickable ? 'pointer' : 'default',

  ...(clickable && {
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: shadows.md,
    },
  }),
}));

const CardHeader = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: spacing.md,
});

const TitleSection = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  flexGrow: 1,
});

const IconWrapper = styled(Box)<{ statuscolor?: string }>(({ statuscolor }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 48,
  height: 48,
  borderRadius: borderRadius.md,
  backgroundColor: statuscolor ? `${statuscolor}20` : `${colors.primary.main}20`,
  color: statuscolor || colors.primary.main,
  transition: transitions.fast,
}));

const MetricTitle = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.medium,
  color: colors.grey[600],
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.wide,
});

const MetricValue = styled(Typography)<{ statuscolor?: string }>(({ statuscolor }) => ({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize['4xl'], // 40px
  fontWeight: typography.fontWeight.bold,
  color: statuscolor || colors.grey[900],
  lineHeight: typography.lineHeight.tight,
  marginBottom: spacing.xs,

  '@media (max-width: 600px)': {
    fontSize: typography.fontSize['3xl'], // 32px
  },
}));

const MetricUnit = styled('span')({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xl,
  fontWeight: typography.fontWeight.regular,
  marginLeft: spacing.xs,
  opacity: 0.7,
});

const MetricDescription = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.sm,
  color: colors.grey[600],
  lineHeight: typography.lineHeight.normal,
  marginTop: spacing.sm,
});

const TrendSection = styled(Box)<{ trendtype: TrendDirection }>(({ trendtype }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  marginTop: spacing.sm,
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: borderRadius.sm,
  backgroundColor:
    trendtype === 'up'
      ? `${colors.success.main}15`
      : trendtype === 'down'
        ? `${colors.error.main}15`
        : `${colors.grey[500]}15`,
  color:
    trendtype === 'up'
      ? colors.success.dark
      : trendtype === 'down'
        ? colors.error.dark
        : colors.grey[700],
  width: 'fit-content',
}));

const TrendValue = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semiBold,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getStatusColor = (status?: MetricStatus): string => {
  if (!status) return colors.primary.main;

  const statusColorMap: Record<MetricStatus, string> = {
    pending: colors.status.pending,
    inProgress: colors.status.inProgress,
    completed: colors.status.completed,
    blocked: colors.status.blocked,
    review: colors.status.review,
  };

  return statusColorMap[status];
};

const getTrendIcon = (trend?: TrendDirection): ReactNode => {
  if (!trend || trend === 'neutral') return null;
  return trend === 'up' ? (
    <TrendingUpIcon fontSize='small' />
  ) : (
    <TrendingDownIcon fontSize='small' />
  );
};

// ============================================================================
// METRICS CARD COMPONENT
// ============================================================================

/**
 * MetricsCard - Reusable KPI/metrics card template
 *
 * @example
 * <MetricsCard
 *   title="Cost Reduction"
 *   value={42}
 *   unit="%"
 *   status="completed"
 *   description="Average cost savings across projects"
 *   trend="up"
 *   trendValue="+12% this month"
 * />
 */
export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit,
  status,
  description,
  trend,
  trendValue,
  icon,
  loading = false,
  color,
  onClick,
  elevation = 1,
}) => {
  const statusColor = color || getStatusColor(status);

  return (
    <StyledCard
      elevation={elevation}
      clickable={!!onClick}
      onClick={onClick}
      sx={{ borderLeft: `4px solid ${statusColor}` }}
    >
      <CardContent sx={{ padding: spacing.lg }}>
        {loading ? (
          // Loading state
          <>
            <Skeleton variant='text' width='60%' height={24} sx={{ mb: 2 }} />
            <Skeleton variant='rectangular' width='100%' height={60} sx={{ mb: 1 }} />
            <Skeleton variant='text' width='40%' height={20} />
          </>
        ) : (
          // Content state
          <>
            <CardHeader>
              <TitleSection>
                {icon && <IconWrapper statuscolor={statusColor}>{icon}</IconWrapper>}
                <MetricTitle>{title}</MetricTitle>
              </TitleSection>
            </CardHeader>

            <Box>
              <MetricValue statuscolor={statusColor}>
                {value}
                {unit && <MetricUnit>{unit}</MetricUnit>}
              </MetricValue>

              {description && <MetricDescription>{description}</MetricDescription>}

              {trend && trendValue && (
                <TrendSection trendtype={trend}>
                  {getTrendIcon(trend)}
                  <TrendValue>{trendValue}</TrendValue>
                </TrendSection>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </StyledCard>
  );
};

// ============================================================================
// METRICS GRID COMPONENT
// ============================================================================

interface MetricsGridProps {
  /** Array of metrics to display */
  metrics: MetricsCardProps[];
  /** Number of columns (responsive) */
  columns?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
}

const GridContainer = styled(Box)({
  display: 'grid',
  gap: spacing.lg,
  gridTemplateColumns: 'repeat(1, 1fr)',

  '@media (min-width: 600px)': {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },

  '@media (min-width: 960px)': {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },

  '@media (min-width: 1280px)': {
    gridTemplateColumns: 'repeat(4, 1fr)',
  },
});

/**
 * MetricsGrid - Grid layout for multiple metrics cards
 *
 * @example
 * <MetricsGrid metrics={[
 *   { title: "Projects", value: 156, status: "inProgress" },
 *   { title: "Tasks", value: 423, status: "completed" },
 * ]} />
 */
export const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics }) => {
  return (
    <GridContainer>
      {metrics.map((metric, index) => (
        <MetricsCard key={index} {...metric} />
      ))}
    </GridContainer>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default MetricsCard;
