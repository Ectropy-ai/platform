/**
 * Enterprise Configuration Management
 * Centralized configuration with environment detection and fallbacks
 *
 * URL Structure:
 * - apiBaseUrl: Base URL (e.g., https://staging.ectropy.ai)
 *   - OAuth routes: {apiBaseUrl}/api/auth/* (e.g., /api/auth/google)
 *   - API routes: {apiBaseUrl}/api/* (e.g., /api/v1/projects)
 *   - Health checks: {apiBaseUrl}/api/health
 *
 * - speckleServerUrl: MCP server URL (e.g., https://staging.ectropy.ai/mcp)
 *
 * Nginx Routing (configured in nginx.conf):
 * - /api -> API Gateway endpoints (includes /api/auth/* for OAuth)
 * - /mcp -> MCP Server endpoints
 * - / -> Web Dashboard (React app)
 */

interface EnvironmentConfig {
  apiBaseUrl: string;
  speckleServerUrl: string;
  speckleFrontendUrl: string;
  speckleApiUrl: string; // ENTERPRISE FIX: Speckle Server API (port 3333) for viewer object loading
  websocketUrl: string;
  enableSpeckle: boolean;
  enableWebSockets: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  retryAttempts: number;
  timeoutMs: number;
}

interface ServiceEndpoints {
  auth: string;
  projects: string;
  elements: string;
  files: string;
  health: string;
}

class ConfigurationService {
  private static instance: ConfigurationService;
  private config: EnvironmentConfig;
  private serviceEndpoints: ServiceEndpoints;

  private constructor() {
    this.config = this.loadConfiguration();
    this.serviceEndpoints = this.buildEndpoints();
    this.validateConfiguration();
  }

  public static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  private loadConfiguration(): EnvironmentConfig {
    const isDevelopment = process.env.NODE_ENV === 'development';
    // const isProduction = process.env.NODE_ENV === 'production';
    // Detect environment from URL for Codespaces/Cloud environments
    const hostname = (typeof window !== 'undefined' && window?.location?.hostname) || 'localhost';
    const isCodespaces = hostname.includes('github.dev') || hostname.includes('githubpreview.dev');
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    // Base configuration with intelligent defaults
    const baseConfig: EnvironmentConfig = {
      apiBaseUrl: this.determineApiUrl(hostname, isCodespaces, isLocalhost),
      speckleServerUrl: this.determineSpeckleUrl(hostname, isCodespaces, isLocalhost),
      speckleFrontendUrl: this.determineSpeckleFrontendUrl(hostname, isCodespaces, isLocalhost),
      speckleApiUrl: this.determineSpeckleApiUrl(hostname, isCodespaces, isLocalhost),
      websocketUrl: this.determineWebSocketUrl(),
      enableSpeckle: true,
      enableWebSockets: false, // Disabled by default for reliability
      logLevel: isDevelopment ? 'debug' : 'info',
      retryAttempts: 3,
      timeoutMs: 10000,
    };
    // Override with environment variables if available
    // Note: REACT_APP_SPECKLE_FRONTEND_PORT is used in determineSpeckleFrontendUrl(), not here
    return {
      ...baseConfig,
      apiBaseUrl: process.env['REACT_APP_API_URL'] || baseConfig.apiBaseUrl,
      speckleServerUrl: baseConfig.speckleServerUrl, // Auto-determined from environment
      speckleFrontendUrl: baseConfig.speckleFrontendUrl, // Constructed from REACT_APP_SPECKLE_FRONTEND_PORT
      speckleApiUrl: baseConfig.speckleApiUrl, // ENTERPRISE: Speckle Server API (port 3333)
      enableSpeckle: process.env['REACT_APP_ENABLE_SPECKLE'] !== 'false',
      enableWebSockets: process.env['REACT_APP_ENABLE_WEBSOCKETS'] === 'true',
      logLevel: (process.env['REACT_APP_LOG_LEVEL'] as any) || baseConfig.logLevel,
      retryAttempts: parseInt(process.env['REACT_APP_RETRY_ATTEMPTS'] || '3'),
      timeoutMs: parseInt(process.env['REACT_APP_TIMEOUT_MS'] || '10000'),
    };
  }

