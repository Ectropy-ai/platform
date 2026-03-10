/**
 * FeatureGrid Template Component
 *
 * Reusable feature grid layout template that explicitly uses design tokens
 * from apps/web-dashboard/src/theme/tokens.ts for consistent styling.
 *
 * Part of Phase 3: Theme Page Templates
 */

import React, { ReactNode } from 'react';
import { Box, Card, CardContent, Typography, Grid, Button } from '@mui/material';
import { styled } from '@mui/material/styles';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { colors, spacing, typography, shadows, transitions, borderRadius } from '../../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Feature {
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Icon component */
  icon?: ReactNode;
  /** Optional metric or badge */
  badge?: string;
  /** Click handler */
  onClick?: () => void;
  /** Link URL */
  href?: string;
  /** Link text */
  linkText?: string;
  /** Color accent */
  color?: 'primary' | 'secondary' | 'construction';
}

export interface FeatureGridProps {
  /** Array of features to display */
  features: Feature[];
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Number of columns (responsive grid) */
  columns?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  /** Grid layout variant */
  variant?: 'card' | 'minimal' | 'elevated';
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const SectionHeader = styled(Box)({
  textAlign: 'center',
  marginBottom: spacing['3xl'],

  '@media (max-width: 600px)': {
    marginBottom: spacing['2xl'],
  },
});

const SectionTitle = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize['4xl'], // 40px
  fontWeight: typography.fontWeight.bold,
  color: colors.grey[900],
  marginBottom: spacing.md,

  '@media (max-width: 960px)': {
    fontSize: typography.fontSize['3xl'], // 32px
  },

  '@media (max-width: 600px)': {
    fontSize: typography.fontSize['2xl'], // 24px
  },
});

const SectionDescription = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.lg,
  color: colors.grey[600],
  maxWidth: '800px',
  margin: '0 auto',
  lineHeight: typography.lineHeight.relaxed,

  '@media (max-width: 600px)': {
    fontSize: typography.fontSize.base,
  },
});

const FeatureCardStyled = styled(Card)<{ stylevariant: string }>(({ stylevariant }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: borderRadius.lg,
  transition: transitions.default,
  cursor: 'default',

  // Card variant - default with shadow
  ...(stylevariant === 'card' && {
    boxShadow: shadows.base,
    backgroundColor: colors.background.paper,

    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: shadows.md,
    },
  }),

  // Minimal variant - flat with border
  ...(stylevariant === 'minimal' && {
    boxShadow: 'none',
    border: `1px solid ${colors.grey[200]}`,
    backgroundColor: colors.background.paper,

    '&:hover': {
      borderColor: colors.primary.main,
      boxShadow: shadows.sm,
    },
  }),

  // Elevated variant - larger shadow
  ...(stylevariant === 'elevated' && {
    boxShadow: shadows.md,
    backgroundColor: colors.background.paper,

    '&:hover': {
      transform: 'translateY(-6px)',
      boxShadow: shadows.lg,
    },
  }),
}));

const IconWrapper = styled(Box)<{ accentcolor?: string }>(({ accentcolor }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 64,
  height: 64,
  borderRadius: borderRadius.lg,
  backgroundColor: accentcolor ? `${accentcolor}20` : `${colors.primary.main}20`,
  color: accentcolor || colors.primary.main,
  marginBottom: spacing.lg,
  fontSize: '2rem',
  transition: transitions.fast,
}));

const FeatureHeader = styled(Box)({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  marginBottom: spacing.md,
});

const FeatureTitle = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xl,
  fontWeight: typography.fontWeight.bold,
  color: colors.grey[900],
  marginBottom: spacing.sm,
  lineHeight: typography.lineHeight.tight,
});

const FeatureDescription = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.base,
  color: colors.grey[600],
  lineHeight: typography.lineHeight.relaxed,
  marginBottom: spacing.md,
  flexGrow: 1,
});

