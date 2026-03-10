/**
 * Agent Credential Management Script
 * Creates and manages authentication tokens for AI agents
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

interface AgentCredentials {
  agentId: string;
  name: string;
  token: string;
  permissions: string[];
  expiresAt: Date;
  createdAt: Date;
}

interface AgentRegistration {
  name: string;
  agentType: 'claude-agent' | 'code-assistant' | 'admin-agent' | 'custom';
  permissions: string[];
  expiryDays?: number;
}

class AgentCredentialManager {
  private jwtSecret: string;
  private credentialsPath: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || this.generateSecureSecret();
    this.credentialsPath = path.join(process.cwd(), 'config', 'agent-credentials.json');
    
    if (!process.env.JWT_SECRET) {
      console.log('⚠️ JWT_SECRET not found in environment, using generated secret');
      console.log(`💡 Set JWT_SECRET="${this.jwtSecret}" in your environment`);
    }
  }

  private generateSecureSecret(): string {
    return crypto.randomBytes(64).toString('base64');
  }

  /**
   * Create agent token with specific permissions
   */
  createAgentToken(agentName: string, agentType: string, permissions: string[], expiryDays: number = 90): AgentCredentials {
    const agentId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expiryDays * 24 * 60 * 60 * 1000));

    const payload = {
      agentId,
      name: agentName,
      type: agentType,
      permissions,
      role: 'agent',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti: crypto.randomBytes(16).toString('hex'),
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      issuer: 'ectropy-platform',
      audience: 'ectropy-agents',
      algorithm: 'HS256',
    });

    return {
      agentId,
      name: agentName,
      token,
      permissions,
      expiresAt,
      createdAt: now
    };
  }

  /**
   * Verify and decode agent token
   */
  verifyAgentToken(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret, {
        issuer: 'ectropy-platform',
        audience: 'ectropy-agents',
      });
      
      return { valid: true, payload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Token verification failed' 
      };
    }
  }

  /**
   * Load existing credentials from file
   */
  async loadCredentials(): Promise<AgentCredentials[]> {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, return empty array
      return [];
    }
  }

  /**
   * Save credentials to file
   */
  async saveCredentials(credentials: AgentCredentials[]): Promise<void> {
    const configDir = path.dirname(this.credentialsPath);
    
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }

    await fs.writeFile(this.credentialsPath, JSON.stringify(credentials, null, 2));
  }

  /**
   * Register a new agent and save credentials
   */
  async registerAgent(registration: AgentRegistration): Promise<AgentCredentials> {
    const credentials = this.createAgentToken(
      registration.name,
      registration.agentType,
      registration.permissions,
      registration.expiryDays || 90
    );

    const existingCredentials = await this.loadCredentials();
    existingCredentials.push(credentials);
    await this.saveCredentials(existingCredentials);

    return credentials;
  }

  /**
   * List all registered agents
   */
  async listAgents(): Promise<AgentCredentials[]> {
    const credentials = await this.loadCredentials();
    const now = new Date();
    
    return credentials.map(cred => ({
      ...cred,
      isExpired: new Date(cred.expiresAt) < now
    }));
  }

  /**
   * Remove expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const credentials = await this.loadCredentials();
    const now = new Date();
    
    const validCredentials = credentials.filter(cred => new Date(cred.expiresAt) >= now);
    const removedCount = credentials.length - validCredentials.length;
    
    if (removedCount > 0) {
      await this.saveCredentials(validCredentials);
    }
    
    return removedCount;
  }

  /**
   * Revoke agent token
   */
  async revokeAgent(agentId: string): Promise<boolean> {
    const credentials = await this.loadCredentials();
    const filteredCredentials = credentials.filter(cred => cred.agentId !== agentId);
    
    if (filteredCredentials.length < credentials.length) {
      await this.saveCredentials(filteredCredentials);
      return true;
    }
    
    return false;
  }
}

/**
 * Create predefined agent types
 */
async function createPredefinedAgents(): Promise<void> {
  const manager = new AgentCredentialManager();

  console.log('🤖 Creating AI Agent Credentials');
  console.log('='.repeat(50));

  const agentConfigs = [
    {
      name: 'claude-agent',
      agentType: 'claude-agent' as const,
      permissions: ['semantic_search', 'document_analysis', 'health_metrics']
    },
    {
      name: 'code-assistant',
      agentType: 'code-assistant' as const,
      permissions: ['semantic_search', 'code_generation', 'document_analysis']
    },
    {
      name: 'admin-agent',
      agentType: 'admin-agent' as const,
      permissions: ['*'] // All permissions
    }
  ];

  for (const config of agentConfigs) {
    try {
      const credentials = await manager.registerAgent(config);
      
      console.log(`\n✅ Agent: ${credentials.name}`);
      console.log(`   ID: ${credentials.agentId}`);
      console.log(`   Type: ${config.agentType}`);
      console.log(`   Token: ${credentials.token.substring(0, 20)}...`);
      console.log(`   Permissions: ${credentials.permissions.join(', ')}`);
      console.log(`   Expires: ${credentials.expiresAt.toISOString()}`);
      
    } catch (error) {
      console.error(`❌ Failed to create ${config.name}:`, error);
    }
  }

  console.log('\n📝 Credentials saved to:', manager.credentialsPath);
  console.log('\n🔐 Environment variable to set:');
  console.log(`   JWT_SECRET="${manager.jwtSecret}"`);
}

