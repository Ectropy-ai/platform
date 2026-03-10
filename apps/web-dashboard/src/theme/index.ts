/**
 * Theme Index - Main export for Ectropy theme system
 *
 * Import the complete theme system from here:
 *   import { ectropyTheme, tokens } from './theme';
 */

// Export the main Ectropy theme
export { ectropyTheme, default } from './ectropy-theme';

// Export design tokens for direct access
export * as tokens from './tokens';
export {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  mediaQueries,
  components,
} from './tokens';

// Export alternative theme configurations (light/dark mode support)
export { lightTheme, darkTheme } from './theme.config';
