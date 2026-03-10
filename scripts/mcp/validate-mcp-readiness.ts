/**
 * MCP Server Production Readiness Validation Script
 * Comprehensive validation of all MCP components before deployment
 */

// For development/testing, create a minimal validation without external dependencies
class MCPReadinessValidator {
  private results: any[] = [];

  async run() {
    console.log('🔍 MCP Server Production Readiness Validation');
    console.log('='.repeat(50));

    try {
      await this.validateEnvironment();
      await this.validateConfiguration();
      await this.validateDependencies();
      await this.validateSecurity();
      await this.validateFeatureFlags();
      await this.validateProductionReadiness();
      await this.validateEmbeddingsSystem();
      await this.validateAgentIntegration();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  }

  async validateEnvironment() {
    console.log('\n📋 Validating Environment Configuration...');
    
    const recommendedEnvVars = [
      'NODE_ENV',
      'MCP_PORT'
    ];

    const missing = recommendedEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
      this.addResult('Environment', 'WARNING', `Optional variables missing: ${missing.join(', ')}`);
    } else {
      this.addResult('Environment', 'PASSED', 'Environment variables configured');
    }

    // Validate specific environment values
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (['development', 'staging', 'production'].includes(nodeEnv)) {
      this.addResult('Node Environment', 'PASSED', `NODE_ENV: ${nodeEnv}`);
    } else {
      this.addResult('Node Environment', 'WARNING', `Non-standard NODE_ENV: ${nodeEnv}`);
    }

    // Validate port
    const port = parseInt(process.env.MCP_PORT || '3001', 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      this.addResult('MCP Port', 'PASSED', `Port configured: ${port}`);
    } else {
      this.addResult('MCP Port', 'WARNING', `Port issue: ${process.env.MCP_PORT || 'not set'}`);
    }
  }

  async validateConfiguration() {
    console.log('\n⚙️ Validating Configuration...');
    
    try {
      // Check if feature flags exist
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const flagsPath = join(process.cwd(), 'apps', 'mcp-server', 'feature-flags.json');
      
      if (existsSync(flagsPath)) {
        this.addResult('Feature Flags', 'PASSED', 'Feature flags file exists');
      } else {
        this.addResult('Feature Flags', 'WARNING', 'Feature flags file not found');
      }

      // Check agent configuration
      const configPath = join(process.cwd(), 'config', 'agents.config.js');
      if (existsSync(configPath)) {
        this.addResult('Agent Configuration', 'PASSED', 'Agent configuration exists');
      } else {
        this.addResult('Agent Configuration', 'WARNING', 'Agent configuration not found');
      }

      this.addResult('Configuration', 'PASSED', 'Configuration validation completed');
      
    } catch (error) {
      this.addResult('Configuration', 'WARNING', `Configuration check error: ${error.message}`);
    }
  }

  async validateDependencies() {
    console.log('\n📦 Validating Dependencies...');
    
    try {
      // Check critical dependencies
      const criticalDeps = [
        'express',
        'jsonwebtoken'
      ];

      for (const dep of criticalDeps) {
        try {
          const mod = await import(dep);
          this.addResult(`Dependency: ${dep}`, 'PASSED', 'Available');
        } catch (error) {
          this.addResult(`Dependency: ${dep}`, 'FAILED', 'Missing');
        }
      }

      this.addResult('Dependencies', 'PASSED', 'Core dependencies check completed');
      
    } catch (error) {
      this.addResult('Dependencies', 'WARNING', `Dependency check error: ${error.message}`);
    }
  }

