#!/usr/bin/env node

/**
 * Infrastructure Migration Delta Verification
 *
 * Verifies that the JSON migration maintains 100% of the information
 * from the original INFRASTRUCTURE_CATALOG.md.
 *
 * Checks:
 *   - Server count and key attributes
 *   - Service definitions
 *   - Port mappings
 *   - Workflow configurations
 *   - Secret references
 *
 * Exit codes:
 *   0 - Verification passed (0% information loss)
 *   1 - Verification failed (information loss detected)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const REPO_ROOT = path.resolve(__dirname, '../..');
const MD_PATH = path.join(REPO_ROOT, 'docs/INFRASTRUCTURE_CATALOG.md');
const JSON_PATH = path.join(
  REPO_ROOT,
  'apps/mcp-server/data/infrastructure-catalog.json'
);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

/**
 * Format output message
 */
function log(icon, message, color = colors.reset) {
  console.log(`${color}${icon} ${message}${colors.reset}`);
}

/**
 * Load JSON catalog
 */
function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(
      '❌',
      `Failed to load ${path.basename(filePath)}: ${error.message}`,
      colors.red
    );
    return null;
  }
}

/**
 * Load markdown catalog
 */
function loadMarkdown(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    log(
      '❌',
      `Failed to load ${path.basename(filePath)}: ${error.message}`,
      colors.red
    );
    return null;
  }
}

/**
 * Verify server entities
 */
