/**
 * Common Test Helper Utilities
 *
 * Shared utilities for all test layers (unit, integration, E2E, smoke).
 * These helpers provide common functionality used across the test suite.
 */

/**
 * Wait for a condition to be true with retry logic
 *
 * @param condition - Function that returns true when condition is met
 * @param options - Configuration options
 * @returns Promise that resolves when condition is met
 * @throws Error if timeout is reached
 *
 * @example
 * await waitFor(() => user.isActive === true, { timeout: 5000 });
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    timeoutMessage?: string;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100, timeoutMessage = 'Timeout waiting for condition' } = options;

  const startTime = Date.now();

  while (true) {
    const result = await Promise.resolve(condition());

    if (result) {
      return;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`${timeoutMessage} (timeout: ${timeout}ms)`);
    }

    await sleep(interval);
  }
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 *
 * @example
 * await sleep(1000); // Sleep for 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique test ID
 *
 * Useful for creating unique identifiers in tests (emails, usernames, etc.)
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique test ID
 *
 * @example
 * const testEmail = `${generateTestId('user')}@example.com`;
 * // Result: user-1234567890-abc123@example.com
 */
export function generateTestId(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries fail
 *
 * @example
 * const result = await retry(
 *   () => fetch('/api/data'),
 *   { maxAttempts: 3, initialDelay: 100 }
 * );
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        onRetry?.(lastError, attempt);
        await sleep(Math.min(delay, maxDelay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError;
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 *
 * Useful for testing async operations with manual control
 *
 * @returns Deferred object with promise, resolve, and reject
 *
 * @example
 * const deferred = createDeferred<string>();
 * someAsyncOperation().then(deferred.resolve);
 * const result = await deferred.promise;
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Sanitize a string for use in test identifiers
 *
 * Removes special characters and spaces, converts to lowercase
 *
 * @param input - String to sanitize
 * @returns Sanitized string safe for use in identifiers
 *
 * @example
 * const filename = sanitizeForIdentifier('User Profile Test');
 * // Result: user-profile-test
 */
export function sanitizeForIdentifier(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Deep clone an object for test isolation
 *
 * @param obj - Object to clone
 * @returns Deep cloned object
 *
 * @example
 * const original = { user: { name: 'John' } };
 * const cloned = deepClone(original);
 * cloned.user.name = 'Jane';
 * console.log(original.user.name); // Still 'John'
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Mock console methods for testing
 *
 * Useful for suppressing expected console output during tests
 *
 * @returns Object with restore function to restore original console
 *
 * @example
 * const consoleRestore = mockConsole();
 * // Test code that logs to console
 * consoleRestore.restore();
 */
export function mockConsole(): {
  restore: () => void;
  logs: string[];
  errors: string[];
  warns: string[];
} {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(' '));
  };

  console.error = (...args: any[]) => {
    errors.push(args.map(String).join(' '));
  };

  console.warn = (...args: any[]) => {
    warns.push(args.map(String).join(' '));
  };

  return {
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
    logs,
    errors,
    warns,
  };
}

/**
 * Get current test environment
 *
 * @returns Current environment (local, development, staging, production)
 *
 * @example
 * const env = getTestEnvironment();
 * if (env === 'production') {
 *   // Run smoke tests only
 * }
 */
export function getTestEnvironment(): 'local' | 'development' | 'staging' | 'production' {
  const env = process.env.PLAYWRIGHT_ENV || process.env.NODE_ENV || 'local';

  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  if (env === 'development') return 'development';
  return 'local';
}

/**
 * Get base URL for current test environment
 *
 * @returns Base URL for API/Web requests
 *
 * @example
 * const baseURL = getTestBaseURL();
 * const response = await fetch(`${baseURL}/api/health`);
 */
export function getTestBaseURL(): string {
  // Explicit PLAYWRIGHT_BASE_URL takes precedence
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return process.env.PLAYWRIGHT_BASE_URL;
  }

  // BASE_URL fallback
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // Environment-based defaults
  const env = getTestEnvironment();
  const urlMap = {
    local: 'http://localhost:3000',
    development: 'https://dev.ectropy.ai',
    staging: 'https://staging.ectropy.ai',
    production: 'https://ectropy.ai',
  };

  return urlMap[env];
}

/**
 * Check if running in CI environment
 *
 * @returns True if running in CI
 *
 * @example
 * if (isCI()) {
 *   // Use longer timeouts for CI
 * }
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || Boolean(process.env.CI);
}

/**
 * Get appropriate timeout for environment
 *
 * CI environments typically need longer timeouts
 *
 * @param baseTimeout - Base timeout in milliseconds
 * @returns Adjusted timeout for current environment
 *
 * @example
 * const timeout = getEnvironmentTimeout(5000); // 5s locally, 15s in CI
 */
export function getEnvironmentTimeout(baseTimeout: number): number {
  return isCI() ? baseTimeout * 3 : baseTimeout;
}

/**
 * Format test duration in human-readable format
 *
 * @param milliseconds - Duration in milliseconds
 * @returns Human-readable duration string
 *
 * @example
 * console.log(formatDuration(1500)); // "1.5s"
 * console.log(formatDuration(65000)); // "1m 5s"
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
