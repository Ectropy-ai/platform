/**
 * Demo Orchestrator - Multi-Demo Flow Architecture
 *
 * ENTERPRISE ARCHITECTURE (Sprint 5 - 2026-01-24)
 *
 * Central orchestration types and utilities for managing multiple demo flows.
 * Provides foundation for:
 * - Multi-tenant demo support
 * - Concurrent scenario instances
 * - Lifecycle management
 *
 * @module @ectropy/demo-scenarios/orchestrator
 */

// Core types
export type {
  DemoFlowConfig,
  DemoInstance,
  DemoInstanceId,
  DemoInstanceState,
  DemoLifecycleEvent,
  DemoSyncEvent,
  EntityType,
  DataProviderResult,
} from './types.js';

// Registry (instance management)
export { DemoRegistry, getDemoRegistry, resetDemoRegistry } from './demo-registry.js';
export type { RegisteredScenario, InstanceLookup } from './demo-registry.js';
