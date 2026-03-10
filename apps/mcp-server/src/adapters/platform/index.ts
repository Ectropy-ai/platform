/**
 * Platform Context Adapter
 *
 * Ectropy's platform development domain adapter for the
 * Unified Decision Engine. Reads .roadmap/ canonical JSON
 * and maps to universal types.
 *
 * @module adapters/platform
 * @version 1.0.0
 */

// Platform Context Adapter
export { PlatformContextAdapter } from './platform-context.adapter.js';

// Platform Authority Configuration
export {
  PLATFORM_AUTHORITY_LEVELS,
  PLATFORM_ESCALATION_TIMEOUTS,
  createPlatformAuthorityCascade,
} from './platform-authority.config.js';

// Platform Eigenmodes
export {
  PLATFORM_EIGENMODE_DEFINITIONS,
  computeMetricValue,
  computeAllMetrics,
  metricsToEigenmodeVector,
  computeHealthAssessment,
} from './platform-eigenmodes.js';

export type {
  EigenmodeDefinition,
  PlatformMetricInputs,
} from './platform-eigenmodes.js';
