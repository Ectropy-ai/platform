import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Represents an MCP tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Request to execute an MCP tool
 */
export interface MCPExecuteRequest {
  tool: string;
  params: Record<string, any>;
}

/**
 * Response from tool execution
 */
export interface MCPExecuteResponse {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Health status response
 */
export interface MCPHealthStatus {
  status: string;
  score?: number;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Configuration options for the MCP client
 */
export interface MCPClientConfig {
  baseURL: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * TypeScript client for Ectropy MCP Server
 * Provides methods to interact with MCP tools and agent framework
 */
export class EctropyMCPClient {
  private client: AxiosInstance;
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'X-API-Key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Add retry interceptor
    this.setupRetryInterceptor();
  }

  /**
   * Setup automatic retry for failed requests
   */
  private setupRetryInterceptor(): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as any;
        
        if (!config || !config.retryCount) {
          config.retryCount = 0;
        }

        if (
          config.retryCount < (this.config.retryAttempts || 3) &&
          error.response?.status &&
          error.response.status >= 500
        ) {
          config.retryCount += 1;
          
          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay)
          );
          
          return this.client.request(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Check MCP server health status
   */
  async health(): Promise<MCPHealthStatus> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Health check failed');
    }
  }

  /**
   * List all available MCP tools
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const response = await this.client.get('/api/tools');
      return response.data.tools || [];
    } catch (error) {
      throw this.handleError(error, 'Failed to list tools');
    }
  }

  /**
   * Execute an MCP tool
   */
  async execute(request: MCPExecuteRequest): Promise<MCPExecuteResponse> {
    try {
      const response = await this.client.post('/api/tools/execute', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Tool execution failed');
    }
  }

  /**
   * Get status of all MCP agents
   */
  async getAgentStatus(): Promise<any> {
    try {
      const response = await this.client.get('/api/mcp/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get agent status');
    }
  }

  /**
   * Analyze a BIM model with specified agents
   */
  async analyzeModel(
    modelId: string,
    agents: string[]
  ): Promise<MCPExecuteResponse> {
    return this.execute({
      tool: 'analyze_model',
      params: { modelId, agents },
    });
  }

  /**
   * Perform semantic search
   */
  async semanticSearch(
    query: string,
    limit?: number
  ): Promise<MCPExecuteResponse> {
    return this.execute({
      tool: 'semantic_search',
      params: { query, limit },
    });
  }

  /**
   * Validate a work plan
   */
  async validateWorkPlan(params: {
    taskDescription: string;
    proposedApproach: string;
    filesImpacted?: string[];
    estimatedComplexity?: 'simple' | 'medium' | 'complex';
    requiresTests?: boolean;
  }): Promise<MCPExecuteResponse> {
    return this.execute({
      tool: 'validate_work_plan',
      params,
    });
  }

  /**
   * Get guidance from MCP agent framework
   */
  async getGuidance(query: string): Promise<MCPExecuteResponse> {
    return this.execute({
      tool: 'get_guidance',
      params: { query },
    });
  }

  /**
   * Validate connection to MCP server
   */
  async validateConnection(): Promise<boolean> {
    try {
      const health = await this.health();
      return (
        health.status === 'healthy' ||
        health.status === 'ok' ||
        (health.score !== undefined && health.score > 50)
      );
    } catch (error) {
      console.error('MCP connection validation failed:', error);
      return false;
    }
  }

  /**
   * Handle errors and provide consistent error messages
   */
  private handleError(error: any, message: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      
      if (status === 401) {
        return new Error(
          `Authentication failed: ${data?.message || 'Invalid API key'}`
        );
      } else if (status === 403) {
        return new Error(
          `Access denied: ${data?.message || 'Insufficient permissions'}`
        );
      } else if (status === 404) {
        return new Error(`Not found: ${data?.message || message}`);
      } else if (status && status >= 500) {
        return new Error(
          `Server error: ${data?.message || 'Internal server error'}`
        );
      }
      
      return new Error(
        `${message}: ${data?.message || error.message}`
      );
    }
    
    return new Error(`${message}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Initialize MCP client from environment variables
 * Expects MCP_URL and MCP_API_KEY to be set
 */
export async function initMCPClient(): Promise<EctropyMCPClient> {
  const mcpURL = process.env.MCP_URL || 'http://143.198.154.94:3002';
  const apiKey = process.env.MCP_API_KEY;

  if (!apiKey) {
    throw new Error(
      'MCP_API_KEY environment variable is required. ' +
        'Set it in your environment or GitHub Secrets.'
    );
  }

  const client = new EctropyMCPClient({
    baseURL: mcpURL,
    apiKey,
  });

  const isValid = await client.validateConnection();
  if (!isValid) {
    throw new Error(
      `Failed to connect to MCP server at ${mcpURL}. ` +
        'Please check the server is running and the API key is valid.'
    );
  }

  return client;
}

/**
 * Create MCP client with custom configuration
 */
export function createMCPClient(config: MCPClientConfig): EctropyMCPClient {
  return new EctropyMCPClient(config);
}
