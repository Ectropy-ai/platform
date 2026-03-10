/**
 * Design Tokens - Ectropy Construction Intelligence Platform
 *
 * Centralized design constants for consistent theming across the platform.
 * These tokens define the visual language of the Ectropy brand.
 *
 * Usage:
 *   import { colors, spacing, typography } from './tokens';
 *   const buttonStyle = { color: colors.primary.main, padding: spacing.md };
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const colors = {
  // Primary: Construction Blue - Professional, trustworthy
  primary: {
    main: '#1976d2',
    light: '#42a5f5',
    dark: '#1565c0',
    contrastText: '#ffffff',
  },

  // Secondary: Safety Orange - Action, attention, construction safety
  secondary: {
    main: '#f57c00',
    light: '#ff9800',
    dark: '#ef6c00',
    contrastText: '#ffffff',
  },

  // Semantic Colors
  error: {
    main: '#f44336',
    light: '#e57373',
    dark: '#d32f2f',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#ff9800',
    light: '#ffb74d',
    dark: '#f57c00',
    contrastText: '#000000',
  },
  info: {
    main: '#2196f3',
    light: '#64b5f6',
    dark: '#1976d2',
    contrastText: '#ffffff',
  },
  success: {
    main: '#4caf50',
    light: '#81c784',
    dark: '#388e3c',
    contrastText: '#ffffff',
  },

  // Neutrals: Grey scale for backgrounds, borders, text
  grey: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },

  // Background Colors
  background: {
    default: '#fafafa', // Light grey for page background
    paper: '#ffffff', // White for cards, modals
    elevated: '#ffffff', // White with shadow for raised elements
  },

  // Construction-specific colors
  construction: {
    steel: '#546e7a', // Steel grey
    concrete: '#90a4ae', // Concrete grey
    earth: '#8d6e63', // Earth brown
    caution: '#ffd54f', // Caution yellow
    hardhat: '#f57c00', // Safety orange (matches secondary)
  },

  // Status colors for construction workflows
  status: {
    pending: '#ff9800', // Orange
    inProgress: '#2196f3', // Blue
    completed: '#4caf50', // Green
    blocked: '#f44336', // Red
    review: '#9c27b0', // Purple
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  // Font Families
  fontFamily: {
    primary: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    monospace: '"Roboto Mono", "Courier New", monospace',
  },

  // Font Weights
  fontWeight: {
    light: 300,
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700,
  },

  // Font Sizes
  fontSize: {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '2rem', // 32px
    '4xl': '2.5rem', // 40px
    '5xl': '3rem', // 48px
  },

  // Line Heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.02em',
    tight: '-0.01em',
    normal: '0em',
    wide: '0.01em',
    wider: '0.02em',
    widest: '0.08em',
  },
} as const;

// ============================================================================
// SPACING
// ============================================================================

export const spacing = {
  // Base unit: 8px
  base: 8,

  // Spacing scale (multiples of 8px)
  xs: 4, // 0.5 * base
  sm: 8, // 1 * base
  md: 16, // 2 * base
  lg: 24, // 3 * base
  xl: 32, // 4 * base
  '2xl': 48, // 6 * base
  '3xl': 64, // 8 * base
  '4xl': 96, // 12 * base
} as const;

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12, // Default for most components
  xl: 16,
  '2xl': 24,
  full: '9999px', // Fully rounded (pills, circles)
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  base: '0 2px 8px rgba(0,0,0,0.1)',
  md: '0 4px 12px rgba(0,0,0,0.12)',
  lg: '0 6px 16px rgba(0,0,0,0.15)',
  xl: '0 10px 24px rgba(0,0,0,0.18)',
  '2xl': '0 20px 40px rgba(0,0,0,0.2)',

  // Colored shadows for emphasis
  primary: '0 2px 12px rgba(25,118,210,0.15)',
  secondary: '0 2px 12px rgba(245,124,0,0.15)',
} as const;

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transitions = {
  // Durations (in milliseconds)
  duration: {
    fastest: 100,
    faster: 150,
    fast: 200,
    normal: 300,
    slow: 400,
    slower: 500,
    slowest: 700,
  },

  // Easing functions
  easing: {
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  },

  // Pre-defined transitions
  default: 'all 0.3s ease-in-out',
  fast: 'all 0.15s ease-in-out',
  slow: 'all 0.5s ease-in-out',
} as const;

// ============================================================================
// Z-INDEX LAYERS
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  backdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  notification: 1080,
} as const;

// ============================================================================
// BREAKPOINTS (Media Queries)
// ============================================================================

export const breakpoints = {
  xs: 0, // Extra small: Mobile portrait
  sm: 600, // Small: Mobile landscape
  md: 960, // Medium: Tablet portrait
  lg: 1280, // Large: Tablet landscape / Desktop
  xl: 1920, // Extra large: Desktop HD
} as const;

// Helper functions for media queries
export const mediaQueries = {
  up: (breakpoint: keyof typeof breakpoints) => `@media (min-width: ${breakpoints[breakpoint]}px)`,
  down: (breakpoint: keyof typeof breakpoints) =>
    `@media (max-width: ${breakpoints[breakpoint] - 1}px)`,
  between: (min: keyof typeof breakpoints, max: keyof typeof breakpoints) =>
    `@media (min-width: ${breakpoints[min]}px) and (max-width: ${breakpoints[max] - 1}px)`,
} as const;

// ============================================================================
// COMPONENT-SPECIFIC TOKENS
// ============================================================================

export const components = {
  // Button sizes
  button: {
    height: {
      sm: 32,
      md: 40,
      lg: 48,
    },
    padding: {
      sm: '6px 16px',
      md: '10px 24px',
      lg: '14px 32px',
    },
  },

  // Input field sizes
  input: {
    height: {
      sm: 32,
      md: 40,
      lg: 48,
    },
  },

  // Card spacing
  card: {
    padding: {
      sm: spacing.md,
      md: spacing.lg,
      lg: spacing.xl,
    },
  },

  // App bar height
  appBar: {
    height: 64,
    heightMobile: 56,
  },

  // Drawer width
  drawer: {
    width: 280,
    widthMobile: 240,
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ColorToken = typeof colors;
export type TypographyToken = typeof typography;
export type SpacingToken = typeof spacing;
export type BorderRadiusToken = typeof borderRadius;
export type ShadowToken = typeof shadows;
export type TransitionToken = typeof transitions;
export type ZIndexToken = typeof zIndex;
export type BreakpointToken = typeof breakpoints;
export type ComponentToken = typeof components;
