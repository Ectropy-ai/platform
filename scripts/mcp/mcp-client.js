#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const MCP_URL = process.env.MCP_URL || 'http://localhost:3001';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, '../reports');

async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

class MCPClient {
  async getTruth() {
    const response = await fetch(`${MCP_URL}/truth`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch truth: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  }

  async validateApp(app) {
    const response = await fetch(`${MCP_URL}/validate?app=${app}`);
    if (!response.ok) {
      throw new Error(
        `Failed to validate ${app}: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  }

  async dailyCycle() {
    console.log('🤖 MCP Daily Cycle Starting...');

    // 1. Get current truth
    const truth = await this.getTruth();
    console.log('📊 Repository Truth Retrieved');

    // 2. Validate all apps
    const apps = ['web-dashboard', 'api-gateway', 'mcp-server'];
    const validations = [];

    for (const app of apps) {
      try {
        const result = await this.validateApp(app);
        validations.push(result);
        console.log(`   ${result.status === 'success' ? '✅' : '❌'} ${app}`);
      } catch (error) {
        validations.push({ app, status: 'failed', error: error.message });
        console.log(`   ❌ ${app}`);
      }
    }

    // 3. Generate action plan
    const failedApps = validations.filter((v) => v.status === 'failed');

    if (failedApps.length > 0) {
      console.log('\n🔧 Required Fixes:');
      for (const app of failedApps) {
        console.log(`   - Fix ${app.app} build`);
      }
    } else {
      console.log('\n✨ All systems operational!');
    }

    // 4. Save daily report
    await ensureReportsDir();
    const report = {
      timestamp: new Date().toISOString(),
      truth,
      validations,
      nextActions: failedApps.map((a) => `Fix ${a.app} build`),
    };

    const reportPath = path.join(REPORTS_DIR, `daily-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new MCPClient();
  client.dailyCycle().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export default MCPClient;