/**
 * List existing agents
 */
async function listExistingAgents(): Promise<void> {
  const manager = new AgentCredentialManager();
  const agents = await manager.listAgents();

  console.log('🤖 Registered AI Agents');
  console.log('='.repeat(50));

  if (agents.length === 0) {
    console.log('📭 No agents registered');
    return;
  }

  agents.forEach((agent, index) => {
    const expiredStatus = agent.isExpired ? '❌ EXPIRED' : '✅ ACTIVE';
    console.log(`\n${index + 1}. ${agent.name} (${expiredStatus})`);
    console.log(`   ID: ${agent.agentId}`);
    console.log(`   Permissions: ${agent.permissions.join(', ')}`);
    console.log(`   Created: ${new Date(agent.createdAt).toISOString()}`);
    console.log(`   Expires: ${new Date(agent.expiresAt).toISOString()}`);
  });

  // Show cleanup suggestion
  const expiredCount = agents.filter(a => a.isExpired).length;
  if (expiredCount > 0) {
    console.log(`\n⚠️ ${expiredCount} expired token(s) found. Run with --cleanup to remove them.`);
  }
}

/**
 * Verify a token
 */
async function verifyToken(token: string): Promise<void> {
  const manager = new AgentCredentialManager();
  const result = manager.verifyAgentToken(token);

  console.log('🔍 Token Verification');
  console.log('='.repeat(50));

  if (result.valid && result.payload) {
    console.log('✅ Token is valid');
    console.log(`   Agent ID: ${result.payload.agentId}`);
    console.log(`   Name: ${result.payload.name}`);
    console.log(`   Type: ${result.payload.type}`);
    console.log(`   Permissions: ${result.payload.permissions?.join(', ') || 'None'}`);
    console.log(`   Expires: ${new Date(result.payload.exp * 1000).toISOString()}`);
  } else {
    console.log('❌ Token is invalid');
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }
}

/**
 * Generate environment file for production
 */
async function generateEnvFile(): Promise<void> {
  const manager = new AgentCredentialManager();
  const envPath = path.join(process.cwd(), '.env.mcp-agents');

  const envContent = `# MCP Agent Authentication Configuration
# Generated: ${new Date().toISOString()}

# JWT Secret for agent authentication
JWT_SECRET="${manager.jwtSecret}"

# MCP Server Configuration
MCP_PORT=3001
MCP_ENDPOINT=http://localhost:3001

# Agent Credentials Path
AGENT_CREDENTIALS_PATH="./config/agent-credentials.json"

# Production Settings
NODE_ENV=production
MCP_LOG_LEVEL=info
MCP_RATE_LIMIT_ENABLED=true
MCP_METRICS_ENABLED=true
`;

  await fs.writeFile(envPath, envContent);
  console.log(`📁 Environment file created: ${envPath}`);
  console.log('💡 Load with: source .env.mcp-agents');
}

/**
 * CLI Interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'create':
    case 'register':
      await createPredefinedAgents();
      break;

    case 'list':
      await listExistingAgents();
      break;

    case 'verify':
      if (args[1]) {
        await verifyToken(args[1]);
      } else {
        console.error('❌ Please provide a token to verify');
        console.log('Usage: npm run agents:verify <token>');
      }
      break;

    case 'cleanup':
      const manager = new AgentCredentialManager();
      const removed = await manager.cleanupExpiredTokens();
      console.log(`🧹 Removed ${removed} expired token(s)`);
      break;

    case 'env':
      await generateEnvFile();
      break;

    case 'revoke':
      if (args[1]) {
        const mgr = new AgentCredentialManager();
        const revoked = await mgr.revokeAgent(args[1]);
        if (revoked) {
          console.log(`✅ Agent ${args[1]} revoked successfully`);
        } else {
          console.log(`❌ Agent ${args[1]} not found`);
        }
      } else {
        console.error('❌ Please provide an agent ID to revoke');
        console.log('Usage: npm run agents:revoke <agentId>');
      }
      break;

    default:
      console.log('🤖 MCP Agent Credential Manager');
      console.log('='.repeat(50));
      console.log('Available commands:');
      console.log('  create    - Create predefined agent credentials');
      console.log('  list      - List all registered agents');
      console.log('  verify    - Verify a token');
      console.log('  cleanup   - Remove expired tokens');
      console.log('  env       - Generate environment file');
      console.log('  revoke    - Revoke an agent token');
      console.log('');
      console.log('Usage: node scripts/create-agent-credentials.js <command>');
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { AgentCredentialManager, createPredefinedAgents };