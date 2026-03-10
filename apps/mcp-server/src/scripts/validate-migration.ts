/**
 * Validate Roadmap Migration: Compare .roadmap/ JSON Files vs Database
 *
 * Reads all 7 original .roadmap/ JSON files and queries the equivalent
 * data from the database via Prisma. Performs deep comparison:
 *   1. Count match: source array length === DB row count
 *   2. ID presence: every source ID exists in DB
 *   3. Field spot checks: title and status for first 3 records
 *
 * Reports PASS/FAIL per entity type and exits with code 1 if any failures.
 *
 * Usage:
 *   pnpm tsx apps/mcp-server/src/scripts/validate-migration.ts
 *
 * @module scripts/validate-migration
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ==============================================================================
// Configuration
// ==============================================================================

const VENTURE_ID = 'ectropy';
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const ROADMAP_DIR = path.join(REPO_ROOT, '.roadmap');

// ==============================================================================
// Prisma Client
// ==============================================================================

const prisma = new PrismaClient();

// ==============================================================================
// Types
// ==============================================================================

interface ValidationResult {
  entity: string;
  passed: boolean;
  details: string[];
}

// ==============================================================================
// Helpers
// ==============================================================================

function readJsonFile(filename: string): any {
  const filePath = path.join(ROADMAP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function normalizeStatus(status: string): string {
  // Normalize various status formats for comparison
  // DB uses UPPER_CASE, JSON uses lowercase/kebab-case
  return status
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/^COMPLETE$/, 'COMPLETED');
}

function checkCountMatch(
  entity: string,
  sourceCount: number,
  dbCount: number,
  details: string[]
): boolean {
  if (sourceCount === dbCount) {
    details.push(`  Count: ${sourceCount} source === ${dbCount} DB  [OK]`);
    return true;
  } else {
    details.push(`  Count: ${sourceCount} source !== ${dbCount} DB  [FAIL]`);
    return false;
  }
}

function checkIdPresence(
  entity: string,
  sourceIds: string[],
  dbIds: Set<string>,
  details: string[]
): boolean {
  const missing = sourceIds.filter((id) => !dbIds.has(id));
  if (missing.length === 0) {
    details.push(`  ID presence: all ${sourceIds.length} IDs found in DB  [OK]`);
    return true;
  } else {
    details.push(
      `  ID presence: ${missing.length} IDs missing from DB  [FAIL]`
    );
    for (const id of missing.slice(0, 5)) {
      details.push(`    Missing: ${id}`);
    }
    if (missing.length > 5) {
      details.push(`    ... and ${missing.length - 5} more`);
    }
    return false;
  }
}

// ==============================================================================
// Validation: Decisions
// ==============================================================================

async function validateDecisions(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('decision-log.json');
  const sourceDecisions: any[] = source.decisions || [];

  const dbDecisions = await (prisma as any).documentationDecision.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('decisions', sourceDecisions.length, dbDecisions.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceDecisions.map((d: any) => d.decisionId);
  const dbIds = new Set(dbDecisions.map((d: any) => d.decision_id));
  if (!checkIdPresence('decisions', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByDecisionId = new Map(dbDecisions.map((d: any) => [d.decision_id, d]));
  const spotCheckCount = Math.min(3, sourceDecisions.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceDecisions[i];
    const db = dbByDecisionId.get(src.decisionId);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.decisionId}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Title check
    if (src.title === db.title) {
      details.push(`  Spot check [${i}] title: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] title: "${src.title}" !== "${db.title}"  [FAIL]`
      );
      allPassed = false;
    }

    // Status check (normalize for comparison)
    const srcStatus = normalizeStatus(src.status || 'proposed');
    const dbStatus = db.status; // Already UPPER_CASE from DB
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'decisions', passed: allPassed, details };
}

// ==============================================================================
// Validation: State Nodes
// ==============================================================================

async function validateStateNodes(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('current-truth.json');
  const sourceNodes: any[] = source.nodes || source.stateNodes || [];

  const dbNodes = await (prisma as any).stateNode.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('stateNodes', sourceNodes.length, dbNodes.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceNodes.map((n: any) => n.nodeId);
  const dbIds = new Set(dbNodes.map((n: any) => n.node_id));
  if (!checkIdPresence('stateNodes', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByNodeId = new Map(dbNodes.map((n: any) => [n.node_id, n]));
  const spotCheckCount = Math.min(3, sourceNodes.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceNodes[i];
    const db = dbByNodeId.get(src.nodeId);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.nodeId}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Title check
    if (src.title === db.title) {
      details.push(`  Spot check [${i}] title: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] title: "${src.title?.slice(0, 50)}" !== "${db.title?.slice(0, 50)}"  [FAIL]`
      );
      allPassed = false;
    }

    // Status check
    const srcStatus = normalizeStatus(src.status || 'active');
    const dbStatus = db.status; // UPPER_CASE from DB
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'stateNodes', passed: allPassed, details };
}

// ==============================================================================
// Validation: Phases (quarters)
// ==============================================================================

async function validatePhases(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('roadmap.json');
  const quarters = source.quarters || {};
  const sourcePhaseIds = Object.keys(quarters);

  const dbPhases = await (prisma as any).roadmapPhase.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('phases', sourcePhaseIds.length, dbPhases.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const dbIds = new Set(dbPhases.map((p: any) => p.phase_id));
  if (!checkIdPresence('phases', sourcePhaseIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByPhaseId = new Map(dbPhases.map((p: any) => [p.phase_id, p]));
  const spotCheckCount = Math.min(3, sourcePhaseIds.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const phaseId = sourcePhaseIds[i];
    const src = quarters[phaseId];
    const db = dbByPhaseId.get(phaseId);
    if (!db) {
      details.push(`  Spot check [${i}] ${phaseId}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Name check (DB name is derived from phase focus)
    details.push(`  Spot check [${i}] phase ${phaseId}: found in DB  [OK]`);

    // Status check
    const srcStatus = normalizeStatus(src.status || 'planned');
    const dbStatus = db.status;
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'phases', passed: allPassed, details };
}

// ==============================================================================
// Validation: Deliverables
// ==============================================================================

async function validateDeliverables(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('roadmap.json');
  const quarters = source.quarters || {};

  // Collect all deliverables across all quarters
  const allDeliverables: any[] = [];
  for (const [_phaseId, quarter] of Object.entries(quarters)) {
    const q = quarter as any;
    if (q.deliverables && Array.isArray(q.deliverables)) {
      allDeliverables.push(...q.deliverables);
    }
  }

  const dbDeliverables = await (prisma as any).roadmapDeliverableDb.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('deliverables', allDeliverables.length, dbDeliverables.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = allDeliverables.map((d: any) => d.id);
  const dbIds = new Set(dbDeliverables.map((d: any) => d.deliverable_id));
  if (!checkIdPresence('deliverables', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByDelivId = new Map(dbDeliverables.map((d: any) => [d.deliverable_id, d]));
  const spotCheckCount = Math.min(3, allDeliverables.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = allDeliverables[i];
    const db = dbByDelivId.get(src.id);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.id}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Title/name check
    if (src.name === db.title) {
      details.push(`  Spot check [${i}] title: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] title: "${src.name}" !== "${db.title}"  [FAIL]`
      );
      allPassed = false;
    }

    // Status check
    const srcStatus = (src.status || 'planned').toLowerCase();
    const dbStatus = (db.status || 'planned').toLowerCase();
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'deliverables', passed: allPassed, details };
}

// ==============================================================================
// Validation: Features
// ==============================================================================

async function validateFeatures(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('roadmap.json');
  const sourceFeatures: any[] = source.features || [];

  if (sourceFeatures.length === 0) {
    details.push('  No features in source file (skipped)');
    return { entity: 'features', passed: true, details };
  }

  const dbFeatures = await (prisma as any).roadmapFeature.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('features', sourceFeatures.length, dbFeatures.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceFeatures.map((f: any) => f.id);
  const dbIds = new Set(dbFeatures.map((f: any) => f.feature_id));
  if (!checkIdPresence('features', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByFeatureId = new Map(dbFeatures.map((f: any) => [f.feature_id, f]));
  const spotCheckCount = Math.min(3, sourceFeatures.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceFeatures[i];
    const db = dbByFeatureId.get(src.id);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.id}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Name check
    if (src.name === db.name) {
      details.push(`  Spot check [${i}] name: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] name: "${src.name}" !== "${db.name}"  [FAIL]`
      );
      allPassed = false;
    }

    // Status check
    const srcStatus = normalizeStatus(src.status || 'planned');
    const dbStatus = db.status;
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'features', passed: allPassed, details };
}

// ==============================================================================
// Validation: Environments
// ==============================================================================

async function validateEnvironments(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('infrastructure-catalog.json');
  const sourceEnvs: any[] = source.catalog?.environments || [];

  const dbEnvs = await (prisma as any).infraEnvironment.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('environments', sourceEnvs.length, dbEnvs.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceEnvs.map((e: any) => e.id);
  const dbIds = new Set(dbEnvs.map((e: any) => e.environment_id));
  if (!checkIdPresence('environments', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByEnvId = new Map(dbEnvs.map((e: any) => [e.environment_id, e]));
  const spotCheckCount = Math.min(3, sourceEnvs.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceEnvs[i];
    const db = dbByEnvId.get(src.id);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.id}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Name check
    if (src.name === db.name) {
      details.push(`  Spot check [${i}] name: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] name: "${src.name}" !== "${db.name}"  [FAIL]`
      );
      allPassed = false;
    }

    // Type check
    if ((src.type || '') === (db.type || '')) {
      details.push(`  Spot check [${i}] type: match (${src.type})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] type: "${src.type}" !== "${db.type}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'environments', passed: allPassed, details };
}

// ==============================================================================
// Validation: Votes
// ==============================================================================

async function validateVotes(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('votes.json');
  const sourceVotes: any[] = source.votes || [];

  const dbVotes = await (prisma as any).roadmapVote.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('votes', sourceVotes.length, dbVotes.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceVotes.map((v: any) => v.voteId || v.id);
  const dbIds = new Set(dbVotes.map((v: any) => v.vote_id));
  if (!checkIdPresence('votes', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByVoteId = new Map(dbVotes.map((v: any) => [v.vote_id, v]));
  const spotCheckCount = Math.min(3, sourceVotes.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceVotes[i];
    const srcId = src.voteId || src.id;
    const db = dbByVoteId.get(srcId);
    if (!db) {
      details.push(`  Spot check [${i}] ${srcId}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Status check
    const srcStatus = (src.status || 'open').toLowerCase();
    const dbStatus = (db.status || 'open').toLowerCase();
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'votes', passed: allPassed, details };
}

// ==============================================================================
// Validation: Dependencies
// ==============================================================================

async function validateDependencies(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('dependencies.json');
  const sourceDeps: any[] = source.dependencies || [];

  const dbDeps = await (prisma as any).externalDependency.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  // 1. Count match
  if (!checkCountMatch('dependencies', sourceDeps.length, dbDeps.length, details)) {
    allPassed = false;
  }

  // 2. ID presence
  const sourceIds = sourceDeps.map((d: any) => d.id);
  const dbIds = new Set(dbDeps.map((d: any) => d.dependency_id));
  if (!checkIdPresence('dependencies', sourceIds, dbIds, details)) {
    allPassed = false;
  }

  // 3. Field spot checks (first 3)
  const dbByDepId = new Map(dbDeps.map((d: any) => [d.dependency_id, d]));
  const spotCheckCount = Math.min(3, sourceDeps.length);
  for (let i = 0; i < spotCheckCount; i++) {
    const src = sourceDeps[i];
    const db = dbByDepId.get(src.id);
    if (!db) {
      details.push(`  Spot check [${i}] ${src.id}: NOT FOUND in DB  [FAIL]`);
      allPassed = false;
      continue;
    }

    // Description check
    if ((src.description || '') === (db.description || '')) {
      details.push(`  Spot check [${i}] description: match  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] description: "${(src.description || '').slice(0, 40)}" !== "${(db.description || '').slice(0, 40)}"  [FAIL]`
      );
      allPassed = false;
    }

    // Status check
    const srcStatus = (src.status || 'active').toLowerCase();
    const dbStatus = (db.status || 'active').toLowerCase();
    if (srcStatus === dbStatus) {
      details.push(`  Spot check [${i}] status: match (${srcStatus})  [OK]`);
    } else {
      details.push(
        `  Spot check [${i}] status: "${srcStatus}" !== "${dbStatus}"  [FAIL]`
      );
      allPassed = false;
    }
  }

  return { entity: 'dependencies', passed: allPassed, details };
}

// ==============================================================================
// Validation: Platform State
// ==============================================================================

async function validatePlatformState(): Promise<ValidationResult> {
  const details: string[] = [];
  let allPassed = true;

  const source = readJsonFile('current-truth.json');
  const hasPlatformState = !!source.platformState;

  const dbPlatformStates = await (prisma as any).platformState.findMany({
    where: { venture_id: VENTURE_ID },
  }) as any[];

  const dbHasPlatformState = dbPlatformStates.length > 0;

  if (hasPlatformState && dbHasPlatformState) {
    details.push('  Source has platformState, DB has platformState  [OK]');

    // Spot check: health field
    const srcHealth = source.platformState.health;
    const dbHealth = dbPlatformStates[0].health;
    if (srcHealth === dbHealth) {
      details.push(`  health: match (${srcHealth})  [OK]`);
    } else {
      details.push(`  health: "${srcHealth}" !== "${dbHealth}"  [FAIL]`);
      allPassed = false;
    }

    // Spot check: phase field
    const srcPhase = source.platformState.phase;
    const dbPhase = dbPlatformStates[0].phase;
    if (srcPhase === dbPhase) {
      details.push(`  phase: match (${srcPhase})  [OK]`);
    } else {
      details.push(`  phase: "${srcPhase}" !== "${dbPhase}"  [FAIL]`);
      allPassed = false;
    }

    // Spot check: production_readiness_score
    const srcPRS = source.platformState.productionReadinessScore;
    const dbPRS = dbPlatformStates[0].production_readiness_score;
    if (srcPRS === dbPRS) {
      details.push(`  productionReadinessScore: match (${srcPRS})  [OK]`);
    } else {
      details.push(
        `  productionReadinessScore: ${srcPRS} !== ${dbPRS}  [FAIL]`
      );
      allPassed = false;
    }
  } else if (!hasPlatformState && !dbHasPlatformState) {
    details.push('  Neither source nor DB has platformState  [OK]');
  } else {
    details.push(
      `  Mismatch: source has platformState=${hasPlatformState}, DB has platformState=${dbHasPlatformState}  [FAIL]`
    );
    allPassed = false;
  }

  return { entity: 'platformState', passed: allPassed, details };
}

// ==============================================================================
// Main
// ==============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Validate Roadmap Migration: .roadmap/ JSON vs Database');
  console.log('='.repeat(60));
  console.log(`  Venture ID: ${VENTURE_ID}`);
  console.log(`  Source dir:  ${ROADMAP_DIR}`);
  console.log('');

  const results: ValidationResult[] = [];

  try {
    // Run all validations
    results.push(await validateDecisions());
    results.push(await validateStateNodes());
    results.push(await validatePhases());
    results.push(await validateDeliverables());
    results.push(await validateFeatures());
    results.push(await validateEnvironments());
    results.push(await validateVotes());
    results.push(await validateDependencies());
    results.push(await validatePlatformState());

    // Print results
    console.log('');
    console.log('-'.repeat(60));
    console.log('Results:');
    console.log('-'.repeat(60));

    let totalPass = 0;
    let totalFail = 0;

    for (const result of results) {
      const icon = result.passed ? 'PASS' : 'FAIL';
      console.log(`\n[${icon}] ${result.entity}`);
      for (const detail of result.details) {
        console.log(detail);
      }

      if (result.passed) {
        totalPass++;
      } else {
        totalFail++;
      }
    }

    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log(
      `Summary: ${totalPass} passed, ${totalFail} failed, ${results.length} total`
    );
    console.log('='.repeat(60));

    if (totalFail > 0) {
      console.log('');
      console.log('VALIDATION FAILED - see details above');
      process.exit(1);
    } else {
      console.log('');
      console.log('ALL VALIDATIONS PASSED');
    }
  } catch (error) {
    console.error('');
    console.error(
      'Validation error:',
      error instanceof Error ? error.message : error
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
