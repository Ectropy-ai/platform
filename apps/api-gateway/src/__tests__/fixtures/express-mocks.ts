/**
 * ENTERPRISE TEST FIXTURES - Express Mock Objects
 *
 * Purpose: Centralized, complete Express request/response mocks
 * Scope: API Gateway test infrastructure
 * Framework: Vitest
 *
 * ENTERPRISE BENEFITS:
 * - DRY Principle: Single source of truth for Express mocks
 * - Completeness: ALL Express methods implemented (prevents undefined errors)
 * - Consistency: Same mock behavior across all test files
 * - Scalability: Easy to extend for new Express features
 * - Type Safety: Full TypeScript support with Express types
 *
 * USAGE PATTERN:
 * ```typescript
 * import { createMockRequest, createMockResponse } from '@/__tests__/fixtures/express-mocks';
 *
 * const mockReq = createMockRequest({
 *   user: { id: 'user-123', email: 'test@example.com', roles: ['user'] },
 *   params: { projectId: 'project-456' },
 * });
 *
 * const mockRes = createMockResponse();
 * ```
 *
 * STRATEGIC ALIGNMENT:
 * - Industry Best Practice: Centralized test fixtures (Jest/Vitest docs)
 * - Test Infrastructure: Foundation for 1000+ test scalability
 * - Enterprise Quality: Reduce test flakiness from incomplete mocks
 * - Developer Experience: Clear patterns, easy onboarding
 */

import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Creates a complete Express Request mock with all common properties
 *
 * @param overrides - Partial request object to merge with defaults
 * @returns Fully mocked Express Request object
 *
 * @example
 * ```typescript
 * const mockReq = createMockRequest({
 *   user: { id: 'user-123', email: 'test@example.com', roles: ['admin'] },
 *   params: { projectId: 'project-456' },
 *   path: '/api/projects/project-456',
 *   method: 'GET',
 * });
 * ```
 */
export function createMockRequest(
  overrides: Partial<Request> = {}
): Partial<Request> {
  // ENTERPRISE FIX (2026-01-05): Deep merge overrides to preserve default properties
  // Previous implementation used spread operator which REPLACED defaults instead of merging
  // Regression: Commit 60416145 caused 50+ test failures (req.headers undefined)
  // Root Cause: `...overrides` at end replaced `headers: {}` with undefined
  // Solution: Merge overrides property-by-property, preserving defaults

  const defaults = {
    // URL/Route Properties
    params: {},
    query: {},
    body: {},
    path: '/',
    method: 'GET',
    url: '/',
    originalUrl: '/',
    baseUrl: '',

    // Headers (CRITICAL - must not be replaced by spread operator)
    headers: {},
    get: vi.fn((name: string) => {
      const headers = (overrides.headers || {}) as Record<
        string,
        string | string[]
      >;
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value : value;
    }) as any,

    // Authentication (Passport.js)
    user: undefined,
    isAuthenticated: vi.fn(() => !!overrides.user) as any,
    isUnauthenticated: vi.fn(() => !overrides.user) as any,

    // Session
    session: {} as any,
    sessionID: 'mock-session-id',

    // Request Metadata
    ip: '127.0.0.1',
    protocol: 'http',
    secure: false,
    xhr: false,

    // Cookie Handling
    cookies: {},
    signedCookies: {},

    // Content Negotiation
    accepts: vi.fn(),
    acceptsCharsets: vi.fn(),
    acceptsEncodings: vi.fn(),
    acceptsLanguages: vi.fn(),

    // Range Support
    range: vi.fn(),

    // Parameter Helpers
    param: vi.fn((name: string) => {
      return (
        (overrides.params as Record<string, any>)?.[name] ||
        (overrides.query as Record<string, any>)?.[name] ||
        (overrides.body as Record<string, any>)?.[name]
      );
    }),

    // Type Checking
    is: vi.fn(),
  };

  // ENTERPRISE MERGE STRATEGY: Selective property override with destructuring
  // Deep merge nested objects (params, query, body, headers, cookies, signedCookies)
  // to prevent overrides from nullifying defaults.
  //
  // FIX (2026-01-06): Destructure nested object properties from overrides FIRST,
  // then spread only remaining properties. This prevents spread operator from
  // overwriting explicit property assignments.
  //
  // JavaScript object literal order: Later properties override earlier ones.
  // If we spread ...overrides after explicit properties, the spread wins.
  // Solution: Extract nested properties, spread remaining, then add explicit properties.
  const {
    params: overrideParams,
    query: overrideQuery,
    body: overrideBody,
    headers: overrideHeaders,
    cookies: overrideCookies,
    signedCookies: overrideSignedCookies,
    ...otherOverrides
  } = overrides;

  const merged: Partial<Request> = {
    ...defaults,
    ...otherOverrides, // Only non-nested properties from overrides
    // Deep merge for object properties that should accumulate, not replace
    // Explicit undefined checks ensure defaults are preserved when overrides are undefined
    params:
      overrideParams !== undefined
        ? { ...defaults.params, ...overrideParams }
        : defaults.params,
    query:
      overrideQuery !== undefined
        ? { ...defaults.query, ...overrideQuery }
        : defaults.query,
    body:
      overrideBody !== undefined
        ? { ...defaults.body, ...overrideBody }
        : defaults.body,
    headers:
      overrideHeaders !== undefined
        ? { ...defaults.headers, ...overrideHeaders }
        : defaults.headers,
    cookies:
      overrideCookies !== undefined
        ? { ...defaults.cookies, ...overrideCookies }
        : defaults.cookies,
    signedCookies:
      overrideSignedCookies !== undefined
        ? { ...defaults.signedCookies, ...overrideSignedCookies }
        : defaults.signedCookies,
  };

  return merged;
}

