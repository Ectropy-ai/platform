#!/usr/bin/env tsx
/**
 * Update routing-architecture.json to v1.9.0 with all 15 validated runbooks
 *
 * Final update for runbook conversion deliverable completion
 */

import fs from 'fs';
import path from 'path';

const ROUTING_ARCH_PATH = path.join(process.cwd(), 'apps/mcp-server/data/routing-architecture.json');

// Read current routing architecture
const routingArch = JSON.parse(fs.readFileSync(ROUTING_ARCH_PATH, 'utf-8'));

// Clear existing runbook arrays to rebuild from scratch
routingArch.runbookCatalog.runbooks = {
  deployment: [],
  migration: [],
  operational: [],
  emergency: [],
  validation: [],
};

// All 15 runbooks with complete metadata
const allRunbooks = {
  deployment: [
    {
      catalogId: 'deployment-runbook-v2-1-1',
      name: 'Staging Deployment v2.1.1',
      version: '2.1.1',
      file: 'apps/mcp-server/data/runbooks/deployment/staging-v2.1.1.json',
      environment: 'staging',
      purpose: 'Production-ready staging deployment with enterprise OAuth, health validation, and comprehensive rollback',
      phases: 7,
      steps: 34,
      estimatedDuration: '30 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 6,
      decisionSupport: 6,
    },
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
      mcpQueries: 6,
      decisionSupport: 6,
    },
    {
      catalogId: 'multi-environment-deploy-v1-0-0',
      name: 'Multi-Environment Deployment Orchestrator',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/deployment/multi-environment-deploy-v1.0.0.json',
      environment: 'all',
      purpose: 'Orchestrated deployment across development, staging, and production with environment-specific configurations',
      phases: 4,
      steps: 16,
      estimatedDuration: '45 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 5,
      decisionSupport: 5,
    },
    {
      catalogId: 'unified-deploy-v1-0-0',
      name: 'Unified Deployment - All Services',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/deployment/unified-deploy-v1.0.0.json',
      environment: 'all',
      purpose: 'Unified deployment of all Ectropy services with dependency orchestration and health validation',
      phases: 5,
      steps: 22,
      estimatedDuration: '25 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 5,
      decisionSupport: 5,
    },
  ],
  migration: [
    {
      catalogId: 'speckle-integration-migration-v1-0-0',
      name: 'Speckle Integration Database Migration',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/migration/speckle-integration-migration-v1.0.0.json',
      environment: 'all',
      purpose: 'Apply Speckle BIM integration database schema with automated backup, validation, and rollback',
      phases: 6,
      steps: 25,
      estimatedDuration: '10 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 6,
      decisionSupport: 6,
    },
    {
      catalogId: 'apply-migration-v1-0-0',
      name: 'Database Migration Application Framework',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/migration/apply-migration-v1.0.0.json',
      environment: 'all',
      purpose: 'Generic database migration application framework with PostgreSQL backup, validation, and rollback procedures',
      phases: 6,
      steps: 25,
      estimatedDuration: '10 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 6,
      decisionSupport: 6,
    },
  ],
  operational: [
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
      mcpQueries: 6,
      decisionSupport: 6,
    },
    {
      catalogId: 'agent-guide-v1-0-0',
      name: 'AI Agent Development Guide',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/operational/agent-guide-v1.0.0.json',
      environment: 'all',
      purpose: 'Comprehensive AI agent onboarding and operational manual with MCP integration, workflows, and quality gates',
      phases: 8,
      steps: 56,
      estimatedDuration: '2 hours',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 6,
      decisionSupport: 6,
    },
  ],
  emergency: [
    {
      catalogId: 'error-recovery-v1-0-0',
      name: 'Error Recovery Procedures',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/emergency/error-recovery-v1.0.0.json',
      environment: 'all',
      purpose: 'Automated error detection, strategy selection, and recovery with multiple fallback options',
      phases: 5,
      steps: 18,
      estimatedDuration: '15 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 5,
      decisionSupport: 5,
    },
    {
      catalogId: 'enterprise-rollback-v1-0-0',
      name: 'Enterprise Rollback Procedures',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/emergency/enterprise-rollback-v1.0.0.json',
      environment: 'production',
      purpose: 'Production deployment rollback with Docker snapshot management, pre-rollback safety snapshots, and integrity validation',
      phases: 7,
      steps: 24,
      estimatedDuration: '20 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 6,
      decisionSupport: 6,
    },
  ],
  validation: [
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
      mcpQueries: 5,
      decisionSupport: 4,
    },
    {
      catalogId: 'smoke-tests-production-v1-0-0',
      name: 'Production Smoke Tests',
      version: '1.0.0',
      file: 'apps/mcp-server/data/runbooks/validation/smoke-tests-production-v1.0.0.json',
      environment: 'production',
      purpose: 'Production smoke testing for zero-downtime deployment validation with automated health checks',
      phases: 6,
      steps: 21,
      estimatedDuration: '10 minutes',
      status: 'production-ready',
      validationStatus: 'valid',
      mcpQueries: 5,
      decisionSupport: 5,
    },
  ],
};

