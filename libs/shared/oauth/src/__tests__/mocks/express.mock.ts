/**
 * ENTERPRISE MOCK - Express Request/Response
 *
 * Purpose: Mock Express objects for OAuth middleware testing
 * Pattern: Chainable mocks with state tracking
 */

import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

export interface MockSession {
  id: string;
  oauthState?: {
    state: string;
    codeVerifier?: string;
    redirectUrl?: string;
    timestamp: number;
  };
  user?: any;
  save: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  regenerate: ReturnType<typeof vi.fn>;
}

export interface MockRequestOptions {
  query?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  session?: Partial<MockSession>;
  ip?: string;
  path?: string;
  method?: string;
  user?: any;
}

/**
 * Creates a mock Express Request object
 */
export function createMockRequest(options: MockRequestOptions = {}): Request & {
  session: MockSession;
} {
  const session: MockSession = {
    id: 'mock-session-id-12345',
    ...options.session,
    save: vi.fn((callback?: (err?: any) => void) => {
      if (callback) callback();
    }),
    destroy: vi.fn((callback?: (err?: any) => void) => {
      if (callback) callback();
    }),
    regenerate: vi.fn((callback?: (err?: any) => void) => {
      if (callback) callback();
    }),
  };

  return {
    query: options.query || {},
    body: options.body || {},
    cookies: options.cookies || {},
    headers: options.headers || {},
    session,
    ip: options.ip || '127.0.0.1',
    path: options.path || '/auth/callback',
    method: options.method || 'GET',
    user: options.user,
    get: vi.fn((header: string) => {
      const headerMap: Record<string, string> = {
        'User-Agent': options.headers?.['user-agent'] || 'Mozilla/5.0 Test Agent',
        origin: options.headers?.origin || 'http://localhost:3000',
        ...options.headers,
      };
      return headerMap[header] || headerMap[header.toLowerCase()];
    }),
  } as unknown as Request & { session: MockSession };
}

/**
 * Creates a mock Express Response object
 */
export function createMockResponse(): Response & {
  _statusCode: number;
  _jsonData: any;
  _redirectUrl: string | null;
  _headers: Record<string, string>;
  _cookies: Record<string, { value: string; options?: any }>;
  _clearedCookies: string[];
} {
  const res = {
    _statusCode: 200,
    _jsonData: null,
    _redirectUrl: null,
    _headers: {} as Record<string, string>,
    _cookies: {} as Record<string, { value: string; options?: any }>,
    _clearedCookies: [] as string[],

    status: vi.fn(function (this: any, code: number) {
      this._statusCode = code;
      return this;
    }),

    json: vi.fn(function (this: any, data: any) {
      this._jsonData = data;
      return this;
    }),

    redirect: vi.fn(function (this: any, url: string) {
      this._redirectUrl = url;
      this._statusCode = 302;
      return this;
    }),

    setHeader: vi.fn(function (this: any, name: string, value: string) {
      this._headers[name] = value;
      return this;
    }),

    cookie: vi.fn(function (this: any, name: string, value: string, options?: any) {
      this._cookies[name] = { value, options };
      return this;
    }),

    clearCookie: vi.fn(function (this: any, name: string) {
      this._clearedCookies.push(name);
      delete this._cookies[name];
      return this;
    }),

    send: vi.fn(function (this: any, data: any) {
      this._jsonData = data;
      return this;
    }),

    end: vi.fn(function (this: any) {
      return this;
    }),
  } as Response & {
    _statusCode: number;
    _jsonData: any;
    _redirectUrl: string | null;
    _headers: Record<string, string>;
    _cookies: Record<string, { value: string; options?: any }>;
    _clearedCookies: string[];
  };

  return res;
}

/**
 * Creates a mock NextFunction
 */
export function createMockNext(): NextFunction & { _called: boolean; _error: any } {
  const next = vi.fn(function (this: any, err?: any) {
    this._called = true;
    this._error = err;
  }) as NextFunction & { _called: boolean; _error: any };

  next._called = false;
  next._error = undefined;

  return next;
}
