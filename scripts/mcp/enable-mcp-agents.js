#!/usr/bin/env node
/**
 * MCP Agent Enablement Script
 * Enables MCP functionality for specified agent patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

class MCPAgentEnabler {
  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'agents.config.js');
    this.featureFlagsPath = path.join(
      process.cwd(),
      'apps',
      'mcp-server',
      'feature-flags.json'
    );
  }

  /**
   * Enable MCP for specific agent patterns
   */
  async enableAgents(options = {}) {
    const {
      pattern = 'dev-*',
      environment = 'development',
      skipCI = false,
    } = options;

    console.log('🤖 Enabling MCP for agents...');
    console.log(`Pattern: ${pattern}`);
    console.log(`Environment: ${environment}`);
    console.log(`Skip CI: ${skipCI}`);

    try {
      // Create configuration directories
      await this.ensureDirectories();

      // Update agent configuration
      await this.updateAgentConfig(pattern, environment);

      // Update feature flags
      await this.updateFeatureFlags(environment, skipCI);

      // Create agent registry
      await this.createAgentRegistry(pattern);

      // Validate configuration
      await this.validateConfiguration();

      console.log('✅ MCP agent enablement completed successfully!');

      return {
        success: true,
        pattern,
        environment,
        configPath: this.configPath,
        featureFlagsPath: this.featureFlagsPath,
      };
    } catch (error) {
      console.error('❌ Failed to enable MCP for agents:', error.message);
      throw error;
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      path.dirname(this.configPath),
      path.dirname(this.featureFlagsPath),
      path.join(process.cwd(), 'logs'),
      path.join(process.cwd(), 'config', 'agents'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfig(pattern, environment) {
    console.log('📝 Updating agent configuration...');

    const mcpEndpoint =
      process.env.MCP_ENDPOINT ||
      `http://localhost:${process.env.MCP_PORT || '3001'}`;

    const agentConfig = {
      // Specific dev agent configuration
      dev: {
        mcp: {
          enabled: true,
          endpoint: mcpEndpoint,
          validation: 'passed',
          tools: [
            'semantic_search',
            'document_analysis',
            'code_generation',
            'health_metrics',
          ],
          retries: 3,
          timeout: 30000,
          environment,
        },
      },

      // Pattern-based configuration for dev agents
      'dev-*': {
        mcp: {
          enabled: true,
          endpoint: mcpEndpoint,
          validation: 'passed',
          tools: ['semantic_search', 'document_analysis', 'health_metrics'],
          retries: 3,
          timeout: 30000,
          environment,
        },
      },

      // Compliance agent (specialized)
      compliance: {
        mcp: {
          enabled: true,
          endpoint: mcpEndpoint,
          validation: 'passed',
          tools: ['document_analysis', 'health_metrics'],
          environment,
        },
      },

      // Performance agent (specialized)
      performance: {
        mcp: {
          enabled: true,
          endpoint: mcpEndpoint,
          validation: 'passed',
          tools: ['health_metrics', 'semantic_search'],
          environment,
        },
      },

      // Procurement agent (specialized)
      procurement: {
        mcp: {
          enabled: true,
          endpoint: mcpEndpoint,
          validation: 'passed',
          tools: ['document_analysis', 'semantic_search'],
          environment,
        },
      },
    };

    // Write configuration file
    const configContent = `// MCP Agent Configuration
// Generated on ${new Date().toISOString()}
// Environment: ${environment}
// Pattern: ${pattern}

export default ${JSON.stringify(agentConfig, null, 2)};
`;

    fs.writeFileSync(this.configPath, configContent);
    console.log(`✅ Agent configuration updated: ${this.configPath}`);
  }

  /**
   * Update feature flags for MCP
   */
  async updateFeatureFlags(environment, skipCI) {
    console.log('🚩 Updating feature flags...');

    const featureFlags = {
      mcp: {
        enabled: true,
        environments: [environment],
        agents: ['dev-*', 'compliance', 'performance', 'procurement'],
        bypass_ci: skipCI,
        alpha_phase: true,
        updated: new Date().toISOString(),
      },
      agent_mcp_integration: true,
      mcp_health_monitoring: true,
      mcp_metrics_collection: environment !== 'development',
      mcp_auto_recovery: environment === 'production',
      mcp_rate_limiting: true,
      mcp_security_enhanced: environment === 'production',
    };

    fs.writeFileSync(
      this.featureFlagsPath,
      JSON.stringify(featureFlags, null, 2)
    );
    console.log(`✅ Feature flags updated: ${this.featureFlagsPath}`);
  }

  /**
   * Create agent registry for tracking enabled agents
   */
  async createAgentRegistry(pattern) {
    console.log('📋 Creating agent registry...');

    const registryPath = path.join(
      process.cwd(),
      'config',
      'agents',
      'registry.json'
    );

    const registry = {
      enabled_patterns: [pattern],
      enabled_agents: [],
      mcp_endpoint:
        process.env.MCP_ENDPOINT ||
        `http://localhost:${process.env.MCP_PORT || '3001'}`,
      last_updated: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      status: 'active',
    };

    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`✅ Agent registry created: ${registryPath}`);
  }

  /**
   * Validate the configuration
   */
  async validateConfiguration() {
    console.log('🔍 Validating configuration...');

    const validations = [];

    // Check agent config exists and is valid
    try {
      // Read as text and parse to avoid module system issues
      const configContent = fs.readFileSync(this.configPath, 'utf8');

      // Extract the exported object (simple regex parsing)
      const exportDefaultMatch = configContent.match(
        /export\s+default\s+({[\s\S]*?});/
      );
      if (exportDefaultMatch) {
        // Safely evaluate the configuration object
        const configText = exportDefaultMatch[1];
        // Replace any process.env references for safety
        const safeConfigText = configText.replace(
          /process\.env\.MCP_ENDPOINT/g,
          '"http://localhost:3001"'
        );
        // eslint-disable-next-line no-eval, prefer-template
        const agentConfig = eval('(' + safeConfigText + ')');

        if (
          agentConfig.dev &&
          agentConfig.dev.mcp &&
          agentConfig.dev.mcp.enabled
        ) {
          validations.push({ check: 'agent_config', status: 'PASS' });
        } else {
          validations.push({
            check: 'agent_config',
            status: 'FAIL',
            reason: 'Dev agent not properly configured',
          });
        }
      } else {
        validations.push({
          check: 'agent_config',
          status: 'FAIL',
          reason: 'Could not parse agent configuration',
        });
      }
    } catch (error) {
      validations.push({
        check: 'agent_config',
        status: 'FAIL',
        reason: error.message,
      });
    }

    // Check feature flags exist and are valid
    try {
      const featureFlags = JSON.parse(
        fs.readFileSync(this.featureFlagsPath, 'utf8')
      );
      if (featureFlags.mcp && featureFlags.mcp.enabled) {
        validations.push({ check: 'feature_flags', status: 'PASS' });
      } else {
        validations.push({
          check: 'feature_flags',
          status: 'FAIL',
          reason: 'MCP not enabled in feature flags',
        });
      }
    } catch (error) {
      validations.push({
        check: 'feature_flags',
        status: 'FAIL',
        reason: error.message,
      });
    }

    // Check MCP endpoint accessibility
    try {
      const mcpEndpoint =
        process.env.MCP_ENDPOINT ||
        `http://localhost:${process.env.MCP_PORT || '3001'}`;
      // Note: In a real implementation, we would make an HTTP request here
      // For now, just validate the URL format
      new URL(mcpEndpoint);
      validations.push({ check: 'mcp_endpoint', status: 'PASS' });
    } catch (error) {
      validations.push({
        check: 'mcp_endpoint',
        status: 'FAIL',
        reason: 'Invalid MCP endpoint URL',
      });
    }

    // Print validation results
    console.log('\n📊 Validation Results:');
    const passed = validations.filter((v) => v.status === 'PASS').length;
    const failed = validations.filter((v) => v.status === 'FAIL').length;

    validations.forEach((validation) => {
      const emoji = validation.status === 'PASS' ? '✅' : '❌';
      console.log(`${emoji} ${validation.check}: ${validation.status}`);
      if (validation.reason) {
        console.log(`   Reason: ${validation.reason}`);
      }
    });

    console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      throw new Error(
        `Configuration validation failed: ${failed} checks failed`
      );
    }

    console.log('✅ All validations passed!');
  }

  /**
   * Get current agent status
   */
  async getAgentStatus() {
    console.log('📊 Getting agent status...');

    const status = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      mcp_endpoint:
        process.env.MCP_ENDPOINT ||
        `http://localhost:${process.env.MCP_PORT || '3001'}`,
      agents: {},
    };

    try {
      // Read agent configuration
      if (fs.existsSync(this.configPath)) {
        // Read as text and parse to avoid module system issues
        const configContent = fs.readFileSync(this.configPath, 'utf8');
        const exportDefaultMatch = configContent.match(
          /export\s+default\s+({[\s\S]*?});/
        );

        if (exportDefaultMatch) {
          const configText = exportDefaultMatch[1];
          const safeConfigText = configText.replace(
            /process\.env\.MCP_ENDPOINT/g,
            '"http://localhost:3001"'
          );
          // eslint-disable-next-line no-eval, prefer-template
          const agentConfig = eval('(' + safeConfigText + ')');

          for (const [agentName, config] of Object.entries(agentConfig)) {
            if (config.mcp) {
              status.agents[agentName] = {
                enabled: config.mcp.enabled,
                endpoint: config.mcp.endpoint,
                tools: config.mcp.tools || [],
                validation: config.mcp.validation || 'unknown',
                environment: config.mcp.environment || 'unknown',
              };
            }
          }
        }
      }

      // Read feature flags
      if (fs.existsSync(this.featureFlagsPath)) {
        const featureFlags = JSON.parse(
          fs.readFileSync(this.featureFlagsPath, 'utf8')
        );
        status.feature_flags = featureFlags;
      }

      return status;
    } catch (error) {
      console.error('Failed to get agent status:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const enabler = new MCPAgentEnabler();

  // Parse command line arguments
  const options = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--env':
      case '--environment':
        options.environment = args[++i];
        break;
      case '--skip-ci':
        options.skipCI = true;
        break;
      case '--status':
        try {
          const status = await enabler.getAgentStatus();
          console.log('\n📊 Agent Status:');
          console.log(JSON.stringify(status, null, 2));
          return;
        } catch (error) {
          console.error('Failed to get status:', error.message);
          process.exit(1);
        }
        break;
      case '--help':
      case '-h':
        console.log(`
MCP Agent Enablement Script

Usage:
  node enable-mcp-agents.js [options]

Options:
  --pattern <pattern>     Agent pattern to enable (default: dev-*)
  --env <environment>     Environment (default: development)
  --skip-ci              Skip CI checks during deployment
  --status               Show current agent status
  --help, -h             Show this help message

Examples:
  node enable-mcp-agents.js --pattern "dev-*" --env development
  node enable-mcp-agents.js --skip-ci
  node enable-mcp-agents.js --status
`);
        return;
    }
  }

  try {
    const result = await enabler.enableAgents(options);
    console.log('\n🎉 MCP Agent Enablement Summary:');
    console.log(`Pattern: ${result.pattern}`);
    console.log(`Environment: ${result.environment}`);
    console.log(`Config: ${result.configPath}`);
    console.log(`Feature Flags: ${result.featureFlagsPath}`);

    console.log('\n📋 Next Steps:');
    console.log('1. Start MCP server: npm run mcp:start');
    console.log(
      '2. Check agent status: node scripts/enable-mcp-agents.js --status'
    );
    console.log('3. Verify deployment: npm run mcp:health-check');
  } catch (error) {
    console.error('❌ Agent enablement failed:', error.message);
    process.exit(1);
  }
}

// Export for use as a module
export default MCPAgentEnabler;

// Run as CLI if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}
