#!/usr/bin/env tsx
/**
 * JSON Schema Validation Script
 * Validates all JSON files in apps/mcp-server/data/ against their schemas
 * Part of the JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: string[];
}

interface APISpec {
  documentId: string;
  version: string;
  metadata: {
    title: string;
    description?: string;
    maintainer?: string;
    humanViewUrl?: string;
  };
  architecture?: unknown;
  authentication?: unknown;
  endpoints?: unknown;
}

interface InfrastructureSpec {
  documentId: string;
  version: string;
  metadata: {
    title: string;
    description?: string;
  };
  services?: unknown;
  components?: unknown;
}

interface RoadmapSpec {
  roadmapId: string;
  type: string;
  version: string;
  metadata: {
    title: string;
    description?: string;
  };
  phases?: Array<{
    phaseId: string;
    name: string;
    deliverables?: unknown[];
  }>;
  currentPhase?: string;
}

interface DecisionLogSpec {
  decisions: Array<{
    id: string;
    decision: string;
    rationale: string;
    date: string;
  }>;
}

interface CurrentTruthSpec {
  schemaVersion: string;
  lastUpdated: string;
  metadata?: unknown;
  platformState?: unknown;
  nodes?: unknown[];
}

/**
 * Validate required fields in an object
 */
function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[],
  path = ''
): string[] {
  const errors: string[] = [];

  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      errors.push(`Missing required field: ${path}${field}`);
    }
  }

  return errors;
}

/**
 * Validate API specification JSON
 */
function validateAPISpec(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Invalid JSON: expected object'];
  }

  const spec = data as APISpec;

  // Validate required root fields
  errors.push(...validateRequiredFields(spec, ['documentId', 'version', 'metadata']));

  // Validate metadata
  if (spec.metadata) {
    errors.push(...validateRequiredFields(spec.metadata as Record<string, unknown>, ['title'], 'metadata.'));
  }

  // Validate documentId format
  if (spec.documentId && !spec.documentId.startsWith('mcp-')) {
    errors.push('documentId should start with "mcp-"');
  }

  // Validate version format (semantic versioning)
  if (spec.version && !/^\d+\.\d+\.\d+$/.test(spec.version)) {
    errors.push('version should follow semantic versioning (e.g., 2.1.0)');
  }

  return errors;
}

/**
 * Validate roadmap JSON
 */
function validateRoadmapSpec(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Invalid JSON: expected object'];
  }

  const spec = data as RoadmapSpec;

  // Validate required fields
  errors.push(...validateRequiredFields(spec, ['roadmapId', 'type', 'version', 'metadata']));

  // Validate metadata
  if (spec.metadata) {
    errors.push(...validateRequiredFields(spec.metadata as Record<string, unknown>, ['title'], 'metadata.'));
  }

  // Validate type
  if (spec.type && !['platform', 'business', 'product'].includes(spec.type)) {
    errors.push('type must be one of: platform, business, product');
  }

  // Validate phases
  if (spec.phases && Array.isArray(spec.phases)) {
    spec.phases.forEach((phase, index) => {
      errors.push(...validateRequiredFields(phase as Record<string, unknown>, ['phaseId', 'name'], `phases[${index}].`));
    });
  }

  // Validate currentPhase
  if (spec.phases && spec.currentPhase) {
    const phaseIds = spec.phases.map(p => p.phaseId);
    if (spec.currentPhase !== '' && !phaseIds.includes(spec.currentPhase)) {
      errors.push(`currentPhase "${spec.currentPhase}" not found in phases array`);
    }
  }

  return errors;
}

/**
 * Validate decision log JSON
 */
