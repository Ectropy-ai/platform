/**
 * =============================================================================
 * ECTROPY AUTHENTICATION & AUTHORIZATION SYSTEM
 *
 * PURPOSE: Enterprise-grade authentication with JWT and RBAC
 * FEATURES:
 * - JWT token generation and validation
 * - Role-based access control (RBAC)
 * - Session management with Redis
 * - Password policies and 2FA support
 * SECURITY:
 * - Secure token generation with proper expiration
 * - Role-based permission checking
 * - Session invalidation and timeout
 * - Rate limiting and brute force protection
 * USAGE:
 * import { AuthService, AuthMiddleware } from '@ectropy/auth';
 * const authService = new AuthService(dbClient, cacheClient, config);
 * app.use(AuthMiddleware.requireAuth());
*/

export { AuthService } from './services/auth.service.js';
export { JWTService } from './services/jwt.service.js';
export { SessionService } from './services/session.service.js';
export type { DatabaseClient, CacheClient } from './services/interfaces.js';
export { AuthMiddleware } from './middleware/auth.middleware.js';
export { RBACMiddleware } from './middleware/rbac.middleware.js';
export * from './types/auth.types.js';
export * from './utils/auth.utils.js';