  private determineApiUrl(hostname: string, isCodespaces: boolean, isLocalhost: boolean): string {
    // Get configuration from environment variables with defaults
    const nginxPort = process.env['REACT_APP_NGINX_PORT'] || '80';
    const stagingDomain = process.env['REACT_APP_STAGING_DOMAIN'] || 'staging.ectropy.ai';

    // ENTERPRISE FIX (2025-12-21): Detect protocol from window.location to prevent CORS issues
    // ROOT CAUSE: Mixed protocol (http origin calling https API) blocked by CORS policy
    // SOLUTION: Use same protocol as page load (window.location.protocol)
    const currentProtocol =
      typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'https';

    // Check for staging environment first
    if (hostname === stagingDomain) {
      // Use current protocol first, then environment variable, then default to https
      const stagingProtocol = process.env['REACT_APP_STAGING_PROTOCOL'] || currentProtocol;
      return `${stagingProtocol}://${stagingDomain}`;
    }
    if (isCodespaces) {
      // GitHub Codespaces environment
      const baseUrl = hostname.replace(/^.*?-/, '').replace(/\.github\.dev.*$/, '');
      const apiGatewayPort = process.env['REACT_APP_API_GATEWAY_PORT'] || '4000';
      return `https://${baseUrl}-${apiGatewayPort}.github.dev`;
    } else if (isLocalhost) {
      // Local development - use Nginx reverse proxy (enterprise architecture)
      // Nginx routes /api/* to api-gateway:4000
      const port = nginxPort === '80' ? '' : `:${nginxPort}`;
      const localProtocol = process.env['REACT_APP_LOCAL_PROTOCOL'] || 'http';
      return `${localProtocol}://localhost${port}`;
    } else {
      // Production or custom deployment - no /api prefix
      // Nginx handles routing for both /auth and /api paths
      const productionProtocol = process.env['REACT_APP_PRODUCTION_PROTOCOL'] || 'https';
      return `${productionProtocol}://${hostname}`;
    }
  }

  private determineSpeckleUrl(
    hostname: string,
    isCodespaces: boolean,
    isLocalhost: boolean,
  ): string {
    // Get configuration from environment variables with defaults
    const nginxPort = process.env['REACT_APP_NGINX_PORT'] || '80';
    const stagingDomain = process.env['REACT_APP_STAGING_DOMAIN'] || 'staging.ectropy.ai';
    // ENTERPRISE FIX (2025-12-09): MCP dual-port architecture requires proper routing
    // PORT 3001: MCP health endpoint at /health (NOT /api/mcp/health)
    // PORT 3002: MCP Express API at /api/mcp/* (ALL agent calls, tools, etc.)
    // SOLUTION: speckleServerUrl includes /api/mcp prefix for Express API
    //           Health checks use apiBaseUrl + '/health' (see line 341 fix)
    const mcpPath = process.env['REACT_APP_MCP_PATH'] || '/api/mcp';

    // ENTERPRISE FIX (2025-12-21): Use same protocol as page load to prevent CORS issues
    const currentProtocol =
      typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'https';

    // Check for staging environment first
    if (hostname === stagingDomain) {
      const stagingProtocol = process.env['REACT_APP_STAGING_PROTOCOL'] || currentProtocol;
      return `${stagingProtocol}://${stagingDomain}${mcpPath}`;
    }
    if (isCodespaces) {
      const mcpPort = process.env['REACT_APP_MCP_PORT'] || '3002';
      const baseUrl = hostname.replace(/^.*?-/, '').replace(/\.github\.dev.*$/, '');
      return `https://${baseUrl}-${mcpPort}.github.dev`;
    } else if (isLocalhost) {
      // Local development - use Nginx reverse proxy (enterprise architecture)
      // Nginx routes /api/mcp/* to mcp-server:3002
      const port = nginxPort === '80' ? '' : `:${nginxPort}`;
      const localProtocol = process.env['REACT_APP_LOCAL_PROTOCOL'] || 'http';
      return `${localProtocol}://localhost${port}${mcpPath}`;
    } else {
      // Production or custom deployment - no port, Nginx handles routing
      const productionProtocol = process.env['REACT_APP_PRODUCTION_PROTOCOL'] || 'https';
      return `${productionProtocol}://${hostname}${mcpPath}`;
    }
  }

