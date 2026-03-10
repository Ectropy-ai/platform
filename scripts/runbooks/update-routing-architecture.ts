#!/usr/bin/env tsx
/**
 * Update routing-architecture.json with all 10 validated runbooks
 *
 * Adds Batch 2 and 3 runbooks to the catalog
 */

import fs from 'fs';
import path from 'path';

const ROUTING_ARCH_PATH = path.join(process.cwd(), 'apps/mcp-server/data/routing-architecture.json');

// Read current routing architecture
const routingArch = JSON.parse(fs.readFileSync(ROUTING_ARCH_PATH, 'utf-8'));

// New runbooks from Batches 2 and 3
const newDeploymentRunbooks = [
  {
    catalogId: 'deployment-runbook-v1-0-0',
    name: 'Blue-Green Deployment - MCP Server',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/deployment/blue-green-deploy-v1.0.0.json',
    environment: 'production',
    purpose: 'Zero-downtime deployment of MCP Server with automatic rollback using blue-green deployment strategy',
    phases: 6,
    steps: 13,
    estimatedDuration: '15 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      portAllocation: 'portAllocationMatrix.production',
      nginxConfig: 'nginxConfiguration.production.upstreamBasedRouting',
    },
    mcpQueries: 5,
    decisionSupport: 4,
  },
  {
    catalogId: 'deployment-runbook-v1-0-0-full',
    name: 'Blue-Green Deployment - Full Stack Enterprise',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/deployment/blue-green-deploy-full-v1.0.0.json',
    environment: 'production',
    purpose: 'Enterprise full-stack blue-green deployment with comprehensive defensive gates',
    phases: 8,
    steps: 17,
    estimatedDuration: '30 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      portAllocation: 'portAllocationMatrix.production',
      nginxConfig: 'nginxConfiguration.production.upstreamBasedRouting',
    },
    features: [
      'Pre-deployment database backup',
      'Native service conflict detection',
      'Defensive port verification gates',
      'Comprehensive health validation',
      'Automatic rollback on failure',
    ],
    mcpQueries: 6,
    decisionSupport: 6,
  },
  {
    catalogId: 'deployment-runbook-v1-0-0-infra',
    name: 'Enterprise Infrastructure Deployment',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/deployment/deploy-infrastructure-v1.0.0.json',
    environment: 'all',
    purpose: 'Deploy core infrastructure (PostgreSQL, Redis, MinIO) and Speckle BIM stack with phased health validation',
    phases: 4,
    steps: 20,
    estimatedDuration: '15 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      portAllocation: 'portAllocationMatrix.development',
      speckleIntegration: 'OAuth + GraphQL API integration',
    },
    features: [
      'Phased deployment: Core → Speckle → Application',
      'Health checks with configurable timeouts',
      'Pre-flight validation integration',
      'Speckle database auto-creation',
    ],
    mcpQueries: 6,
    decisionSupport: 6,
  },
];

const newOperationalRunbooks = [
  {
    catalogId: 'operational-runbook-v1-0-0',
    name: 'Docker Compose Usage Guide',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/operational/docker-compose-guide-v1.0.0.json',
    environment: 'all',
    purpose: 'Complete guide for using Docker Compose across all Ectropy environments with infrastructure management',
    phases: 6,
    steps: 22,
    estimatedDuration: '30 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      portAllocation: 'portAllocationMatrix.development',
      dockerCompose: 'Multi-file compose orchestration',
    },
    features: [
      'Infrastructure-only deployment for fast development',
      'Full-stack containerized deployment',
      'Monitoring stack integration',
      'Database management operations',
      'Service troubleshooting workflows',
    ],
    mcpQueries: 6,
    decisionSupport: 5,
  },
  {
    catalogId: 'operational-runbook-v1-0-0-nginx',
    name: 'Nginx Dual-Config Deployment',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/operational/deploy-nginx-config-v1.0.0.json',
    environment: 'all',
    purpose: 'Deploy and validate nginx configurations using dual-config pattern with automated backup and rollback',
    phases: 7,
    steps: 29,
    estimatedDuration: '10 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      nginxConfig: 'nginxConfiguration',
      portAllocation: 'Backend service port mappings',
    },
    features: [
      'Dual-config pattern: root nginx.conf + sites-available',
      'Automatic timestamped backups',
      'nginx -t validation before applying',
      'Automatic rollback on failure',
      'Post-deployment endpoint health checks',
    ],
    mcpQueries: 6,
    decisionSupport: 6,
  },
];

const newValidationRunbooks = [
  {
    catalogId: 'validation-runbook-v1-0-0',
    name: 'Speckle Pre-Flight Validation',
    version: '1.0.0',
    file: 'apps/mcp-server/data/runbooks/validation/preflight-check-v1.0.0.json',
    environment: 'all',
    purpose: 'Pre-flight validation for Speckle deployment with comprehensive infrastructure and configuration checks',
    phases: 7,
    steps: 21,
    estimatedDuration: '5 minutes',
    status: 'production-ready',
    validationStatus: 'valid',
    architectureAlignment: {
      portAllocation: 'portAllocationMatrix',
      speckleIntegration: 'Environment variables and service dependencies',
    },
    features: [
      'PowerShell-based validation framework',
      'Infrastructure prerequisites checking',
      'Environment variable validation',
      'Port availability verification',
      'Service dependency validation',
    ],
    mcpQueries: 5,
    decisionSupport: 4,
  },
];

