/**
 * HeroSection Template Component
 *
 * Reusable hero section template that explicitly uses design tokens from
 * apps/web-dashboard/src/theme/tokens.ts for consistent styling.
 *
 * Part of Phase 3: Theme Page Templates
 */

import React, { ReactNode } from 'react';
import { Box, Typography, Container, Stack } from '@mui/material';
import { styled } from '@mui/material/styles';
import { colors, spacing, typography, shadows, transitions, borderRadius } from '../../theme';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HeroSectionProps {
  /** Main heading text */
  title: string;
  /** Subtitle or description text */
  subtitle?: string;
  /** Call-to-action button or element */
  cta?: ReactNode;
  /** Additional content (metrics, forms, etc.) */
  children?: ReactNode;
  /** Hero variant style */
  variant?: 'gradient' | 'solid' | 'minimal';
  /** Background color (for 'solid' variant) */
  backgroundColor?: string;
  /** Text color override */
  textColor?: string;
  /** Minimum height of hero section */
  minHeight?: string | number;
  /** Alignment of content */
  align?: 'left' | 'center' | 'right';
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const HeroContainer = styled(Box)<{ variant: string; customBg?: string }>(
  ({ variant, customBg }) => ({
    position: 'relative',
    width: '100%',
    minHeight: '500px',
    paddingTop: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    overflow: 'hidden',

    // Gradient variant - Construction Blue gradient
    ...(variant === 'gradient' && {
      background: `linear-gradient(135deg, ${colors.primary.main} 0%, ${colors.primary.dark} 50%, #0d47a1 100%)`,
      color: colors.primary.contrastText,
    }),

    // Solid variant - Single color background
    ...(variant === 'solid' && {
      backgroundColor: customBg || colors.primary.main,
      color: colors.primary.contrastText,
    }),

    // Minimal variant - Light background
    ...(variant === 'minimal' && {
      backgroundColor: colors.background.default,
      color: colors.grey[900],
    }),

    // Responsive padding
    '@media (max-width: 960px)': {
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      minHeight: '400px',
    },

    '@media (max-width: 600px)': {
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      minHeight: '350px',
    },
  }),
);

const ContentWrapper = styled(Stack)<{ $align: string }>(({ $align }) => ({
  position: 'relative',
  zIndex: 1,
  alignItems: $align === 'center' ? 'center' : $align === 'right' ? 'flex-end' : 'flex-start',
  textAlign: $align as any,
  gap: spacing.lg,
}));

const HeroTitle = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize['5xl'], // 48px
  fontWeight: typography.fontWeight.bold,
  lineHeight: typography.lineHeight.tight,
  marginBottom: spacing.md,

  '@media (max-width: 960px)': {
    fontSize: typography.fontSize['4xl'], // 40px
  },

  '@media (max-width: 600px)': {
    fontSize: typography.fontSize['3xl'], // 32px
  },
});

const HeroSubtitle = styled(Typography)({
  fontFamily: typography.fontFamily.primary,
  fontSize: typography.fontSize.xl, // 20px
  fontWeight: typography.fontWeight.regular,
  lineHeight: typography.lineHeight.relaxed,
  opacity: 0.95,
  maxWidth: '800px',
  marginBottom: spacing.lg,

  '@media (max-width: 960px)': {
    fontSize: typography.fontSize.lg, // 18px
  },

  '@media (max-width: 600px)': {
    fontSize: typography.fontSize.base, // 16px
  },
});

const CTAWrapper = styled(Box)({
  display: 'flex',
  gap: spacing.md,
  flexWrap: 'wrap',
  marginTop: spacing.lg,
  justifyContent: 'inherit',

  '@media (max-width: 600px)': {
    flexDirection: 'column',
    width: '100%',
    '& > *': {
      width: '100%',
    },
  },
});

const ChildrenWrapper = styled(Box)({
  marginTop: spacing['2xl'],
  width: '100%',

  '@media (max-width: 600px)': {
    marginTop: spacing.xl,
  },
});

// Decorative background pattern (optional)
const BackgroundPattern = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  opacity: 0.05,
  pointerEvents: 'none',
  background: `repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(255, 255, 255, 0.1) 10px,
    rgba(255, 255, 255, 0.1) 20px
  )`,
});

// ============================================================================
// HERO SECTION COMPONENT
// ============================================================================

/**
 * HeroSection - Reusable hero section template
 *
 * @example
 * <HeroSection
 *   title="Welcome to Ectropy"
 *   subtitle="AI-Powered Construction Intelligence"
 *   variant="gradient"
 *   cta={<Button variant="contained">Get Started</Button>}
 * >
 *   <MetricsCard metrics={platformMetrics} />
 * </HeroSection>
 */
export const HeroSection: React.FC<HeroSectionProps> = ({
  title,
  subtitle,
  cta,
  children,
  variant = 'gradient',
  backgroundColor,
  textColor,
  minHeight = '500px',
  align = 'center',
}) => {
  return (
    <HeroContainer
      variant={variant}
      customBg={backgroundColor}
      sx={{
        minHeight,
        ...(textColor && { color: textColor }),
      }}
    >
      {variant === 'gradient' && <BackgroundPattern />}

      <Container maxWidth='lg'>
        <ContentWrapper $align={align} spacing={spacing.lg}>
          <Box>
            <HeroTitle variant='h1'>{title}</HeroTitle>

            {subtitle && <HeroSubtitle>{subtitle}</HeroSubtitle>}
          </Box>

          {cta && <CTAWrapper>{cta}</CTAWrapper>}

          {children && <ChildrenWrapper>{children}</ChildrenWrapper>}
        </ContentWrapper>
      </Container>
    </HeroContainer>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default HeroSection;