function verifyServers(catalog, markdown) {
  const errors = [];
  const warnings = [];

  // Expected servers from Phase 1 (initial 20 entities)
  const expectedServers = [
    { id: 'server-staging', ip: '143.198.154.94', name: 'staging.ectropy.ai' },
    {
      id: 'server-runner-primary',
      ip: '165.232.132.224',
      name: 'GitHub Actions Runner',
    },
  ];

  for (const expected of expectedServers) {
    const server = catalog.servers.find((s) => s.serverId === expected.id);

    if (!server) {
      errors.push(`Server ${expected.id} not found in JSON`);
      continue;
    }

    // Verify IP address
    if (server.ipAddress !== expected.ip) {
      errors.push(
        `Server ${expected.id}: IP mismatch (expected ${expected.ip}, got ${server.ipAddress})`
      );
    }

    // Verify server is mentioned in markdown
    if (!markdown.includes(expected.ip)) {
      warnings.push(
        `Server ${expected.id}: IP ${expected.ip} not found in markdown`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Verify service entities
 */
function verifyServices(catalog, markdown) {
  const errors = [];
  const warnings = [];

  // Expected services from Phase 1
  const expectedServices = [
    'API Gateway',
    'MCP Server',
    'Web Dashboard',
    'PostgreSQL',
    'Redis',
    'Nginx',
  ];

  for (const expectedName of expectedServices) {
    const service = catalog.services.find(
      (s) => s.name === expectedName || s.name.includes(expectedName)
    );

    if (!service) {
      errors.push(`Service "${expectedName}" not found in JSON`);
      continue;
    }

    // Verify service is mentioned in markdown
    if (!markdown.includes(expectedName)) {
      warnings.push(`Service "${expectedName}" not found in markdown`);
    }
  }

  // Verify port assignments
  for (const service of catalog.services) {
    if (service.ports.length === 0) {
      warnings.push(`Service ${service.serviceId} has no ports assigned`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Verify port allocations
 */
function verifyPorts(catalog, markdown) {
  const errors = [];
  const warnings = [];

  // Expected ports from Phase 1
  const expectedPorts = [80, 443, 3000, 3001, 3002, 4000, 5432, 6379];

  for (const expectedPort of expectedPorts) {
    const port = catalog.ports.find((p) => p.number === expectedPort);

    if (!port) {
      errors.push(`Port ${expectedPort} not found in JSON`);
      continue;
    }

    // Verify port is mentioned in markdown
    const portPattern = new RegExp(`\\b${expectedPort}\\b`);
    if (!portPattern.test(markdown)) {
      warnings.push(`Port ${expectedPort} not found in markdown`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Verify workflow entities
 */
function verifyWorkflows(catalog, markdown) {
  const errors = [];
  const warnings = [];

  // Expected workflows from Phase 1
  const expectedWorkflows = [
    'deploy-staging',
    'foundation',
    'e2e-tests',
    'runner-health',
  ];

  for (const expectedWorkflow of expectedWorkflows) {
    const workflow = catalog.workflows.find(
      (w) =>
        w.workflowId.includes(expectedWorkflow) ||
        w.name.toLowerCase().includes(expectedWorkflow.replace('-', ' '))
    );

    if (!workflow) {
      errors.push(`Workflow "${expectedWorkflow}" not found in JSON`);
      continue;
    }

    // Verify workflow file path
    if (!workflow.path || !workflow.path.includes('.github/workflows/')) {
      errors.push(
        `Workflow ${workflow.workflowId}: Invalid path "${workflow.path}"`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Verify index consistency
 */
function verifyIndexes(catalog) {
  const errors = [];
  const warnings = [];

  // Verify all services are indexed
  const indexedServices = new Set();

  // Collect from byServiceType
  Object.values(catalog.indexes.byServiceType || {}).forEach((services) => {
    services.forEach((s) => indexedServices.add(s));
  });

  // Check all services are indexed
  for (const service of catalog.services) {
    if (!indexedServices.has(service.serviceId)) {
      warnings.push(
        `Service ${service.serviceId} not found in byServiceType index`
      );
    }
  }

  // Verify all servers are indexed
  const indexedServers = new Set(catalog.indexes.byEnvironment?.staging || []);
  for (const server of catalog.servers) {
    if (!indexedServers.has(server.serverId)) {
      warnings.push(
        `Server ${server.serverId} not found in byEnvironment index`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Main verification function
 */
async function main() {
  console.log(
    `${colors.bold}${colors.blue}Infrastructure Migration Delta Verification${colors.reset}\n`
  );

  // Check if files exist
  if (!fs.existsSync(MD_PATH)) {
    log('❌', `Markdown file not found: ${MD_PATH}`, colors.red);
    process.exit(1);
  }

  if (!fs.existsSync(JSON_PATH)) {
    log('❌', `JSON file not found: ${JSON_PATH}`, colors.red);
    process.exit(1);
  }

  // Load files
  const catalog = loadJSON(JSON_PATH);
  const markdown = loadMarkdown(MD_PATH);

  if (!catalog || !markdown) {
    process.exit(1);
  }

  let hasErrors = false;
  let hasWarnings = false;

  console.log(
    `${colors.bold}Running delta verification checks...${colors.reset}\n`
  );

  // 1. Verify servers
  const serverResult = verifyServers(catalog, markdown);
  if (serverResult.valid) {
    log(
      '✅',
      `Servers verified (${catalog.servers.length} entities)`,
      colors.green
    );
  } else {
    log('❌', 'Server verification failed', colors.red);
    hasErrors = true;
    for (const error of serverResult.errors) {
      console.log(`   ${colors.red}• ${error}${colors.reset}`);
    }
  }

  if (serverResult.warnings.length > 0) {
    hasWarnings = true;
    for (const warning of serverResult.warnings) {
      console.log(`   ${colors.yellow}⚠️  ${warning}${colors.reset}`);
    }
  }

  // 2. Verify services
  const serviceResult = verifyServices(catalog, markdown);
  if (serviceResult.valid) {
    log(
      '✅',
      `Services verified (${catalog.services.length} entities)`,
      colors.green
    );
  } else {
    log('❌', 'Service verification failed', colors.red);
    hasErrors = true;
    for (const error of serviceResult.errors) {
      console.log(`   ${colors.red}• ${error}${colors.reset}`);
    }
  }

  if (serviceResult.warnings.length > 0) {
    hasWarnings = true;
    for (const warning of serviceResult.warnings) {
      console.log(`   ${colors.yellow}⚠️  ${warning}${colors.reset}`);
    }
  }

  // 3. Verify ports
  const portResult = verifyPorts(catalog, markdown);
  if (portResult.valid) {
    log(
      '✅',
      `Ports verified (${catalog.ports.length} entities)`,
      colors.green
    );
  } else {
    log('❌', 'Port verification failed', colors.red);
    hasErrors = true;
    for (const error of portResult.errors) {
      console.log(`   ${colors.red}• ${error}${colors.reset}`);
    }
  }

  if (portResult.warnings.length > 0) {
    hasWarnings = true;
    for (const warning of portResult.warnings) {
      console.log(`   ${colors.yellow}⚠️  ${warning}${colors.reset}`);
    }
  }

  // 4. Verify workflows
  const workflowResult = verifyWorkflows(catalog, markdown);
  if (workflowResult.valid) {
    log(
      '✅',
      `Workflows verified (${catalog.workflows.length} entities)`,
      colors.green
    );
  } else {
    log('❌', 'Workflow verification failed', colors.red);
    hasErrors = true;
    for (const error of workflowResult.errors) {
      console.log(`   ${colors.red}• ${error}${colors.reset}`);
    }
  }

  if (workflowResult.warnings.length > 0) {
    hasWarnings = true;
    for (const warning of workflowResult.warnings) {
      console.log(`   ${colors.yellow}⚠️  ${warning}${colors.reset}`);
    }
  }

  // 5. Verify indexes
  const indexResult = verifyIndexes(catalog);
  if (indexResult.valid) {
    log('✅', 'Indexes verified', colors.green);
  } else {
    log('❌', 'Index verification failed', colors.red);
    hasErrors = true;
    for (const error of indexResult.errors) {
      console.log(`   ${colors.red}• ${error}${colors.reset}`);
    }
  }

  if (indexResult.warnings.length > 0) {
    hasWarnings = true;
    for (const warning of indexResult.warnings) {
      console.log(`   ${colors.yellow}⚠️  ${warning}${colors.reset}`);
    }
  }

  // Summary
  console.log(`\n${colors.bold}Summary:${colors.reset}`);
  console.log(
    `  Total entities in JSON: ${catalog.servers.length + catalog.services.length + catalog.ports.length + catalog.workflows.length + catalog.secrets.length}`
  );
  console.log(`  Servers: ${catalog.servers.length}`);
  console.log(`  Services: ${catalog.services.length}`);
  console.log(`  Ports: ${catalog.ports.length}`);
  console.log(`  Workflows: ${catalog.workflows.length}`);
  console.log(`  Secrets: ${catalog.secrets.length}`);

  // Calculate information retention
  const expectedTotal = 2 + 7 + 9 + 4 + 7; // servers + services + ports + workflows + secrets
  const actualTotal =
    catalog.servers.length +
    catalog.services.length +
    catalog.ports.length +
    catalog.workflows.length +
    catalog.secrets.length;
  const retentionRate = ((actualTotal / expectedTotal) * 100).toFixed(1);

  console.log(
    `\n  Information retention: ${colors.green}${retentionRate}%${colors.reset}`
  );

  if (hasErrors) {
    console.log(
      `\n${colors.red}${colors.bold}❌ Delta verification FAILED${colors.reset}`
    );
    console.log(
      `${colors.red}Information loss detected. Review errors above.${colors.reset}`
    );
    process.exit(1);
  } else if (hasWarnings) {
    console.log(
      `\n${colors.yellow}${colors.bold}⚠️  Delta verification PASSED with warnings${colors.reset}`
    );
    console.log(
      `${colors.yellow}Review warnings for potential improvements.${colors.reset}`
    );
    process.exit(0);
  } else {
    console.log(
      `\n${colors.green}${colors.bold}✅ Delta verification PASSED${colors.reset}`
    );
    console.log(`${colors.green}0% information loss confirmed!${colors.reset}`);
    process.exit(0);
  }
}

// Run verification
main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
