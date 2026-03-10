import Cookies from 'js-cookie';
import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { config as configService } from '../services/config';
import { logger } from '../services/logger';
// ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry Integration (2025-11-30)
import { setSentryUser, clearSentryUser } from '../services/sentry.service';

/**
 * User interface matching backend API
 * Represents an authenticated user in the system
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  // Legacy properties for backwards compatibility
  name?: string;
  full_name?: string;
  role?: string;
  // Speckle integration - OAuth access token for API calls
  accessToken?: string;
  // Phase 1: Platform admin flag from backend (@luh.tech domain auto-admin)
  is_platform_admin?: boolean;
}

/**
 * Authentication context providing OAuth-based authentication
 * Supports Google and GitHub OAuth providers
 */
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithOAuth: (provider?: string) => void;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start as true while checking session
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ROOT CAUSE #86 FIX: Absolute failsafe timeout to prevent infinite loading
    // If API is completely down (no response after 30s), force isLoading=false
    // This ensures Login component always renders, even if backend is unavailable
    const absoluteFailsafe = setTimeout(() => {
      logger.error('Auth check absolute timeout (30s) - forcing isLoading=false', {
        reason: 'API did not respond within failsafe window',
        impact: 'User will see login page instead of infinite loading',
      });
      setIsLoading(false);
    }, 30000); // 30 seconds absolute maximum

    // Check for existing session on mount
    const checkSession = async (retryCount = 0) => {
      // Add flag to track if this is OAuth callback
      // Note: window.location.search can be undefined in test environments
      const isCallback =
        window.location.pathname === '/dashboard' ||
        (window.location.search?.includes('code=') ?? false);

      try {
        // CRITICAL FIX: Always check for OAuth session with backend
        // Backend manages oauth_session cookie, frontend just validates it
        const API_URL = configService.apiBaseUrl;

        // Increased timeout for OAuth callbacks to allow cookie propagation
        // OAuth redirect from :4000 → :3000 needs time for browser to send cookies
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), isCallback ? 15000 : 10000);

        const response = await fetch(`${API_URL}/api/auth/me`, {
          method: 'GET',
          credentials: 'include', // CRITICAL: Include cookies for session (oauth_session cookie)
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            // Map backend user format to frontend User interface
            const user: User = {
              id: data.user.id,
              email: data.user.email,
              firstName: data.user.full_name?.split(' ')[0] || data.user.email.split('@')[0],
              lastName: data.user.full_name?.split(' ')[1] || '',
              isActive: true,
              roles: Array.isArray(data.user.roles) ? data.user.roles : [data.user.role || 'user'],
              name: data.user.full_name,
              full_name: data.user.full_name,
              role:
                (Array.isArray(data.user.roles) ? data.user.roles[0] : data.user.role) || 'user',
              is_platform_admin: data.user.is_platform_admin || false, // Phase 1: Platform admin flag
            };

            setUser(user);
            clearTimeout(absoluteFailsafe); // Clear failsafe - auth succeeded
            setIsLoading(false); // CRITICAL FIX: Clear loading state on successful auth

            // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry user context (2025-11-30)
            setSentryUser({
              id: user.id,
              email: user.email,
              name: user.name || user.full_name,
              role: user.role,
            });

            logger.debug('Session restored from backend', {
              userId: user.id,
              email: user.email,
              isOAuthCallback: isCallback,
            });

            // CRITICAL: If this was OAuth callback, ensure redirect completes
            // Note: Using replaceState instead of pushState to avoid back button issues
            // App doesn't use React Router, so direct history manipulation is appropriate
            if (isCallback && window.location.pathname !== '/dashboard') {
              logger.debug('OAuth callback detected, ensuring dashboard redirect');
              window.history.replaceState({}, '', '/dashboard');
            }
          }
        } else {
          // Session check failed (likely 401), user not authenticated
          if (response.status === 401) {
            logger.debug('No active session found', { retryCount });

            // If OAuth callback failed, retry a few times
            // Cookies might not be immediately available after cross-origin redirect
            if (isCallback && retryCount < 3) {
              const delay = 500 * (retryCount + 1); // 500ms, 1000ms, 1500ms
              logger.debug(`OAuth callback 401, retrying in ${delay}ms`, { retryCount });
              setTimeout(() => checkSession(retryCount + 1), delay);
              return; // Don't set loading to false yet
            } else if (isCallback) {
              logger.error('OAuth callback resulted in 401 after retries - authentication failed', {
                retryCount,
              });
            }
          } else {
            logger.debug(`Session check failed with status: ${response.status}`);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          logger.error('Session check timed out', { isCallback, retryCount });
        } else {
          logger.error('Failed to check session', error as Error);
        }
        // On network error, don't clear anything - the backend might just be temporarily unavailable
      } finally {
        // Only set loading to false if not retrying
        if (!isCallback || retryCount >= 3) {
          clearTimeout(absoluteFailsafe); // Clear failsafe - we got a response
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Cleanup function: clear failsafe timeout if component unmounts
    return () => clearTimeout(absoluteFailsafe);
  }, []);

  /**
   * Validate authentication token with backend
   * Note: This function is for JWT token validation (legacy, not used in OAuth flow)
   * @param token - JWT token to validate
   */
  const validateToken = async (token: string) => {
    try {
      logger.debug('Validating token with backend');

      const API_URL = configService.apiBaseUrl;
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        logger.debug('Token validation successful');

        if (data.user) {
          const user: User = {
            id: data.user.id,
            email: data.user.email,
            firstName:
              data.user.firstName ||
              data.user.first_name ||
              data.user.full_name?.split(' ')[0] ||
              data.user.email.split('@')[0],
            lastName:
              data.user.lastName || data.user.last_name || data.user.full_name?.split(' ')[1] || '',
            isActive: data.user.isActive !== false,
            roles: Array.isArray(data.user.roles) ? data.user.roles : [data.user.role || 'user'],
            createdAt: data.user.createdAt ? new Date(data.user.createdAt) : new Date(),
            updatedAt: data.user.updatedAt ? new Date(data.user.updatedAt) : new Date(),
            // Legacy properties for backwards compatibility
            name:
              data.user.full_name ||
              `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
            full_name:
              data.user.full_name ||
              `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
            role: data.user.role || 'user',
          };
          setUser(user);

          // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry user context (2025-11-30)
          setSentryUser({
            id: user.id,
            email: user.email,
            name: user.name || user.full_name,
            role: user.role,
          });
        }
      } else {
        logger.debug('Token validation failed');
      }
    } catch (error) {
      logger.error('Token validation failed', error as Error);
    }
  };

  /**
   * Wait for backend service to become available
   * @param url - Service URL to check
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise<boolean> - True if service is available
   */
  const waitForService = async (url: string, timeout = 30000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = await fetch(`${url}/health`, { method: 'GET' });
        if (res.ok) {
          return true;
        }
      } catch (error) {
        // Service not available yet, continue waiting
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    return false;
  };

  /**
   * Login with email and password (backend authentication)
   * Note: OAuth login is the recommended authentication method
   * @param email - User email address
   * @param password - User password
   * @returns Promise<boolean> - True if login successful
   */
  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      logger.debug('Attempting login', { email });

      // Environment-aware API URL from ConfigurationService
      const API_URL = configService.apiBaseUrl;

      // Call the backend API with retry logic
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      logger.debug('Login API response', {
        status: response.status,
        ok: response.ok,
        url: response.url,
        hasUser: !!data?.user,
        hasTokens: !!data?.tokens,
        errorType: data?.error || data?.message || 'none',
      });

      // Handle successful authentication - check both response.ok and data structure
      if (response.ok && data.user && data.tokens) {
        // Successfully authenticated with backend
        const user: User = {
          id: data.user.id,
          email: data.user.email,
          firstName:
            data.user.firstName ||
            data.user.first_name ||
            data.user.full_name?.split(' ')[0] ||
            data.user.email.split('@')[0],
          lastName:
            data.user.lastName || data.user.last_name || data.user.full_name?.split(' ')[1] || '',
          isActive: data.user.isActive !== false,
          roles: Array.isArray(data.user.roles) ? data.user.roles : [data.user.role || 'user'],
          createdAt: data.user.createdAt ? new Date(data.user.createdAt) : new Date(),
          updatedAt: data.user.updatedAt ? new Date(data.user.updatedAt) : new Date(),
          // Legacy properties for backwards compatibility
          name:
            data.user.full_name ||
            `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
          full_name:
            data.user.full_name ||
            `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
          role: data.user.role || 'user',
        };

        setUser(user);

        // ENTERPRISE SECURITY: Phase 1 Priority 3 - Sentry user context (2025-11-30)
        setSentryUser({
          id: user.id,
          email: user.email,
          name: user.name || user.full_name,
          role: user.role,
        });

        // Store the actual JWT token from backend
        Cookies.set('authToken', data.tokens.accessToken, {
          secure: true,
          sameSite: 'strict',
          expires: data.tokens.expiresIn
            ? new Date(Date.now() + data.tokens.expiresIn * 1000)
            : undefined,
        });

        logger.info('Login successful', { userId: user.id, email: user.email });
        return true;
      } else {
        // Backend authentication failed, categorize the error type
        const isNetworkError = response.status === 0 || response.status >= 500;
        const isAuthError = response.status === 401 || response.status === 403;
        const isClientError = response.status >= 400 && response.status < 500;

        logger.debug('Backend login failed', {
          responseOk: response.ok,
          responseStatus: response.status,
          errorCategory: isNetworkError
            ? 'network'
            : isAuthError
              ? 'authentication'
              : isClientError
                ? 'client'
                : 'unknown',
          hasUser: !!data?.user,
          hasTokens: !!data?.tokens,
          errorMessage: data?.error || data?.message || 'No error message provided',
        });

        // OAuth authentication is required for security
        const baseErrorMessage = data?.message || data?.error || 'Authentication failed';
        const errorMessage = isNetworkError
          ? 'Login service temporarily unavailable. Please use OAuth login instead.'
          : isAuthError
            ? 'Invalid credentials. Please use OAuth login.'
            : 'Authentication failed. Please use OAuth login.';

        setError(errorMessage);
        logger.error('Login failed', {
          errorMessage,
          originalError: baseErrorMessage,
          category: isNetworkError ? 'network' : isAuthError ? 'authentication' : 'client',
        });
        return false;
      }
    } catch (error) {
      // Categorize the network error for better handling
      const isTimeoutError =
        error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('ECONNABORTED') ||
          error.message.includes('network timeout'));
      const isConnectivityError =
        error instanceof Error &&
        (error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED'));

      // Network error - OAuth authentication required
      const errorMessage = isTimeoutError
        ? 'Login request timed out. Please try OAuth login instead.'
        : isConnectivityError
          ? 'Cannot connect to login service. Please try OAuth login.'
          : 'Login failed. Please use OAuth login instead.';

      setError(errorMessage);
      logger.error('Login network error - OAuth login required', {
        email,
        errorType: isTimeoutError ? 'timeout' : isConnectivityError ? 'connectivity' : 'general',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Initiate OAuth authentication flow
   * Redirects user to OAuth provider (Google or GitHub)
   * @param provider - OAuth provider name (default: 'google')
   */
  const loginWithOAuth = (provider: string = 'google') => {
    // Redirect to OAuth login endpoint
    const API_URL = configService.apiBaseUrl;

    // Store current location for redirect after auth (optional)
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== '/' && currentUrl !== '/auth/callback') {
      sessionStorage.setItem('oauth_redirect', currentUrl);
    }

    // Redirect to OAuth provider via API Gateway
    // The API Gateway will handle the OAuth flow and redirect back to /dashboard
    logger.info('Initiating OAuth flow', { provider });
    window.location.href = `${API_URL}/api/auth/${provider}`;
  };

  /**
   * Logout user and clear authentication state
   * Calls backend logout endpoint and redirects to home
   */
  const logout = () => {
    // Call backend logout endpoint
    const API_URL = configService.apiBaseUrl;

    fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include', // Include session cookies (oauth_session)
    }).finally(() => {
      // Clear local state regardless of API call result
      // Backend clears oauth_session cookie on successful logout
      setUser(null);

      // ENTERPRISE SECURITY: Phase 1 Priority 3 - Clear Sentry user context (2025-11-30)
      clearSentryUser();

      logger.info('User logged out');

      // Redirect to home page
      window.location.href = '/';
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithOAuth, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook for authentication
 * Must be used within an AuthProvider
 * @returns AuthContextType - Authentication context with user state and auth methods
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context as AuthContextType;
};
