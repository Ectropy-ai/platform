/**
 * Dashboard Components - Central Export
 *
 * Reusable, white-label ready dashboard components using design tokens.
 * All components support theming, loading states, and responsive layouts.
 *
 * @module components/dashboard
 */

// Stats Card
export { StatsCard, StatsGrid } from './StatsCard';
export type { StatsCardProps, StatsGridProps, StatsStatus } from './StatsCard';

// Task Table
export { TaskTable } from './TaskTable';
export type { TaskTableProps, Task, TaskStatus, TaskPriority } from './TaskTable';

// Alert List
export { AlertList } from './AlertList';
export type { AlertListProps, Alert, AlertSeverity } from './AlertList';

// Crew List
export { CrewList } from './CrewList';
export type { CrewListProps, CrewMember, CrewStatus } from './CrewList';

// Budget Table
export { BudgetTable } from './BudgetTable';
export type { BudgetTableProps, BudgetItem, BudgetSummary, BudgetStatus } from './BudgetTable';

// Activity Feed
export { ActivityFeed } from './ActivityFeed';
export type { ActivityFeedProps, Activity } from './ActivityFeed';

// Usage Widget (Phase 8.1 - Trial Limits UI)
export { UsageWidget } from './UsageWidget';