function validateDecisionLogSpec(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Invalid JSON: expected object'];
  }

  const spec = data as DecisionLogSpec;

  // Validate decisions array
  if (!Array.isArray(spec.decisions)) {
    errors.push('decisions must be an array');
    return errors;
  }

  spec.decisions.forEach((decision, index) => {
    // Allow either id/date OR decisionId/timestamp (actual schema uses decisionId/timestamp)
    const decisionObj = decision as Record<string, unknown>;
    const hasNewFormat = 'decisionId' in decisionObj && 'timestamp' in decisionObj;
    const hasOldFormat = 'id' in decisionObj && 'date' in decisionObj;

    if (!hasNewFormat && !hasOldFormat) {
      errors.push(`decisions[${index}] must have either (decisionId, timestamp) or (id, date)`);
    }

    // Validate common required fields
    errors.push(...validateRequiredFields(decisionObj, ['decision', 'rationale'], `decisions[${index}].`));
  });

  return errors;
}

/**
 * Validate current truth JSON
 */
function validateCurrentTruthSpec(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Invalid JSON: expected object'];
  }

  const spec = data as CurrentTruthSpec;

  // Validate required fields (platformState is optional, used in actual schema)
  errors.push(...validateRequiredFields(spec, ['schemaVersion', 'lastUpdated']));

  return errors;
}

/**
 * Validate infrastructure catalog JSON
 */
function validateInfrastructureSpec(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Invalid JSON: expected object'];
  }

  const spec = data as InfrastructureSpec;

  // Validate required fields
  errors.push(...validateRequiredFields(spec, ['documentId', 'version', 'metadata']));

  return errors;
}

/**
 * Validate a JSON file based on its filename
 */
async function validateJSONFile(filePath: string): Promise<ValidationResult> {
  const fileName = path.basename(filePath);
  const result: ValidationResult = {
    file: fileName,
    valid: true,
    errors: [],
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Route to appropriate validator based on filename
    if (fileName === 'api-specification.json') {
      result.errors = validateAPISpec(data);
    } else if (fileName.startsWith('roadmap-')) {
      result.errors = validateRoadmapSpec(data);
    } else if (fileName === 'decision-log.json') {
      result.errors = validateDecisionLogSpec(data);
    } else if (fileName === 'current-truth.json') {
      result.errors = validateCurrentTruthSpec(data);
    } else if (fileName === 'infrastructure-catalog.json') {
      result.errors = validateInfrastructureSpec(data);
    } else {
      // Generic validation - just check it's valid JSON
      result.errors = [];
    }

    result.valid = result.errors.length === 0;
  } catch (error) {
    result.valid = false;
    result.errors = [error instanceof Error ? error.message : 'Unknown error'];
  }

  return result;
}

/**
 * Main validation function
 */
async function validateAllJSON(): Promise<void> {
  const dataDir = path.resolve(__dirname, '../../apps/mcp-server/data');

  console.log('🔍 Validating JSON files in MCP data directory...');
  console.log(`📁 Directory: ${dataDir}\n`);

  try {
    // Get all JSON files in data directory
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('⚠️  No JSON files found');
      return;
    }

    console.log(`Found ${jsonFiles.length} JSON file(s)\n`);

    // Validate each file
    const results: ValidationResult[] = [];
    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      const result = await validateJSONFile(filePath);
      results.push(result);

      if (result.valid) {
        console.log(`✅ ${result.file}`);
      } else {
        console.log(`❌ ${result.file}`);
        if (result.errors) {
          result.errors.forEach(error => {
            console.log(`   - ${error}`);
          });
        }
      }
    }

    // Summary
    const validCount = results.filter(r => r.valid).length;
    const invalidCount = results.length - validCount;

    console.log('\n' + '='.repeat(50));
    console.log(`\n📊 Validation Summary:`);
    console.log(`   Total files: ${results.length}`);
    console.log(`   Valid: ${validCount}`);
    console.log(`   Invalid: ${invalidCount}`);

    if (invalidCount > 0) {
      console.log('\n❌ Validation failed - fix errors above');
      process.exit(1);
    } else {
      console.log('\n✅ All JSON files are valid!');
    }
  } catch (error) {
    console.error('❌ Error during validation:', error);
    process.exit(1);
  }
}

// Run validation
validateAllJSON();
