import { MCPClient, createMCPClient } from '../libs/mcp-client';
import { RepoGovernor } from './repo-governor.js';

interface GitHubAgentConfig {
  mcpEndpoint: string;
  environment: 'dev' | 'staging' | 'production';
  agentToken: string;
  capabilities: string[];
}

export class GitHubAgentMCP {
  private mcp: MCPClient;

  constructor(config: GitHubAgentConfig) {
    this.mcp = createMCPClient({
      endpoint: config.mcpEndpoint,
      token: config.agentToken,
      environment: config.environment,
    });
  }

  // Initialize agent with MCP capabilities

  async initialize(): Promise<boolean> {
    try {
      await this.mcp.connect();

      const response = await this.mcp.registerCapabilities([
        'repo_guidance',
        'policy_validation',
      ]);

      if (!response.success) {
        throw new Error(`Failed to register capabilities: ${response.error}`);
      }

      console.log('✅ GitHub Agent connected to MCP server');
      return true;
    } catch (error) {
      console.warn(
        '⚠️  Unable to connect to MCP server. Proceeding in offline mode:',
        (error as Error).message
      );
      return false;
    }
  }

  async getRepoSummary(): Promise<{
    architectureDocs: string[];
    tsconfigIssues: Array<{ file: string; issues: string[] }>;
    commonJsModules: Array<{ file: string; issues: string[] }>;
  }> {
    const governor = new RepoGovernor();
    const [docs, tsIssues, cjs] = await Promise.all([
      governor.listArchitectureDocs(),
      governor.validateTsConfigs(),
      governor.detectCommonJs(),
    ]);
    return {
      architectureDocs: docs,
      tsconfigIssues: tsIssues,
      commonJsModules: cjs,
    };
  }

  async getDocContent(path: string): Promise<string> {
    const governor = new RepoGovernor();
    return governor.readDoc(path);
  }
}

// Factory function for GitHub Agent
export function createGitHubAgent(
  config?: Partial<GitHubAgentConfig>
): GitHubAgentMCP {
  const defaultConfig: GitHubAgentConfig = {
    mcpEndpoint: process.env.MCP_ENDPOINT || 'http://localhost:3020',
    environment: (process.env.NODE_ENV as any) || 'dev',
    agentToken: process.env.MCP_AGENT_TOKEN || '',
    capabilities: ['repo_guidance', 'policy_validation'],
  };

  return new GitHubAgentMCP({ ...defaultConfig, ...config });
}
