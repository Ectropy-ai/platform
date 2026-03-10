/**
 * Unified Decision Engine Adapters
 *
 * Central export for the adapter layer of the Unified Decision Engine.
 * Provides universal types, the context adapter interface, the context
 * registry, and all concrete adapter implementations.
 *
 * Architecture:
 * ```
 * Context Registry (manages adapters)
 *   ├── PlatformContextAdapter  (reads .roadmap/ JSON)
 *   ├── ConstructionContextAdapter (future: reads Prisma DB)
 *   └── ... (additional domains)
 * ```
 *
 * @module adapters
 * @version 1.0.0
 */

// Universal types and interfaces (domain-agnostic)
export * from './universal/index.js';

// Context registry (multi-adapter management)
export { ContextRegistry } from './context-registry.js';
export type { RegisteredAdapter, RegistrySummary } from './context-registry.js';

// Platform adapter (Ectropy development domain)
export * from './platform/index.js';

// Startup (adapter initialization)
export { initializeAdapters } from './startup.js';
