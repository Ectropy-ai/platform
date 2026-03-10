/** @jest-environment jsdom */
/**
 * @fileoverview Authentication hook tests - OAuth only
 * @version 2.0.0
 * SECURITY: Demo authentication tests removed per security requirements
 * 
 * OAuth Session-Based Authentication:
 * - Backend manages oauth_session cookie automatically
 * - Frontend always checks /api/auth/me on mount (with credentials: 'include')
 * - No manual cookie management needed (oauth_session is HttpOnly, managed by browser)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth, AuthProvider } from '../useAuth';
import Cookies from 'js-cookie';
import { vi } from 'vitest';

// Mock js-cookie with default export (ESM compatibility)
vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

// Mock logger service
vi.mock('../../services/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config service with test API URL
vi.mock('../../services/config', () => ({
  config: {
    apiBaseUrl: 'http://localhost:4000',
  },
}));

const TEST_API_BASE_URL = 'http://localhost:4000';

// Mock fetch
global.fetch = vi.fn();

describe('useAuth Hook - OAuth Only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  describe('OAuth Authentication', () => {
    it('should provide loginWithOAuth function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.loginWithOAuth).toBeDefined();
      expect(typeof result.current.loginWithOAuth).toBe('function');
    });

    it('should redirect to OAuth provider on loginWithOAuth call', async () => {
      // Mock window.location.href
      delete (window as any).location;
      window.location = { href: '' } as any;

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        result.current.loginWithOAuth('google');
      });

      // OAuth endpoint should be /api/auth/{provider}
      expect(window.location.href).toContain('/api/auth/google');
    });
  });

  describe('Backend Authentication', () => {
    it('should call backend API for OAuth tokens', async () => {
      const mockApiResponse = {
        user: {
          id: 'oauth-user-123',
          email: 'test@example.com',
          name: 'OAuth User',
          role: 'user',
        },
        tokens: {
          accessToken: 'jwt.token.here',
          refreshToken: 'refresh.token.here',
          expiresIn: 900,
        },
      };

      // Mock both the initial mount session check (returns 401) and the login call
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Not authenticated' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockApiResponse,
        });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial session check to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'oauth-token');
      });

      expect(loginResult).toBe(true);
      expect(result.current.user?.email).toBe('test@example.com');
      expect(result.current.error).toBeNull();
    });

    it('should fail with network error and require OAuth', async () => {
      // Mock initial session check (401), then network error for login
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Not authenticated' }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial session check to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'password');
      });

      expect(loginResult).toBe(false);
      expect(result.current.error).toContain('OAuth login');
      expect(result.current.user).toBeNull();
    });

    it('should fail with backend error and require OAuth', async () => {
      // Mock initial session check (401), then another 401 for login attempt
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Not authenticated' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Invalid credentials' }),
        });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for initial session check to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let loginResult;
      await act(async () => {
        loginResult = await result.current.login('test@example.com', 'wrongpassword');
      });

      expect(loginResult).toBe(false);
      expect(result.current.error).toContain('OAuth login');
      expect(result.current.user).toBeNull();
    });
  });

  describe('Logout', () => {
    it('should call backend logout endpoint', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Mock logout API call
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      delete (window as any).location;
      window.location = { href: '' } as any;

      await act(async () => {
        result.current.logout();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      );

      // Should redirect to home page
      expect(window.location.href).toBe('/');
    });
  });

  describe('Session Check on Mount - OAuth Session Based', () => {
    it('should always check for OAuth session on mount', async () => {
      // OAuth flow: Backend manages oauth_session cookie, frontend always checks
      const mockApiResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['user'],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for session check to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/me'),
          expect.objectContaining({
            method: 'GET',
            credentials: 'include',
          }),
        );
        expect(result.current.user).not.toBeNull();
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle no active session gracefully (401)', async () => {
      // When no OAuth session exists, backend returns 401
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Not authenticated' }),
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for session check to complete
      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isLoading).toBe(false);
      });
      
      // Should NOT try to remove cookies (backend manages oauth_session)
      expect(Cookies.remove).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      // Network error during session check
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for session check to complete
      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
