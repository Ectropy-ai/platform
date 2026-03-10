/**
 * @fileoverview Development environment configuration for Ectropy web dashboard
 * @version 1.0.0
 */

export const environment = {
  production: false,
  development: true,
  apiUrl: process.env['REACT_APP_API_URL'] || 'http://localhost:4000',
  wsUrl: process.env['REACT_APP_WS_URL'] || 'ws://localhost:4000',
  enableLogging: true,
  enableDebugMode: true,
  version: process.env['REACT_APP_VERSION'] || '0.1.0',
};