/**
 * Creates a complete Express Response mock with all chainable methods
 *
 * @returns Fully mocked Express Response object with chainable methods
 *
 * @example
 * ```typescript
 * const mockRes = createMockResponse();
 *
 * // All methods return mockRes for chaining
 * mockRes.status(200).json({ success: true });
 *
 * // Verify calls
 * expect(mockRes.status).toHaveBeenCalledWith(200);
 * expect(mockRes.json).toHaveBeenCalledWith({ success: true });
 * ```
 *
 * COMPLETENESS GUARANTEE:
 * - ALL Express response methods implemented
 * - ALL methods return `this` for chaining (Express pattern)
 * - Prevents "Cannot read properties of undefined" errors
 */
export function createMockResponse(): Partial<Response> {
  const mockRes: Partial<Response> = {
    // Status Code
    statusCode: 200,
    statusMessage: 'OK',

    // Header Management
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
    removeHeader: vi.fn().mockReturnThis(),
    getHeaders: vi.fn(() => ({})),
    getHeaderNames: vi.fn(() => []),
    hasHeader: vi.fn(() => false),

    // Response Sending
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    jsonp: vi.fn().mockReturnThis(),
    sendFile: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
    download: vi.fn().mockReturnThis(),

    // Status Methods
    status: vi.fn().mockReturnThis(),

    // Content Type
    type: vi.fn().mockReturnThis(),
    contentType: vi.fn().mockReturnThis(),

    // Headers
    header: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    get: vi.fn(),

    // Cookies (CRITICAL - prevents "Cannot read properties of undefined (reading 'cookie')")
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),

    // Redirects
    redirect: vi.fn().mockReturnThis(),

    // Location
    location: vi.fn().mockReturnThis(),

    // Links
    links: vi.fn().mockReturnThis(),

    // Vary
    vary: vi.fn().mockReturnThis(),

    // Rendering
    render: vi.fn().mockReturnThis(),

    // Format
    format: vi.fn().mockReturnThis(),

    // Attachment
    attachment: vi.fn().mockReturnThis(),

    // Locals (template variables)
    locals: {},

    // Stream Methods
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    writeContinue: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),

    // HTTP/2 Methods
    writeProcessing: vi.fn().mockReturnThis(),
  };

  return mockRes;
}

/**
 * Creates a mock NextFunction for Express middleware testing
 *
 * @returns Vitest mock function compatible with Express NextFunction
 *
 * @example
 * ```typescript
 * const mockNext = createMockNext();
 *
 * middleware(mockReq, mockRes, mockNext);
 *
 * expect(mockNext).toHaveBeenCalledTimes(1);
 * ```
 */
export function createMockNext(): NextFunction {
  return vi.fn() as NextFunction;
}

/**
 * Creates a complete set of Express middleware test fixtures
 *
 * @param options - Optional overrides for request and response
 * @returns Object containing mockReq, mockRes, and mockNext
 *
 * @example
 * ```typescript
 * const { mockReq, mockRes, mockNext } = createExpressMocks({
 *   req: { user: { id: 'user-123' } },
 * });
 *
 * await middleware(mockReq as Request, mockRes as Response, mockNext);
 * ```
 */
export function createExpressMocks(
  options: {
    req?: Partial<Request>;
    res?: Partial<Response>;
  } = {}
): {
  mockReq: Partial<Request>;
  mockRes: Partial<Response>;
  mockNext: NextFunction;
} {
  return {
    mockReq: createMockRequest(options.req),
    mockRes: createMockResponse(),
    mockNext: createMockNext(),
  };
}

/**
 * Helper to extract status code and JSON body from response mock
 *
 * @param mockRes - Mocked Express response object
 * @returns Object with status code and parsed JSON body
 *
 * @example
 * ```typescript
 * const mockRes = createMockResponse();
 * middleware(mockReq, mockRes, mockNext);
 *
 * const { status, json } = getResponseData(mockRes);
 * expect(status).toBe(401);
 * expect(json).toEqual({ error: 'Authentication required' });
 * ```
 */
export function getResponseData(mockRes: Partial<Response>) {
  const statusMock = mockRes.status as ReturnType<typeof vi.fn>;
  const jsonMock = mockRes.json as ReturnType<typeof vi.fn>;

  return {
    status: statusMock.mock.calls[0]?.[0],
    json: jsonMock.mock.calls[0]?.[0],
  };
}
