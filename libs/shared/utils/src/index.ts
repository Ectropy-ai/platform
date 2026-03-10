/**
 * =============================================================================
 * ECTROPY SHARED UTILS - MAIN EXPORTS
 */

// Logger exports
export { Logger, logger, LogLevel, DataSanitizer } from './logger.js';
export type { LogContext } from './logger.js';

// Request context exports (AsyncLocalStorage-based)
export {
  requestContext,
  RequestContextManager,
  CONTEXT_HEADERS,
} from './request-context.js';
export type { RequestContext } from './request-context.js';

// Platform utilities
export { PlatformUtils } from './platform-utils.js';

// Validation utilities
export { ValidationUtils } from './validation.js';

// Error handling exports
export {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  SimpleError,
  DatabaseConnectionError,
  UnauthorizedError,
  asyncHandler,
  createResponse,
  errorHandler,
} from './simple-errors.js';

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