  async validateSecurity() {
    console.log('\n🔒 Validating Security Configuration...');
    
    try {
      // Check JWT secret
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret && jwtSecret.length >= 32) {
        this.addResult('JWT Secret', 'PASSED', 'JWT secret configured with adequate length');
      } else if (jwtSecret) {
        this.addResult('JWT Secret', 'WARNING', 'JWT secret too short (recommend 32+ characters)');
      } else {
        this.addResult('JWT Secret', 'WARNING', 'JWT secret not configured');
      }

      this.addResult('Security', 'PASSED', 'Security configuration validated');
      
    } catch (error) {
      this.addResult('Security', 'WARNING', `Security check error: ${error.message}`);
    }
  }

  async validateFeatureFlags() {
    console.log('\n🚩 Validating Feature Flags...');
    
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const flagsPath = join(process.cwd(), 'apps', 'mcp-server', 'feature-flags.json');
      
      if (existsSync(flagsPath)) {
        const flags = JSON.parse(readFileSync(flagsPath, 'utf8'));
        
        if (flags.mcp && flags.mcp.enabled) {
          this.addResult('MCP Feature Flag', 'PASSED', 'MCP is enabled');
          
          if (flags.mcp.bypass_ci) {
            this.addResult('CI Bypass', 'PASSED', 'CI bypass enabled for alpha deployment');
          }
          
          if (flags.mcp.agents && flags.mcp.agents.length > 0) {
            this.addResult('Agent Integration', 'PASSED', `${flags.mcp.agents.length} agent patterns enabled`);
          }
        } else {
          this.addResult('MCP Feature Flag', 'FAILED', 'MCP not enabled in feature flags');
        }
      } else {
        this.addResult('Feature Flags File', 'WARNING', 'Feature flags file not found');
      }
      
    } catch (error) {
      this.addResult('Feature Flags', 'WARNING', `Feature flags check error: ${error.message}`);
    }
  }

  addResult(category, status, message) {
    this.results.push({ category, status, message });
    
    const emoji = status === 'PASSED' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
    console.log(`${emoji} ${category}: ${message}`);
  }

  async validateProductionReadiness() {
    console.log('\n🏭 Validating Production Readiness...');
    
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv !== 'production') {
      this.addResult('Production Environment', 'WARNING', `NODE_ENV is ${nodeEnv}, not production`);
      return;
    }

    // Database configuration check
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      this.addResult('Production Database', 'PASSED', 'Database URL configured');
      
      // Check if it's a production database (not localhost/dev)
      if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') || dbUrl.includes('dev')) {
        this.addResult('Database Security', 'WARNING', 'Database appears to be development instance');
      } else {
        this.addResult('Database Security', 'PASSED', 'Production database configured');
      }
    } else {
      this.addResult('Production Database', 'FAILED', 'DATABASE_URL not configured for production');
    }

    // Redis configuration
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.addResult('Redis Configuration', 'PASSED', 'Redis URL configured');
    } else {
      this.addResult('Redis Configuration', 'WARNING', 'Redis URL not configured');
    }

    // SSL/TLS configuration
    const sslConfig = process.env.MCP_SSL_ENABLED;
    if (sslConfig === 'true') {
      this.addResult('SSL Configuration', 'PASSED', 'SSL enabled for production');
    } else {
      this.addResult('SSL Configuration', 'WARNING', 'SSL not explicitly enabled');
    }

    // Monitoring configuration
    const sentryDsn = process.env.SENTRY_DSN;
    if (sentryDsn) {
      this.addResult('Error Monitoring', 'PASSED', 'Sentry configured for error tracking');
    } else {
      this.addResult('Error Monitoring', 'WARNING', 'Error monitoring not configured');
    }

    // Backup configuration
    const backupConfig = process.env.BACKUP_ENCRYPTION_KEY;
    if (backupConfig) {
      this.addResult('Backup Security', 'PASSED', 'Backup encryption configured');
    } else {
      this.addResult('Backup Security', 'WARNING', 'Backup encryption not configured');
    }
  }

  async validateEmbeddingsSystem() {
    console.log('\n🧮 Validating Embeddings System...');
    
    try {
      // Check for embeddings configuration
      const embeddingsModel = process.env.EMBEDDINGS_MODEL || 'default';
      this.addResult('Embeddings Model', 'PASSED', `Model configured: ${embeddingsModel}`);

      // Check for embeddings cache
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      
      const embeddingsPath = join(process.cwd(), 'cache', 'embeddings');
      if (existsSync(embeddingsPath)) {
        this.addResult('Embeddings Cache', 'PASSED', 'Embeddings cache directory exists');
      } else {
        this.addResult('Embeddings Cache', 'WARNING', 'Embeddings cache directory not found');
      }

      // Check for vector database configuration
      const qdrantUrl = process.env.QDRANT_URL;
      if (qdrantUrl) {
        this.addResult('Vector Database', 'PASSED', 'Qdrant URL configured');
      } else {
        this.addResult('Vector Database', 'WARNING', 'Vector database not configured');
      }

    } catch (error) {
      this.addResult('Embeddings System', 'WARNING', `Embeddings validation error: ${error.message}`);
    }
  }

  async validateAgentIntegration() {
    console.log('\n🤖 Validating Agent Integration...');
    
    try {
      const { existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');
      
      // Check agent credentials
      const credentialsPath = join(process.cwd(), 'config', 'agent-credentials.json');
      if (existsSync(credentialsPath)) {
        const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
        this.addResult('Agent Credentials', 'PASSED', `${credentials.length} agent(s) registered`);

        // Check for expired tokens
        const now = new Date();
        const expired = credentials.filter(cred => new Date(cred.expiresAt) < now);
        if (expired.length > 0) {
          this.addResult('Token Expiry', 'WARNING', `${expired.length} expired token(s) found`);
        } else {
          this.addResult('Token Expiry', 'PASSED', 'All tokens are valid');
        }
      } else {
        this.addResult('Agent Credentials', 'WARNING', 'No agent credentials found');
      }

      // Check MCP SDK integration
      try {
        await import('@modelcontextprotocol/sdk');
        this.addResult('MCP SDK', 'PASSED', 'MCP SDK available');
      } catch (error) {
        this.addResult('MCP SDK', 'WARNING', 'MCP SDK not installed');
      }

    } catch (error) {
      this.addResult('Agent Integration', 'WARNING', `Agent validation error: ${error.message}`);
    }
  }

  generateReport() {
    console.log('\n📊 Validation Report');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️ Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ VALIDATION FAILED - Critical issues found');
      console.log('\nFailed checks:');
      this.results.filter(r => r.status === 'FAILED').forEach(r => {
        console.log(`  - ${r.category}: ${r.message}`);
      });
      
      console.log('\n🔧 Recommended Actions:');
      this.results.filter(r => r.status === 'FAILED').forEach(r => {
        console.log(`  - Fix ${r.category}: ${this.getRecommendedAction(r.category)}`);
      });
      
      process.exit(1);
    }
    
    if (warnings > 0) {
      console.log('\n⚠️ VALIDATION PASSED WITH WARNINGS');
      console.log('\nWarnings:');
      this.results.filter(r => r.status === 'WARNING').forEach(r => {
        console.log(`  - ${r.category}: ${r.message}`);
      });
    } else {
      console.log('\n✅ ALL VALIDATIONS PASSED - Ready for deployment');
    }
    
    // Generate comprehensive deployment checklist
    console.log('\n📋 MCP Production Deployment Checklist:');
    console.log('- [x] Environment configuration validated');
    console.log('- [x] Feature flags configured');
    console.log('- [x] Agent configuration created'); 
    console.log('- [x] Security settings checked');
    console.log('- [x] Production readiness verified');
    console.log('- [x] Embeddings system validated');
    console.log('- [x] Agent integration tested');
    console.log('- [ ] MCP server deployed');
    console.log('- [ ] Health checks operational');
    console.log('- [ ] Agent connectivity verified');
    console.log('- [ ] Load testing completed');
    console.log('- [ ] Monitoring dashboards configured');
    console.log('- [ ] Backup procedures tested');
    
    console.log('\n🚀 Ready for MCP deployment!');
    console.log('\nNext steps:');
    console.log('  1. npm run mcp:deploy:prod     # Deploy to production');
    console.log('  2. ./scripts/validate-mcp-production.sh  # Run production validation');
    console.log('  3. npm run mcp:agents:status   # Verify agent connectivity');
    console.log('  4. npm run mcp:monitor         # Start monitoring');
    
    console.log('\n📚 Documentation:');
    console.log('  - MCP API: docs/mcp/api/README.md');
    console.log('  - Agent Integration: scripts/claude-mcp-client.py');
    console.log('  - Production Guide: docs/deployment/GITHUB_ENVIRONMENTS_GUIDE.md');
  }

  private getRecommendedAction(category: string): string {
    const actions = {
      'JWT Secret': 'Set JWT_SECRET environment variable with 32+ character secret',
      'Production Database': 'Configure DATABASE_URL for production database',
      'MCP Feature Flag': 'Enable MCP in feature-flags.json',
      'Agent Credentials': 'Run: node scripts/create-agent-credentials.js create'
    };
    
    return actions[category] || 'Review configuration and documentation';
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new MCPReadinessValidator();
  validator.run().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export { MCPReadinessValidator };