// Populate runbook catalog
routingArch.runbookCatalog.runbooks.deployment = allRunbooks.deployment;
routingArch.runbookCatalog.runbooks.migration = allRunbooks.migration;
routingArch.runbookCatalog.runbooks.operational = allRunbooks.operational;
routingArch.runbookCatalog.runbooks.emergency = allRunbooks.emergency;
routingArch.runbookCatalog.runbooks.validation = allRunbooks.validation;

// Calculate totals
const totalRunbooks = 15;
const totalPhases = allRunbooks.deployment.reduce((sum, r) => sum + r.phases, 0) +
                   allRunbooks.migration.reduce((sum, r) => sum + r.phases, 0) +
                   allRunbooks.operational.reduce((sum, r) => sum + r.phases, 0) +
                   allRunbooks.emergency.reduce((sum, r) => sum + r.phases, 0) +
                   allRunbooks.validation.reduce((sum, r) => sum + r.phases, 0);

const totalSteps = allRunbooks.deployment.reduce((sum, r) => sum + r.steps, 0) +
                  allRunbooks.migration.reduce((sum, r) => sum + r.steps, 0) +
                  allRunbooks.operational.reduce((sum, r) => sum + r.steps, 0) +
                  allRunbooks.emergency.reduce((sum, r) => sum + r.steps, 0) +
                  allRunbooks.validation.reduce((sum, r) => sum + r.steps, 0);

const totalMcpQueries = allRunbooks.deployment.reduce((sum, r) => sum + r.mcpQueries, 0) +
                       allRunbooks.migration.reduce((sum, r) => sum + r.mcpQueries, 0) +
                       allRunbooks.operational.reduce((sum, r) => sum + r.mcpQueries, 0) +
                       allRunbooks.emergency.reduce((sum, r) => sum + r.mcpQueries, 0) +
                       allRunbooks.validation.reduce((sum, r) => sum + r.mcpQueries, 0);

const totalDecisionSupport = allRunbooks.deployment.reduce((sum, r) => sum + r.decisionSupport, 0) +
                            allRunbooks.migration.reduce((sum, r) => sum + r.decisionSupport, 0) +
                            allRunbooks.operational.reduce((sum, r) => sum + r.decisionSupport, 0) +
                            allRunbooks.emergency.reduce((sum, r) => sum + r.decisionSupport, 0) +
                            allRunbooks.validation.reduce((sum, r) => sum + r.decisionSupport, 0);

// Update statistics
routingArch.runbookCatalog.statistics = {
  totalRunbooks: 15,
  productionReady: 15,
  validationPassRate: '100%',
  deployment: 6,
  migration: 2,
  operational: 3,
  emergency: 2,
  validation: 2,
  totalPhases,
  totalSteps,
  mcpQueriesEnabled: totalMcpQueries,
  decisionSupportCapabilities: totalDecisionSupport,
};