// Add new runbooks to appropriate arrays
routingArch.runbookCatalog.runbooks.deployment.push(...newDeploymentRunbooks);
routingArch.runbookCatalog.runbooks.operational.push(...newOperationalRunbooks);
routingArch.runbookCatalog.runbooks.validation.push(...newValidationRunbooks);

// Update statistics
routingArch.runbookCatalog.statistics = {
  totalRunbooks: 10,
  productionReady: 10,
  validationPassRate: '100%',
  deployment: 6,
  migration: 1,
  operational: 2,
  emergency: 0,
  validation: 1,
  totalPhases: 56,
  totalSteps: 209,
  mcpQueriesEnabled: 60,
  decisionSupportCapabilities: 52,
};

// Update conversion pipeline
routingArch.runbookCatalog.conversionPipeline.converted = 10;
routingArch.runbookCatalog.conversionPipeline.remaining = 5;
routingArch.runbookCatalog.conversionPipeline.conversionProgress = '67%';

// Update nextBatches
routingArch.runbookCatalog.nextBatches = {
  batch4: {
    priority: 'medium',
    runbooks: [
      'emergency-rollback.sh',
      'disaster-recovery.md',
      'security-audit.md',
      'performance-optimization.md',
      'database-maintenance.md',
    ],
    estimatedEffort: '10-15 hours',
    status: 'identified',
  },
};

// Update root metadata
routingArch.version = '1.8.0';
routingArch.lastUpdated = '2025-11-16T12:00:00.000000Z';
routingArch.metadata.runbooksCount = 10;
routingArch.metadata.lastAudit = '2025-11-16T12:00:00.000000Z';
routingArch.metadata.auditBy = 'runbook-batch-3-completion-enterprise-integration-2025-11-16';

// Add changelog entry
const newChangeLogEntry = {
  date: '2025-11-16T12:00:00Z',
  session: 'Runbook Batch 2 & 3 Completion - Enterprise Integration',
  changes: [
    'Added 6 new validated runbooks (Batches 2 & 3 complete)',
    'Added blue-green-deploy-v1.0.0.json - MCP Server blue-green deployment',
    'Added blue-green-deploy-full-v1.0.0.json - Full stack enterprise blue-green deployment',
    'Added deploy-infrastructure-v1.0.0.json - Enterprise infrastructure deployment',
    'Added docker-compose-guide-v1.0.0.json - Docker Compose operational guide',
    'Added deploy-nginx-config-v1.0.0.json - Nginx dual-config deployment',
    'Added preflight-check-v1.0.0.json - Speckle pre-flight validation',
    'Updated statistics: 10 total runbooks (6 deployment, 1 migration, 2 operational, 1 validation)',
    'Updated totals: 56 phases, 209 steps, 60 MCP queries, 52 decision support capabilities',
    'Updated conversion progress: 67% complete (10 of 15 runbooks)',
    'Updated nextBatches to reflect Batch 4 as next priority',
    'Updated version from 1.7.0 to 1.8.0',
  ],
  filesModified: ['apps/mcp-server/data/routing-architecture.json'],
  runbooksAdded: [
    'apps/mcp-server/data/runbooks/deployment/blue-green-deploy-v1.0.0.json',
    'apps/mcp-server/data/runbooks/deployment/blue-green-deploy-full-v1.0.0.json',
    'apps/mcp-server/data/runbooks/deployment/deploy-infrastructure-v1.0.0.json',
    'apps/mcp-server/data/runbooks/operational/docker-compose-guide-v1.0.0.json',
    'apps/mcp-server/data/runbooks/operational/deploy-nginx-config-v1.0.0.json',
    'apps/mcp-server/data/runbooks/validation/preflight-check-v1.0.0.json',
  ],
  status: 'Batches 2 and 3 complete - 10 of 15 runbooks now validated and registered',
};

routingArch.changeLog.push(newChangeLogEntry);

// Write updated file
fs.writeFileSync(ROUTING_ARCH_PATH, JSON.stringify(routingArch, null, 2) + '\n');

console.log('✅ Updated routing-architecture.json with 10 runbooks');
console.log('📊 Statistics:');
console.log(`   - Total runbooks: ${routingArch.runbookCatalog.statistics.totalRunbooks}`);
console.log(`   - Deployment: ${routingArch.runbookCatalog.statistics.deployment}`);
console.log(`   - Migration: ${routingArch.runbookCatalog.statistics.migration}`);
console.log(`   - Operational: ${routingArch.runbookCatalog.statistics.operational}`);
console.log(`   - Validation: ${routingArch.runbookCatalog.statistics.validation}`);
console.log(`   - Total phases: ${routingArch.runbookCatalog.statistics.totalPhases}`);
console.log(`   - Total steps: ${routingArch.runbookCatalog.statistics.totalSteps}`);
console.log(`   - Conversion progress: ${routingArch.runbookCatalog.conversionPipeline.conversionProgress}`);
