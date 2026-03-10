/**
 * API Gateway Configuration for MCP Server
 * Supports Docker container networking and local development
 */

/**
 * Get the API Gateway host based on environment
 * - In Docker/production: Use service name 'ectropy-api' for container networking
 * - In development: Use 'localhost' for local testing
 * - Can be overridden with API_GATEWAY_HOST environment variable
 *
 * ENTERPRISE PATTERN: Read dynamically for runtime configuration support
 */
const getHost = (): string => {
  const host = process.env.API_GATEWAY_HOST;
  if (host) {
    return host;
  }

  // ENTERPRISE: Support all deployment environments
  const env = process.env.NODE_ENV as string;
  const isProductionLike = env === 'production' || env === 'staging';
  return isProductionLike ? 'ectropy-api' : 'localhost';
};

/**
 * Get the API Gateway port
 * Defaults to 4000, can be overridden with API_GATEWAY_PORT environment variable
 */
const getPort = (): string => process.env.API_GATEWAY_PORT || '4000';

/**
 * Complete API Gateway URL for making HTTP requests
 * Constructed from host and port for consistency
 */
const getUrl = (): string => `http://${getHost()}:${getPort()}`;

// Legacy exports for backwards compatibility (read at module load time)
export const API_GATEWAY_HOST = getHost();
export const API_GATEWAY_PORT = getPort();
export const API_GATEWAY_URL = getUrl();

/**
 * Configuration object for API Gateway connection settings
 */
export interface ApiGatewayConfig {
  host: string;
  port: string;
  url: string;
  timeout: number;
}

/**
 * Get complete API Gateway configuration
 * ENTERPRISE PATTERN: Always reads current environment values for runtime flexibility
 */
export const getApiGatewayConfig = (): ApiGatewayConfig => {
  return {
    host: getHost(),
    port: getPort(),
    url: getUrl(),
    timeout: parseInt(process.env.API_GATEWAY_TIMEOUT || '5000', 10),
  };
};

/**
 * Validate API Gateway configuration
 */
export const validateApiGatewayConfig = (
  config: ApiGatewayConfig
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!config.host) {
    errors.push('API Gateway host is required');
  }

  if (!config.port) {
    errors.push('API Gateway port is required');
  }

  const port = parseInt(config.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('API Gateway port must be a valid number between 1 and 65535');
  }

  if (config.timeout < 0) {
    errors.push('API Gateway timeout must be non-negative');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