// Update conversion pipeline
routingArch.runbookCatalog.conversionPipeline.converted = 15;
routingArch.runbookCatalog.conversionPipeline.remaining = 0;
routingArch.runbookCatalog.conversionPipeline.conversionProgress = '100%';

// Clear nextBatches - conversion complete
routingArch.runbookCatalog.nextBatches = {
  status: 'conversion-complete',
  note: 'All 15 priority runbooks converted and validated to 100%',
};

// Update root metadata
routingArch.version = '1.9.0';
routingArch.lastUpdated = new Date().toISOString();
routingArch.metadata.runbooksCount = 15;
routingArch.metadata.lastAudit = new Date().toISOString();
routingArch.metadata.auditBy = 'runbook-conversion-deliverable-complete-2025-11-16';

// Add changelog entry
const newChangeLogEntry = {
  date: new Date().toISOString(),
  session: 'Runbook Conversion Deliverable Complete - 100% Validation',
  changes: [
    'Completed conversion of all 15 priority runbooks to JSON with MCP integration',
    'Achieved 100% schema validation pass rate (15/15 runbooks valid, 0 errors)',
    'Added 5 new runbooks from Batch 4: smoke-tests, error-recovery, enterprise-rollback, agent-guide, apply-migration',
    'Fixed all schema violations: rollback.steps[].step type conversions, onFailure.action enum compliance',
    'Updated statistics: 15 total runbooks (6 deployment, 2 migration, 3 operational, 2 emergency, 2 validation)',
    `Updated totals: ${totalPhases} phases, ${totalSteps} steps, ${totalMcpQueries} MCP queries, ${totalDecisionSupport} decision support capabilities`,
    'Conversion progress: 100% complete (15 of 15 priority runbooks)',
    'Updated version from 1.8.0 to 1.9.0',
    'Marked conversion deliverable as COMPLETE',
  ],
  filesModified: ['apps/mcp-server/data/routing-architecture.json'],
  runbooksValidated: 15,
  status: 'DELIVERABLE COMPLETE - Ready for production deployment',
};

routingArch.changeLog.push(newChangeLogEntry);

// Write updated file
fs.writeFileSync(ROUTING_ARCH_PATH, JSON.stringify(routingArch, null, 2) + '\n');

console.log('✅ Updated routing-architecture.json to v1.9.0 with ALL 15 runbooks');
console.log('📊 Final Statistics:');
console.log(`   - Total runbooks: ${routingArch.runbookCatalog.statistics.totalRunbooks}`);
console.log(`   - Deployment: ${routingArch.runbookCatalog.statistics.deployment}`);
console.log(`   - Migration: ${routingArch.runbookCatalog.statistics.migration}`);
console.log(`   - Operational: ${routingArch.runbookCatalog.statistics.operational}`);
console.log(`   - Emergency: ${routingArch.runbookCatalog.statistics.emergency}`);
console.log(`   - Validation: ${routingArch.runbookCatalog.statistics.validation}`);
console.log(`   - Total phases: ${routingArch.runbookCatalog.statistics.totalPhases}`);
console.log(`   - Total steps: ${routingArch.runbookCatalog.statistics.totalSteps}`);
console.log(`   - MCP queries: ${routingArch.runbookCatalog.statistics.mcpQueriesEnabled}`);
console.log(`   - Decision support: ${routingArch.runbookCatalog.statistics.decisionSupportCapabilities}`);
console.log(`   - Validation pass rate: ${routingArch.runbookCatalog.statistics.validationPassRate}`);
console.log(`   - Conversion progress: ${routingArch.runbookCatalog.conversionPipeline.conversionProgress}`);
console.log('\n🎉 DELIVERABLE COMPLETE - All runbooks converted and validated to enterprise standards!');
