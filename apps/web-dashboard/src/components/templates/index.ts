/**
 * Template Components - Barrel Exports
 *
 * Centralized exports for all template components that use design tokens
 * from apps/web-dashboard/src/theme/tokens.ts for consistent styling.
 *
 * Part of Phase 3: Theme Page Templates
 */

// Hero Section Template
export { HeroSection } from './HeroSection';
export type { HeroSectionProps } from './HeroSection';

// Dashboard Layout Template
export { DashboardLayout } from './DashboardLayout';
export type { DashboardLayoutProps, NavigationItem } from './DashboardLayout';

// Metrics Card Template
export { MetricsCard, MetricsGrid } from './MetricsCard';
export type { MetricsCardProps, MetricStatus, TrendDirection } from './MetricsCard';

// Feature Grid Template
export { FeatureGrid } from './FeatureGrid';
export type { FeatureGridProps, Feature } from './FeatureGrid';