const FeatureBadge = styled(Box)<{ accentcolor?: string }>(({ accentcolor }) => ({
  display: 'inline-block',
  padding: `${spacing.xs}px ${spacing.sm}px`,
  borderRadius: borderRadius.full,
  backgroundColor: accentcolor ? `${accentcolor}20` : `${colors.primary.main}20`,
  color: accentcolor || colors.primary.main,
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.semiBold,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.wide,
}));

const FeatureLink = styled(Button)<{ accentcolor?: string }>(({ accentcolor }) => ({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semiBold,
  color: accentcolor || colors.primary.main,
  padding: `${spacing.xs}px 0`,
  textTransform: 'none',
  alignSelf: 'flex-start',
  marginTop: 'auto',

  '&:hover': {
    backgroundColor: 'transparent',
    textDecoration: 'underline',
  },
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getAccentColor = (color?: Feature['color']): string => {
  if (!color) return colors.primary.main;

  const colorMap = {
    primary: colors.primary.main,
    secondary: colors.secondary.main,
    construction: colors.construction.steel,
  };

  return colorMap[color];
};

// ============================================================================
// FEATURE CARD COMPONENT
// ============================================================================

const FeatureCard: React.FC<Feature & { variant: string }> = ({
  title,
  description,
  icon,
  badge,
  onClick,
  href,
  linkText = 'Learn more',
  color,
  variant,
}) => {
  const accentColor = getAccentColor(color);

  return (
    <FeatureCardStyled
      stylevariant={variant}
      onClick={onClick}
      sx={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <CardContent
        sx={{
          padding: spacing.lg,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {icon && <IconWrapper accentcolor={accentColor}>{icon}</IconWrapper>}

        <FeatureHeader>
          <Box sx={{ flexGrow: 1 }}>
            <FeatureTitle>{title}</FeatureTitle>
          </Box>
          {badge && <FeatureBadge accentcolor={accentColor}>{badge}</FeatureBadge>}
        </FeatureHeader>

        <FeatureDescription>{description}</FeatureDescription>

        {(href || onClick) && (
          <FeatureLink
            endIcon={<ArrowForwardIcon fontSize='small' />}
            onClick={onClick}
            href={href}
            accentcolor={accentColor}
          >
            {linkText}
          </FeatureLink>
        )}
      </CardContent>
    </FeatureCardStyled>
  );
};

// ============================================================================
// FEATURE GRID COMPONENT
// ============================================================================

/**
 * FeatureGrid - Reusable feature grid layout
 *
 * @example
 * <FeatureGrid
 *   title="Platform Features"
 *   description="Powerful capabilities for construction management"
 *   features={[
 *     {
 *       title: "AI-Powered Analysis",
 *       description: "Automated insights from construction data",
 *       icon: <AnalyticsIcon />,
 *       color: "primary"
 *     },
 *     {
 *       title: "BIM Integration",
 *       description: "Seamless 3D model collaboration",
 *       icon: <ModelIcon />,
 *       badge: "New"
 *     }
 *   ]}
 * />
 */
export const FeatureGrid: React.FC<FeatureGridProps> = ({
  features,
  title,
  description,
  columns = { xs: 1, sm: 2, md: 3, lg: 3 },
  variant = 'card',
}) => {
  return (
    <Box sx={{ width: '100%' }}>
      {(title || description) && (
        <SectionHeader>
          {title && <SectionTitle variant='h2'>{title}</SectionTitle>}
          {description && <SectionDescription>{description}</SectionDescription>}
        </SectionHeader>
      )}

      <Grid container spacing={spacing.lg / 8}>
        {features.map((feature, index) => (
          <Grid
            item
            key={index}
            xs={12 / (columns.xs || 1)}
            sm={12 / (columns.sm || 2)}
            md={12 / (columns.md || 3)}
            lg={12 / (columns.lg || 3)}
          >
            <FeatureCard {...feature} variant={variant} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default FeatureGrid;
