/**
 * =============================================================================
 * ECTROPY SHARED UTILS - BROWSER-SAFE EXPORTS
 * =============================================================================
 * This entry point exports only browser-compatible utilities.
 * Server-only utilities (logger, request-context, platform-utils) are excluded.
 */

// Array utilities exports (ENTERPRISE P0.4: Safe array operations)
export {
  getLength,
  safeMap,
  safeFilter,
  safeFind,
  safeReduce,
  isEmpty,
  hasElements,
  safeFirst,
  safeLast,
  safeAt,
  safeConcat,
  safeSlice,
  safeIncludes,
  safeSort,
  safeReverse,
  safeUnique,
  safeFlatten,
} from './array-utils.js';

// Validation utilities
export { ValidationUtils } from './validation.js';

// Error classes only (no Express middleware)
export {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  SimpleError,
  DatabaseConnectionError,
  UnauthorizedError,
} from './simple-errors.js';
