// MCP Client TypeScript Integration
interface MCPClientConfig {
  endpoint: string;
  token: string;
  environment: 'dev' | 'staging' | 'production';
}

interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime?: number;
}

export class MCPClient {
  private endpoint: string;
  private token: string;
  private environment: string;

  constructor(config: MCPClientConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.token = config.token;
    this.environment = config.environment;
  }

  async connect(): Promise<void> {
    // Test connection to MCP server
    const response = await this.healthCheck();
    if (!response.success) {
      throw new Error(`Failed to connect to MCP server: ${response.error}`);
    }
  }

  async healthCheck(): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json() as { message?: string };

      return {
        success: response.ok,
        data,
        error: response.ok ? undefined : data.message || 'Health check failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async registerCapabilities(capabilities: string[]): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.endpoint}/api/agent/capabilities`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ capabilities }),
      });

      const data = await response.json() as { message?: string };

      return {
        success: response.ok,
        data,
        error: response.ok
          ? undefined
          : data.message || 'Failed to register capabilities',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async call(tool: string, parameters: any): Promise<MCPResponse> {
    try {
      const response = await fetch(`${this.endpoint}/api/tools/call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tool, parameters }),
      });

      const data = await response.json() as { message?: string };

      return {
        success: response.ok,
        data,
        error: response.ok ? undefined : data.message || 'Tool call failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // CI-specific methods
  async analyzeCIWorkflow(workflow: any): Promise<MCPResponse<string[]>> {
    return this.call('analyze_ci_workflow', { workflow });
  }

  async generateCIFix(
    issue: string,
    context?: string
  ): Promise<MCPResponse<string>> {
    return this.call('generate_ci_fix', {
      issue_description: issue,
      context: context || 'enterprise_ci_pipeline',
    });
  }

  async optimizeWorkflow(
    workflowContent: string
  ): Promise<MCPResponse<string>> {
    return this.call('optimize_workflow', { workflow: workflowContent });
  }

  async fixTypescriptErrors(
    errors: string[],
    projectPath: string
  ): Promise<MCPResponse<{ fixes: string[]; script: string }>> {
    return this.call('fix_typescript_errors', { errors, projectPath });
  }

  async resolveDependencies(
    missingPackages: string[],
    projectPath: string
  ): Promise<MCPResponse<{ fixes: string[]; script: string }>> {
    return this.call('resolve_dependencies', { missingPackages, projectPath });
  }

  async fixSecurityIssues(
    vulnerabilities: any[],
    projectPath: string
  ): Promise<MCPResponse<{ fixes: string[]; script: string }>> {
    return this.call('fix_security_issues', { vulnerabilities, projectPath });
  }
}

// Factory function
export function createMCPClient(config?: Partial<MCPClientConfig>): MCPClient {
  const defaultConfig: MCPClientConfig = {
    endpoint: process.env.MCP_ENDPOINT || 'http://localhost:3020',
    token: process.env.MCP_AGENT_TOKEN || '',
    environment: (process.env.NODE_ENV as any) || 'dev',
  };

  return new MCPClient({ ...defaultConfig, ...config });
}
