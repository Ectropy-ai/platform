/**
 * EventEmitter Configuration for Ectropy Platform
 * Addresses potential memory leak warnings by setting appropriate limits
 */

import { EventEmitter } from 'events';

/**
 * Configure EventEmitter default max listeners to handle multiple signal handlers
 * across different modules and services in the platform.
 *
 * Default is 10, but Ectropy uses multiple modules that each add SIGTERM/SIGINT listeners:
 * - API Gateway main.ts
 * - Enhanced API server
 * - Staging servers
 * - GitHub automation scripts
 * - Process management utilities
 * - Database connections
 * - Redis connections
 * - Graceful shutdown handlers
 *
 * Setting to 20 provides adequate headroom for enterprise deployment scenarios.
 */
EventEmitter.defaultMaxListeners = 20;

/**
 * Helper function to configure EventEmitter instances with appropriate limits
 * for Ectropy platform services
 */
export function configureEventEmitter(emitter, maxListeners = 20) {
  emitter.setMaxListeners(maxListeners);
  return emitter;
}

/**
 * Helper function for process-level event listener management
 * Ensures process event listeners are properly managed to avoid leaks
 */
export function addProcessListener(event, listener, description) {
  // Log listener addition for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `🔧 Adding process listener: ${event}${description ? ` (${description})` : ''}`
    );
  }

  process.on(event, listener);
}

/**
 * Enterprise-grade process signal handler setup
 * Consolidates common signal handling patterns used throughout the platform
 */
export function setupProcessSignalHandlers(
  gracefulShutdown,
  serviceName = 'Ectropy Service'
) {
  const shutdownHandler = async (signal) => {
    console.log(
      `🛑 ${serviceName} received ${signal}, starting graceful shutdown...`
    );
    await gracefulShutdown(signal);
  };

  // Use the helper to add listeners
  addProcessListener(
    'SIGTERM',
    () => shutdownHandler('SIGTERM'),
    `${serviceName} SIGTERM handler`
  );
  addProcessListener(
    'SIGINT',
    () => shutdownHandler('SIGINT'),
    `${serviceName} SIGINT handler`
  );

  // Handle uncaught exceptions and unhandled rejections
  addProcessListener(
    'uncaughtException',
    (error) => {
      console.error(`💥 ${serviceName} uncaught exception:`, error);
      process.exit(1);
    },
    `${serviceName} uncaught exception handler`
  );

  addProcessListener(
    'unhandledRejection',
    (reason, promise) => {
      console.error(
        `💥 ${serviceName} unhandled rejection at:`,
        promise,
        'reason:',
        reason
      );
      process.exit(1);
    },
    `${serviceName} unhandled rejection handler`
  );
}

export { EventEmitter };
