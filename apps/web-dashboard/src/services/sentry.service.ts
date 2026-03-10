/**
 * =============================================================================
 * ENTERPRISE SENTRY ERROR TRACKING SERVICE
 *
 * PURPOSE: Centralized error monitoring and performance tracking
 * ENTERPRISE PATTERN: Environment-aware configuration with privacy controls
 *
 * FEATURES:
 * - Automatic error capturing and reporting
 * - Performance monitoring (Core Web Vitals)
 * - User context tracking (privacy-safe)
 * - Release versioning and source maps
 * - Environment-specific sampling
 * - PII scrubbing and data protection
 *
 * COMPLIANCE: GDPR-compliant (PII redaction), SOC2-aligned
 * DEPLOYMENT: Phase 1 Priority 3 - Client-side Error Tracking (2025-11-30)
 * =============================================================================
 */

import * as Sentry from '@sentry/react';
import type { BrowserOptions } from '@sentry/react';

/**
 * Sentry configuration interface
 */
interface SentryConfig {
  /** Sentry DSN (Data Source Name) */
  dsn: string;
  /** Application environment (development, staging, production) */
  environment: string;
  /** Application release version */
  release?: string;
  /** Sample rate for error tracking (0.0 to 1.0) */
  sampleRate: number;
  /** Sample rate for performance monitoring (0.0 to 1.0) */
  tracesSampleRate: number;
  /** Enable in current environment */
  enabled: boolean;
}

/**
 * Get Sentry configuration from environment variables
 */
function getSentryConfig(): SentryConfig {
  const environment = process.env.REACT_APP_ENVIRONMENT || process.env.NODE_ENV || 'development';

  // Get Sentry DSN from environment (required for production)
  const dsn = process.env.REACT_APP_SENTRY_DSN || '';

  // Determine if Sentry should be enabled
  // ENTERPRISE DECISION: Only enable in staging/production with valid DSN
  const enabled = environment !== 'development' && dsn.length > 0;

  // Environment-specific sampling rates
  const sampleRates = {
    development: { errors: 1.0, traces: 0.0 }, // All errors, no performance tracking
    staging: { errors: 1.0, traces: 0.5 }, // All errors, 50% performance sampling
    production: { errors: 1.0, traces: 0.1 }, // All errors, 10% performance sampling
  };

  const rates = sampleRates[environment as keyof typeof sampleRates] || sampleRates.production;

  return {
    dsn,
    environment,
    release: process.env.REACT_APP_VERSION || 'unknown',
    sampleRate: rates.errors,
    tracesSampleRate: rates.traces,
    enabled,
  };
}

/**
 * Initialize Sentry SDK
 * Call this once at application startup
 */
export function initializeSentry(): void {
  const config = getSentryConfig();

  // Skip initialization if not enabled
  if (!config.enabled) {
    console.info('[Sentry] Disabled in current environment:', config.environment);
    return;
  }

  // Validate DSN
  if (!config.dsn) {
    console.warn('[Sentry] Missing DSN - error tracking disabled');
    return;
  }

  const sentryConfig: BrowserOptions = {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,

    /**
     * PERFORMANCE MONITORING
     * Tracks Core Web Vitals and custom transactions
     */
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        // Track navigation and routing
        enableInp: true, // Track Interaction to Next Paint (Core Web Vital)
        enableLongAnimationFrame: true, // Track long animation frames
      }),

      // Replay integration for session replay (production only)
      ...(config.environment === 'production'
        ? [
            Sentry.replayIntegration({
              // Session replay configuration
              maskAllText: true, // GDPR: Mask all text content
              blockAllMedia: true, // GDPR: Block all media (images, videos)
              // Note: Sample rates are configured at top-level Sentry.init()
              // via replaysSessionSampleRate and replaysOnErrorSampleRate
            }),
          ]
        : []),
    ],

    /**
     * SAMPLING CONFIGURATION
     */
    sampleRate: config.sampleRate,
    tracesSampleRate: config.tracesSampleRate,

    /**
     * SESSION REPLAY SAMPLING
     * Only for production environment (when replayIntegration is enabled)
     */
    replaysSessionSampleRate: 0.0, // Don't capture normal sessions
    replaysOnErrorSampleRate: 1.0, // Capture 100% of error sessions

    /**
     * PRIVACY AND PII PROTECTION
     * GDPR-compliant data scrubbing
     */
    beforeSend(event, hint) {
      // Scrub sensitive data from error events
      if (event.request) {
        // Remove sensitive headers
        if (event.request.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['X-API-Key'];
        }

        // Remove query parameters that might contain tokens
        if (event.request.url) {
          try {
            const url = new URL(event.request.url);
            // Remove sensitive query params
            url.searchParams.delete('token');
            url.searchParams.delete('api_key');
            url.searchParams.delete('apiKey');
            url.searchParams.delete('password');
            event.request.url = url.toString();
          } catch {
            // Invalid URL, keep as-is
          }
        }
      }

      // Allow event to be sent
      return event;
    },

    /**
     * ERROR FILTERING
     * Ignore known non-critical errors
     */
    ignoreErrors: [
      // Browser extension errors
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'atomicFindClose',

      // Network errors (not actionable)
      'Network request failed',
      'NetworkError',
      'Failed to fetch',

      // Third-party script errors
      'Script error.',

      // OAuth redirect errors (expected during auth flow)
      /OAuth.*redirect/i,
    ],

    /**
     * ALLOWED URLS
     * Only track errors from our domains
     */
    allowUrls: [
      /https?:\/\/(www\.)?ectropy\.com/,
      /https?:\/\/(www\.)?ectropy\.io/,
      /https?:\/\/.*\.ectropy\.com/,
      /https?:\/\/localhost/,
      /https?:\/\/127\.0\.0\.1/,
    ],

    /**
     * SOURCE MAPS
     * Enable for production error tracking
     */
    ...(config.environment === 'production' &&
      {
        // Enable source map uploading
        // Source maps will be uploaded during build via Vite plugin
      }),
  };

  // Initialize Sentry
  Sentry.init(sentryConfig);

  console.info('[Sentry] Initialized successfully', {
    environment: config.environment,
    release: config.release,
    sampleRate: config.sampleRate,
    tracesSampleRate: config.tracesSampleRate,
  });
}

/**
 * Set user context for error tracking
 * Call after user authentication
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  name?: string;
  role?: string;
}): void {
  Sentry.setUser({
    id: user.id,
    // GDPR: Only send email if explicitly opted in
    // For now, we don't send email to protect PII
    username: user.name || 'Unknown',
    role: user.role,
  });
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Manually capture an exception
 * Use for errors that don't throw (e.g., promise rejections)
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope(scope => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value as Record<string, unknown>);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Manually capture a message
 * Use for non-error events you want to track
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal' = 'info',
  context?: Record<string, unknown>,
): void {
  if (context) {
    Sentry.withScope(scope => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value as Record<string, unknown>);
      });
      Sentry.captureMessage(message, level);
    });
  } else {
    Sentry.captureMessage(message, level);
  }
}

/**
 * Add breadcrumb for debugging context
 * Breadcrumbs are attached to error events for context
 */
export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Start a performance transaction
 * Use for custom performance tracking
 */
export function startTransaction(name: string, operation: string): Sentry.Span | undefined {
  return Sentry.startSpan({ name, op: operation }, span => span);
}

/**
 * Export Sentry for advanced usage
 */
export { Sentry };
