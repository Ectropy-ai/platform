#!/usr/bin/env node
/**
 * MCP Verification and Health Check Script
 * Comprehensive verification of MCP deployment and agent connectivity
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

class MCPVerifier {
  constructor() {
    this.mcpEndpoint =
      process.env.MCP_ENDPOINT ||
      `http://localhost:${process.env.MCP_PORT || '3020'}`;
    this.timeout = parseInt(process.env.MCP_VERIFY_TIMEOUT || '10000', 10);
    this.agentToken = process.env.MCP_AGENT_TOKEN || '';
    this.results = [];
  }

  /**
   * Run comprehensive MCP verification
   */
  async verify() {
    console.log('🔍 MCP Verification Starting...');
    console.log(`Endpoint: ${this.mcpEndpoint}`);
    console.log(`Timeout: ${this.timeout}ms`);
    console.log('='.repeat(50));

    try {
      // Core verification checks
      const serverUp = await this.checkServerReachability();
      if (!serverUp) {
        console.log(
          '\n🚫 MCP server unreachable. Start the server and provide a valid MCP_AGENT_TOKEN before running verification.'
        );
        this.generateReport();
        process.exit(1);
      }

      await this.checkHealthEndpoint();
      await this.checkMetricsEndpoint();
      await this.checkJSONRPCInterface();
      await this.checkAgentConfiguration();
      await this.checkFeatureFlags();
      await this.checkDependencies();

      // Performance and load checks
      await this.checkPerformance();

      // Generate final report
      this.generateReport();

      const passed = this.results.filter((r) => r.status === 'PASS').length;
      const failed = this.results.filter((r) => r.status === 'FAIL').length;
      const warnings = this.results.filter((r) => r.status === 'WARN').length;

      if (failed > 0) {
        console.log(`\n❌ Verification FAILED: ${failed} checks failed`);
        process.exit(1);
      } else if (warnings > 0) {
        console.log(
          `\n⚠️ Verification PASSED with warnings: ${warnings} warnings`
        );
      } else {
        console.log(`\n✅ Verification PASSED: All ${passed} checks passed!`);
      }

      return { passed, failed, warnings, results: this.results };
    } catch (error) {
      console.error('❌ Verification failed with error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Check if MCP server is reachable
   */
  async checkServerReachability() {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest('/');
      const responseTime = Date.now() - startTime;

      if (response.statusCode >= 200 && response.statusCode < 500) {
        this.addResult(
          'Server Reachability',
          'PASS',
          `Server reachable (${response.statusCode}) in ${responseTime}ms`
        );
        return true;
      }

      this.addResult(
        'Server Reachability',
        'FAIL',
        `Server returned ${response.statusCode}`
      );
      return false;
    } catch (error) {
      let reason = error?.message || String(error);
      if (error?.name === 'AggregateError' && Array.isArray(error.errors)) {
        reason = error.errors.map((e) => e.message || String(e)).join('; ');
      }
      this.addResult(
        'Server Reachability',
        'FAIL',
        `Cannot reach server: ${reason}`
      );
      return false;
    }
  }

  /**
   * Check health endpoint
   */
  async checkHealthEndpoint() {
    try {
      const response = await this.makeRequest('/health');
      const data = response.data;

      if (response.statusCode === 200) {
        this.addResult(
          'Health Endpoint',
          'PASS',
          `Health check passed - Status: ${data?.server?.status || 'unknown'}`
        );

        // Additional health details
        if (data?.server?.uptime) {
          console.log(`   Uptime: ${data.server.uptime}s`);
        }
        if (data?.resources?.memory) {
          const memUsage = Math.round(data.resources.memory.percentage);
          console.log(`   Memory: ${memUsage}%`);
          if (memUsage > 80) {
            this.addResult(
              'Memory Usage',
              'WARN',
              `High memory usage: ${memUsage}%`
            );
          }
        }
      } else {
        this.addResult(
          'Health Endpoint',
          'FAIL',
          `Health check failed: ${response.statusCode}`
        );
      }
    } catch (error) {
      this.addResult(
        'Health Endpoint',
        'FAIL',
        `Health endpoint error: ${error.message}`
      );
    }
  }

  /**
   * Check metrics endpoint
   */
  async checkMetricsEndpoint() {
    try {
      const response = await this.makeRequest('/metrics');

      if (response.statusCode === 200) {
        this.addResult(
          'Metrics Endpoint',
          'PASS',
          'Metrics endpoint responding'
        );

        // Parse metrics if it's Prometheus format
        if (response.data && typeof response.data === 'string') {
          const lines = response.data
            .split('\n')
            .filter((line) => line.startsWith('mcp_') && !line.startsWith('#'));
          console.log(`   Available metrics: ${lines.length}`);
        }
      } else if (response.statusCode === 404) {
        this.addResult(
          'Metrics Endpoint',
          'WARN',
          'Metrics endpoint not available (optional)'
        );
      } else {
        this.addResult(
          'Metrics Endpoint',
          'FAIL',
          `Metrics endpoint failed: ${response.statusCode}`
        );
      }
    } catch (error) {
      this.addResult(
        'Metrics Endpoint',
        'WARN',
        `Metrics endpoint error: ${error.message} (optional)`
      );
    }
  }

  /**
   * Check JSON-RPC interface
   */
  async checkJSONRPCInterface() {
    try {
      // Test basic JSON-RPC method
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'get_architecture',
        params: {},
      };

      const response = await this.makeRequest('/', {
        method: 'POST',
        data: JSON.stringify(rpcRequest),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.statusCode === 200 && response.data?.result) {
        this.addResult(
          'JSON-RPC Interface',
          'PASS',
          'JSON-RPC interface working'
        );
        console.log(
          `   Response: ${Object.keys(response.data.result || {}).join(', ')}`
        );
      } else if (response.statusCode === 200 && response.data?.error) {
        this.addResult(
          'JSON-RPC Interface',
          'WARN',
          `JSON-RPC responded with error: ${response.data.error.message}`
        );
      } else {
        this.addResult(
          'JSON-RPC Interface',
          'FAIL',
          `JSON-RPC interface failed: ${response.statusCode}`
        );
      }
    } catch (error) {
      this.addResult(
        'JSON-RPC Interface',
        'FAIL',
        `JSON-RPC error: ${error.message}`
      );
    }
  }

  /**
   * Check agent configuration
   */
  async checkAgentConfiguration() {
    try {
      const configPath = path.join(process.cwd(), 'config', 'agents.config.js');

      if (fs.existsSync(configPath)) {
        const moduleUrl = pathToFileURL(configPath).href;
        const agentConfigModule = await import(moduleUrl);
        const agentConfig = agentConfigModule.default || agentConfigModule;

        // Check for dev agent configuration
        if (
          agentConfig.dev &&
          agentConfig.dev.mcp &&
          agentConfig.dev.mcp.enabled
        ) {
          this.addResult(
            'Agent Configuration',
            'PASS',
            'Dev agents configured for MCP'
          );

          const tools = agentConfig.dev.mcp.tools || [];
          console.log(`   Configured tools: ${tools.join(', ')}`);

          // Check endpoint matches
          if (agentConfig.dev.mcp.endpoint !== this.mcpEndpoint) {
            this.addResult(
              'Agent Endpoint',
              'WARN',
              `Agent endpoint mismatch: ${agentConfig.dev.mcp.endpoint} vs ${this.mcpEndpoint}`
            );
          } else {
            this.addResult(
              'Agent Endpoint',
              'PASS',
              'Agent endpoint matches verification endpoint'
            );
          }
        } else {
          this.addResult(
            'Agent Configuration',
            'FAIL',
            'Dev agents not properly configured'
          );
        }
      } else {
        this.addResult(
          'Agent Configuration',
          'FAIL',
          'Agent configuration file not found'
        );
      }
    } catch (error) {
      this.addResult(
        'Agent Configuration',
        'FAIL',
        `Agent configuration error: ${error.message}`
      );
    }
  }

  /**
   * Check feature flags
   */
  async checkFeatureFlags() {
    try {
      const flagsPath = path.join(
        process.cwd(),
        'apps',
        'mcp-server',
        'feature-flags.json'
      );

      if (fs.existsSync(flagsPath)) {
        const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf8'));

        if (flags.mcp && flags.mcp.enabled) {
          this.addResult('Feature Flags', 'PASS', 'MCP feature flag enabled');

          if (flags.mcp.agents && flags.mcp.agents.includes('dev-*')) {
            console.log('   Dev agents enabled in feature flags');
          }

          if (flags.mcp.bypass_ci) {
            console.log('   CI bypass enabled (alpha phase)');
          }
        } else {
          this.addResult(
            'Feature Flags',
            'FAIL',
            'MCP not enabled in feature flags'
          );
        }
      } else {
        this.addResult('Feature Flags', 'WARN', 'Feature flags file not found');
      }
    } catch (error) {
      this.addResult(
        'Feature Flags',
        'FAIL',
        `Feature flags error: ${error.message}`
      );
    }
  }

  /**
   * Check dependencies and environment
   */
  async checkDependencies() {
    try {
      // Check environment variables
      const requiredEnvVars = ['NODE_ENV', 'MCP_PORT'];

      const missingVars = requiredEnvVars.filter(
        (varName) => !process.env[varName]
      );

      if (missingVars.length === 0) {
        this.addResult(
          'Environment Variables',
          'PASS',
          'Required environment variables present'
        );
      } else {
        this.addResult(
          'Environment Variables',
          'WARN',
          `Missing optional env vars: ${missingVars.join(', ')}`
        );
      }

      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);

      if (majorVersion >= 18) {
        this.addResult(
          'Node.js Version',
          'PASS',
          `Node.js ${nodeVersion} (compatible)`
        );
      } else {
        this.addResult(
          'Node.js Version',
          'WARN',
          `Node.js ${nodeVersion} (recommended: 18+)`
        );
      }
    } catch (error) {
      this.addResult(
        'Dependencies',
        'FAIL',
        `Dependency check error: ${error.message}`
      );
    }
  }

  /**
   * Check performance
   */
  async checkPerformance() {
    console.log('\n⚡ Running performance checks...');

    try {
      // Test response times
      const tests = [
        { endpoint: '/health', name: 'Health Check' },
        {
          endpoint: '/',
          name: 'JSON-RPC',
          options: {
            method: 'POST',
            data: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'get_architecture',
              params: {},
            }),
            headers: { 'Content-Type': 'application/json' },
          },
        },
      ];

      for (const test of tests) {
        const times = [];

        // Run test multiple times
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();
          try {
            await this.makeRequest(test.endpoint, test.options);
            times.push(Date.now() - startTime);
          } catch (error) {
            // Skip failed requests for performance testing
          }
        }

        if (times.length > 0) {
          const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          const maxTime = Math.max(...times);

          if (avgTime < 1000) {
            this.addResult(
              `Performance - ${test.name}`,
              'PASS',
              `Avg: ${avgTime.toFixed(0)}ms, Max: ${maxTime}ms`
            );
          } else {
            this.addResult(
              `Performance - ${test.name}`,
              'WARN',
              `Slow response - Avg: ${avgTime.toFixed(0)}ms, Max: ${maxTime}ms`
            );
          }
        }
      }
    } catch (error) {
      this.addResult(
        'Performance',
        'WARN',
        `Performance check error: ${error.message}`
      );
    }
  }

  /**
   * Generate verification report
   */
  generateReport() {
    console.log('\n📊 Verification Report');
    console.log('='.repeat(50));

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const warnings = this.results.filter((r) => r.status === 'WARN').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Warnings: ${warnings}`);
    console.log(`📊 Total: ${this.results.length}`);

    if (failed > 0) {
      console.log('\n❌ Failed Checks:');
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((result) => {
          console.log(`   ${result.check}: ${result.message}`);
        });
    }

    if (warnings > 0) {
      console.log('\n⚠️ Warnings:');
      this.results
        .filter((r) => r.status === 'WARN')
        .forEach((result) => {
          console.log(`   ${result.check}: ${result.message}`);
        });
    }

    // Write detailed report to file
    const reportPath = path.join(process.cwd(), 'mcp-verification-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      endpoint: this.mcpEndpoint,
      summary: { passed, failed, warnings, total: this.results.length },
      results: this.results,
      environment: {
        nodeVersion: process.version,
        nodeEnv: process.env.NODE_ENV,
        mcpPort: process.env.MCP_PORT,
      },
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📝 Detailed report: ${reportPath}`);
  }

  /**
   * Add a verification result
   */
  addResult(check, status, message) {
    this.results.push({
      check,
      status,
      message,
      timestamp: new Date().toISOString(),
    });

    const emoji = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${emoji} ${check}: ${message}`);
  }

  /**
   * Make HTTP request to MCP server
   */
  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.mcpEndpoint);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: { ...(options.headers || {}) },
        timeout: this.timeout,
      };

      if (this.agentToken && !requestOptions.headers.Authorization) {
        requestOptions.headers.Authorization = `Bearer ${this.agentToken}`;
      }

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          let parsedData = data;

          // Try to parse JSON
          if (res.headers['content-type']?.includes('application/json')) {
            try {
              parsedData = JSON.parse(data);
            } catch (error) {
              // Keep raw data if JSON parsing fails
            }
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData,
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (options.data) {
        req.write(options.data);
      }

      req.end();
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let endpoint = null;
  let timeout = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--endpoint':
        endpoint = args[++i];
        break;
      case '--timeout':
        timeout = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        console.log(`
MCP Verification Script

Usage:
  node verify-mcp.js [options]

Options:
  --endpoint <url>        MCP server endpoint (default: http://localhost:3001)
  --timeout <ms>          Request timeout in milliseconds (default: 10000)
  --help, -h              Show this help message

Examples:
  node verify-mcp.js
  node verify-mcp.js --endpoint http://localhost:3001
  node verify-mcp.js --timeout 5000
`);
        return;
    }
  }

  // Override defaults if provided
  if (endpoint) {
    process.env.MCP_ENDPOINT = endpoint;
  }
  if (timeout) {
    process.env.MCP_VERIFY_TIMEOUT = timeout.toString();
  }

  const verifier = new MCPVerifier();
  await verifier.verify();
}

export default MCPVerifier;

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('Verification script failed:', error);
    process.exit(1);
  });
}