  private determineSpeckleFrontendUrl(
    hostname: string,
    isCodespaces: boolean,
    isLocalhost: boolean,
  ): string {
    // Get Speckle Frontend port from environment variable or use default
    const speckleFrontendPort = process.env['REACT_APP_SPECKLE_FRONTEND_PORT'] || '8080';

    if (isCodespaces) {
      const baseUrl = hostname.replace(/^.*?-/, '').replace(/\.github\.dev.*$/, '');
      return `https://${baseUrl}-${speckleFrontendPort}.github.dev`;
    } else if (isLocalhost) {
      return `http://localhost:${speckleFrontendPort}`;
    } else {
      return `https://${hostname}:${speckleFrontendPort}`;
    }
  }

  /**
   * ENTERPRISE FIX (2026-01-11): Determine Speckle Server API URL
   * The @speckle/viewer needs to talk to the Speckle Server (GraphQL + Objects API)
   * NOT the Speckle Frontend (which is just a web UI)
   *
   * SUBDOMAIN DEPLOYMENT (staging/production):
   * - Speckle runs on subdomain: http://speckle.staging.ectropy.ai (nginx routing)
   * - NOT on port: https://staging.ectropy.ai:3333 (doesn't exist)
   *
   * Port mapping (local development only):
   * - 8080 = Speckle Frontend (web UI for users to browse streams)
   * - 3333 = Speckle Server API (GraphQL, Objects API for viewer)
   */
  private determineSpeckleApiUrl(
    hostname: string,
    isCodespaces: boolean,
    isLocalhost: boolean,
  ): string {
    // ENTERPRISE FIX: Check for explicit REACT_APP_SPECKLE_SERVER_URL first
    const explicitUrl = process.env['REACT_APP_SPECKLE_SERVER_URL'];
    if (explicitUrl) {
      return explicitUrl;
    }

    // Get staging domain from environment variable
    const stagingDomain = process.env['REACT_APP_STAGING_DOMAIN'] || 'staging.ectropy.ai';

    // Get Speckle Server API port from environment variable or use default (3333)
    const speckleApiPort = process.env['REACT_APP_SPECKLE_API_PORT'] || '3333';

    // ENTERPRISE FIX (2026-01-11): Detect protocol from window.location to prevent CORS issues
    const currentProtocol =
      typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'https';

    if (isCodespaces) {
      const baseUrl = hostname.replace(/^.*?-/, '').replace(/\.github\.dev.*$/, '');
      return `https://${baseUrl}-${speckleApiPort}.github.dev`;
    } else if (isLocalhost) {
      return `http://localhost:${speckleApiPort}`;
    } else if (hostname === stagingDomain || hostname.includes('staging.ectropy.ai')) {
      // ENTERPRISE FIX (2026-01-11): HTTPS subdomain deployment (production-grade)
      // Cloudflare SSL certificate auto-provisioned for speckle.staging.ectropy.ai
      // Mixed content security: HTTPS page requires HTTPS resources
      const stagingProtocol = process.env['REACT_APP_STAGING_SPECKLE_PROTOCOL'] || 'https';
      return `${stagingProtocol}://${stagingDomain}/speckle`;
    } else {
      // Production deployment - path-based proxy (DO LB does not route subdomains)
      const productionProtocol = process.env['REACT_APP_PRODUCTION_PROTOCOL'] || currentProtocol;
      return `${productionProtocol}://${hostname}/speckle`;
    }
  }

  private determineWebSocketUrl(): string {
    // Get WebSocket port from environment variable or use default (MCP Express API port)
    const wsPort = process.env['REACT_APP_WS_PORT'] || process.env['REACT_APP_MCP_PORT'] || '3002';

    const hostname = window.location.hostname;
    if (hostname.includes('github.dev')) {
      const baseUrl = hostname.replace('.github.dev', '');
      return `wss://${baseUrl}-${wsPort}.github.dev`;
    } else if (hostname === 'localhost') {
      return `ws://localhost:${wsPort}`;
    } else {
      // Production - use main domain with Nginx routing
      return `wss://${hostname}`;
    }
  }

  /**
   * Build service endpoints
   */
  private buildEndpoints(): ServiceEndpoints {
    return {
      auth: '/api/auth',
      projects: '/api/v1/projects',
      elements: '/api/v1/elements',
      files: '/files',
      health: '/api/auth/health', // OAuth health endpoint
    };
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    const requiredFields = ['apiBaseUrl', 'speckleServerUrl'];
    const missingFields = requiredFields.filter(
      field => !this.config[field as keyof EnvironmentConfig],
    );

    if (missingFields.length > 0) {
    }

    // Configuration validated successfully
  }

  // Public getters
  public get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  public get speckleServerUrl(): string {
    return this.config.speckleServerUrl;
  }

  public get speckleFrontendUrl(): string {
    return this.config.speckleFrontendUrl;
  }

  public get speckleApiUrl(): string {
    return this.config.speckleApiUrl;
  }

  /**
   * Demo Speckle stream ID for viewer testing
   */
  public get demoSpeckleStreamId(): string | undefined {
    return process.env['REACT_APP_DEMO_SPECKLE_STREAM_ID'];
  }

  /**
   * Demo Speckle object ID for viewer testing
   */
  public get demoSpeckleObjectId(): string | undefined {
    return process.env['REACT_APP_DEMO_SPECKLE_OBJECT_ID'];
  }

  public get websocketUrl(): string {
    return this.config.websocketUrl;
  }

  public get enableSpeckle(): boolean {
    return this.config.enableSpeckle;
  }

  public get enableWebSockets(): boolean {
    return this.config.enableWebSockets;
  }

  public get logLevel(): string {
    return this.config.logLevel;
  }

  public get retryAttempts(): number {
    return this.config.retryAttempts;
  }

  public get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  public get endpoints(): ServiceEndpoints {
    return this.serviceEndpoints;
  }

  // Utility methods
  public getFullUrl(endpoint: keyof ServiceEndpoints): string {
    return `${this.apiBaseUrl}${this.serviceEndpoints[endpoint]}`;
  }

  public isFeatureEnabled(feature: 'speckle' | 'websockets'): boolean {
    switch (feature) {
      case 'speckle':
        return this.enableSpeckle;
      case 'websockets':
        return this.enableWebSockets;
      default:
        return false;
    }
  }

  // Health check for all services
  public async performHealthCheck(): Promise<{
    api: boolean;
    speckle: boolean;
    overall: boolean;
  }> {
    const results = {
      api: false,
      speckle: false,
      overall: false,
    };

    try {
      // Test API connectivity
      const apiResponse = await fetch(`${this.apiBaseUrl}/api/health`, {
        method: 'GET',
        timeout: 5000,
      } as any);
      results.api = apiResponse.ok;
    } catch (_error) {}

    try {
      // ENTERPRISE FIX (2025-12-09): MCP health endpoint at /health (port 3001), NOT /api/mcp/health
      // MCP dual-port architecture: 3001=stdio/health, 3002=Express API (/api/mcp/*)
      // speckleServerUrl includes /api/mcp prefix (for Express API calls), but health is at root
      const speckleResponse = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      } as any);
      results.speckle = speckleResponse.ok;
    } catch (_error) {}

    results.overall = results.api; // At minimum, API must be available
    return results;
  }
}
// Export singleton instance
export const config = ConfigurationService.getInstance();
export default ConfigurationService;
