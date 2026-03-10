/**
 * Platform Pattern Seeder
 *
 * Seeds the Platform Success Stack tier with initial patterns derived from
 * Ectropy's historical milestone completions. These patterns enable the
 * Platform Agent to make pattern-matched recommendations for feature
 * decomposition, schema design, and deployment decisions.
 *
 * Pattern Categories:
 * 1. Feature Decomposition (M7, M5, M3 patterns)
 * 2. Schema Design (evolution, migration, deprecation)
 * 3. Deployment Strategy (staging-first, rollback, blue-green)
 * 4. Testing Strategy (unit-first, integration, E2E)
 * 5. Multi-Tenant Isolation (RLS, context injection)
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Platform Success Stack pattern
 */
export interface PlatformPattern {
  $id: string;
  patternId: string;
  name: string;
  description: string;
  category: string;
  actionType: string;
  contextSignature: number[];
  actionTemplate: Record<string, unknown>;
  outcomeProfile: {
    successRate: number;
    averageImprovement: number;
    variance: number;
  };
  confidence: number;
  frequency: number;
  successCount: number;
  contextBreadth: number;
  conditions: string[];
  tags: string[];
  sourceDecisions: string[];
  createdAt: string;
  updatedAt: string;
  tier: 'platform';
  isGlobal: false;
}

/**
 * Pattern collection structure
 */
export interface PlatformPatternCollection {
  $schema: string;
  $id: string;
  schemaVersion: string;
  tier: 'platform';
  meta: {
    createdAt: string;
    lastUpdated: string;
    patternCount: number;
    categories: string[];
  };
  patterns: PlatformPattern[];
}

// ============================================================================
// Pattern Templates
// ============================================================================

/**
 * Generate unique pattern ID
 */
function generatePatternId(category: string, index: number): string {
  const prefix = category.toUpperCase().substring(0, 4);
  const timestamp = Date.now().toString().slice(-4);
  return `PAT-PLATFORM-${prefix}-${timestamp}-${String(index).padStart(3, '0')}`;
}

/**
 * Generate URN for pattern
 */
function generatePatternUrn(patternId: string): string {
  return `urn:luhtech:ectropy-platform:success-pattern:${patternId}`;
}

/**
 * Feature decomposition patterns
 */
function createFeatureDecompositionPatterns(): PlatformPattern[] {
  const now = new Date().toISOString();

  return [
    {
      $id: generatePatternUrn(generatePatternId('feat', 1)),
      patternId: generatePatternId('feat', 1),
      name: 'M7_MILESTONE_DECOMPOSITION',
      description: 'Standard 7-milestone feature decomposition for complex features with database changes',
      category: 'feature-decomposition',
      actionType: 'decompose_feature',
      contextSignature: [0.8, 0.7, 0.6, 0.8, 0.85, 0.7, 0.6, 0.9, 0.8, 0.85, 0.75, 0.65],
      actionTemplate: {
        milestoneCount: 7,
        sequence: [
          'M1-Foundation (Types, Schemas)',
          'M2-Database (Prisma Models, Migrations)',
          'M3-Service (Business Logic)',
          'M4-MCP Tools (Tool Definitions)',
          'M5-Integration (API Routes)',
          'M6-Testing (Unit, Integration)',
          'M7-Documentation'
        ],
        estimatedTotalHours: 120,
        parallelizable: ['M6', 'M7']
      },
      outcomeProfile: { successRate: 0.85, averageImprovement: 0.15, variance: 0.08 },
      confidence: 0.88,
      frequency: 47,
      successCount: 40,
      contextBreadth: 0.75,
      conditions: ['feature_complexity >= medium', 'has_database_changes', 'has_mcp_tools'],
      tags: ['feature', 'decomposition', 'complex', 'database'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('feat', 2)),
      patternId: generatePatternId('feat', 2),
      name: 'M5_MILESTONE_DECOMPOSITION',
      description: 'Medium complexity feature decomposition without database changes',
      category: 'feature-decomposition',
      actionType: 'decompose_feature',
      contextSignature: [0.85, 0.75, 0.7, 0.85, 0.8, 0.75, 0.65, 0.85, 0.75, 0.9, 0.8, 0.7],
      actionTemplate: {
        milestoneCount: 5,
        sequence: [
          'M1-Foundation (Types)',
          'M2-Service (Business Logic)',
          'M3-Integration (API/MCP)',
          'M4-Testing',
          'M5-Documentation'
        ],
        estimatedTotalHours: 60,
        parallelizable: ['M4', 'M5']
      },
      outcomeProfile: { successRate: 0.90, averageImprovement: 0.12, variance: 0.05 },
      confidence: 0.92,
      frequency: 35,
      successCount: 32,
      contextBreadth: 0.70,
      conditions: ['feature_complexity == medium', 'no_database_changes'],
      tags: ['feature', 'decomposition', 'medium'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('feat', 3)),
      patternId: generatePatternId('feat', 3),
      name: 'M3_QUICK_DECOMPOSITION',
      description: 'Lightweight 3-milestone decomposition for simple features',
      category: 'feature-decomposition',
      actionType: 'decompose_feature',
      contextSignature: [0.9, 0.85, 0.8, 0.9, 0.85, 0.8, 0.7, 0.85, 0.8, 0.95, 0.85, 0.8],
      actionTemplate: {
        milestoneCount: 3,
        sequence: [
          'M1-Implementation',
          'M2-Testing',
          'M3-Integration'
        ],
        estimatedTotalHours: 20,
        parallelizable: []
      },
      outcomeProfile: { successRate: 0.95, averageImprovement: 0.08, variance: 0.03 },
      confidence: 0.95,
      frequency: 62,
      successCount: 59,
      contextBreadth: 0.60,
      conditions: ['feature_complexity <= low', 'no_schema_changes', 'single_service'],
      tags: ['feature', 'decomposition', 'simple', 'quick'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
  ];
}

/**
 * Schema design patterns
 */
function createSchemaDesignPatterns(): PlatformPattern[] {
  const now = new Date().toISOString();

  return [
    {
      $id: generatePatternUrn(generatePatternId('schema', 1)),
      patternId: generatePatternId('schema', 1),
      name: 'V3_SCHEMA_EVOLUTION',
      description: 'Schema version bump with backward compatibility',
      category: 'schema-design',
      actionType: 'evolve_schema',
      contextSignature: [0.85, 0.8, 0.7, 0.9, 0.85, 0.75, 0.8, 0.95, 0.85, 0.9, 0.8, 0.75],
      actionTemplate: {
        steps: [
          'Add new fields with defaults (backward compatible)',
          'Migrate existing data to new fields',
          'Deprecate old fields with warnings',
          'Remove deprecated fields in next major version'
        ],
        versionIncrement: 'minor',
        requiredTests: ['schema validation', 'migration', 'backward compatibility'],
        rollbackStrategy: 'revert migration script'
      },
      outcomeProfile: { successRate: 0.90, averageImprovement: 0.10, variance: 0.04 },
      confidence: 0.92,
      frequency: 23,
      successCount: 21,
      contextBreadth: 0.80,
      conditions: ['breaking_change_avoidable', 'has_existing_data'],
      tags: ['schema', 'evolution', 'backward-compatible', 'migration'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('schema', 2)),
      patternId: generatePatternId('schema', 2),
      name: 'BREAKING_SCHEMA_CHANGE',
      description: 'Major version bump for breaking schema changes',
      category: 'schema-design',
      actionType: 'evolve_schema',
      contextSignature: [0.7, 0.65, 0.6, 0.75, 0.7, 0.6, 0.75, 0.85, 0.7, 0.8, 0.65, 0.6],
      actionTemplate: {
        steps: [
          'Create new schema version (v4.0.0)',
          'Implement dual-write period',
          'Migrate consumers to new schema',
          'Deprecate old schema version',
          'Remove old schema after migration window'
        ],
        versionIncrement: 'major',
        migrationWindow: '30 days',
        requiredNotifications: ['consumers', 'documentation', 'changelog']
      },
      outcomeProfile: { successRate: 0.80, averageImprovement: 0.20, variance: 0.10 },
      confidence: 0.85,
      frequency: 8,
      successCount: 6,
      contextBreadth: 0.65,
      conditions: ['breaking_change_required', 'consumer_coordination_possible'],
      tags: ['schema', 'breaking', 'major-version', 'migration'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('schema', 3)),
      patternId: generatePatternId('schema', 3),
      name: 'ADDITIVE_SCHEMA_PATTERN',
      description: 'Simple additive schema changes (new optional fields)',
      category: 'schema-design',
      actionType: 'extend_schema',
      contextSignature: [0.9, 0.85, 0.85, 0.95, 0.9, 0.85, 0.75, 0.9, 0.85, 0.95, 0.9, 0.85],
      actionTemplate: {
        steps: [
          'Add new optional field(s) with defaults',
          'Update schema documentation',
          'Add validation tests',
          'Patch version bump'
        ],
        versionIncrement: 'patch',
        requiredTests: ['schema validation', 'type safety']
      },
      outcomeProfile: { successRate: 0.98, averageImprovement: 0.05, variance: 0.02 },
      confidence: 0.98,
      frequency: 45,
      successCount: 44,
      contextBreadth: 0.90,
      conditions: ['optional_field_only', 'no_existing_field_changes'],
      tags: ['schema', 'additive', 'simple', 'patch'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
  ];
}

/**
 * Deployment patterns
 */
function createDeploymentPatterns(): PlatformPattern[] {
  const now = new Date().toISOString();

  return [
    {
      $id: generatePatternUrn(generatePatternId('deploy', 1)),
      patternId: generatePatternId('deploy', 1),
      name: 'STAGING_FIRST_DEPLOYMENT',
      description: 'Always validate on staging before production deployment',
      category: 'deployment',
      actionType: 'deploy_feature',
      contextSignature: [0.85, 0.9, 0.75, 0.85, 0.95, 0.9, 0.7, 0.85, 0.9, 0.95, 0.85, 0.8],
      actionTemplate: {
        steps: [
          'Deploy to staging environment',
          'Run E2E test suite on staging',
          'Manual smoke test critical paths',
          'Monitor staging metrics for 4 hours',
          'Deploy to production',
          'Monitor production metrics'
        ],
        stagingDuration: '4 hours minimum',
        rollbackTriggers: ['error rate > 1%', 'p95 latency > 2x baseline']
      },
      outcomeProfile: { successRate: 0.98, averageImprovement: 0.08, variance: 0.02 },
      confidence: 0.98,
      frequency: 89,
      successCount: 87,
      contextBreadth: 0.95,
      conditions: ['production_deployment', 'staging_available'],
      tags: ['deployment', 'staging', 'validation', 'production'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('deploy', 2)),
      patternId: generatePatternId('deploy', 2),
      name: 'HOTFIX_DEPLOYMENT',
      description: 'Emergency hotfix deployment bypassing staging',
      category: 'deployment',
      actionType: 'deploy_hotfix',
      contextSignature: [0.6, 0.7, 0.5, 0.7, 0.75, 0.65, 0.5, 0.7, 0.75, 0.8, 0.6, 0.5],
      actionTemplate: {
        steps: [
          'Create hotfix branch from production',
          'Implement minimal fix',
          'Run critical test subset',
          'Deploy directly to production',
          'Immediate monitoring (15 min)',
          'Backport to develop branch'
        ],
        maxDuration: '2 hours',
        approvalRequired: 'ARCHITECT or ERIK',
        postDeploymentReview: 'required within 24 hours'
      },
      outcomeProfile: { successRate: 0.85, averageImprovement: 0.30, variance: 0.15 },
      confidence: 0.80,
      frequency: 12,
      successCount: 10,
      contextBreadth: 0.50,
      conditions: ['production_incident', 'urgency > 0.8', 'minimal_change'],
      tags: ['deployment', 'hotfix', 'emergency', 'bypass'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
  ];
}

/**
 * Multi-tenant isolation patterns
 */
function createMultiTenantPatterns(): PlatformPattern[] {
  const now = new Date().toISOString();

  return [
    {
      $id: generatePatternUrn(generatePatternId('tenant', 1)),
      patternId: generatePatternId('tenant', 1),
      name: 'RLS_FIRST_ISOLATION',
      description: 'PostgreSQL RLS as primary tenant isolation layer',
      category: 'multi-tenant',
      actionType: 'implement_isolation',
      contextSignature: [0.85, 0.8, 0.7, 0.85, 0.8, 0.75, 0.7, 0.9, 0.8, 0.95, 0.75, 0.7],
      actionTemplate: {
        steps: [
          'Add tenant_id column to table',
          'Create index on tenant_id',
          'Create RLS policy for SELECT/INSERT/UPDATE/DELETE',
          'Enable RLS on table',
          'Add tenant context injection in middleware',
          'Test isolation with multi-tenant scenarios'
        ],
        requiredTests: ['isolation test', 'performance test', 'bypass test for admin']
      },
      outcomeProfile: { successRate: 0.95, averageImprovement: 0.12, variance: 0.03 },
      confidence: 0.95,
      frequency: 18,
      successCount: 17,
      contextBreadth: 0.85,
      conditions: ['tenant_scoped_data', 'postgresql_database'],
      tags: ['multi-tenant', 'isolation', 'RLS', 'security'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
    {
      $id: generatePatternUrn(generatePatternId('tenant', 2)),
      patternId: generatePatternId('tenant', 2),
      name: 'CONTEXT_INJECTION_PATTERN',
      description: 'Request-scoped tenant context injection via middleware',
      category: 'multi-tenant',
      actionType: 'implement_context',
      contextSignature: [0.9, 0.85, 0.75, 0.9, 0.85, 0.8, 0.75, 0.85, 0.85, 0.9, 0.8, 0.75],
      actionTemplate: {
        steps: [
          'Create TenantContextService with AsyncLocalStorage',
          'Add middleware to extract tenant from JWT/subdomain',
          'Inject tenant context into database session',
          'Validate tenant context on all tenant-scoped operations'
        ],
        contextSources: ['JWT claims', 'subdomain', 'API key'],
        fallbackBehavior: 'reject request if no tenant context'
      },
      outcomeProfile: { successRate: 0.92, averageImprovement: 0.10, variance: 0.04 },
      confidence: 0.92,
      frequency: 15,
      successCount: 14,
      contextBreadth: 0.80,
      conditions: ['multi-tenant-api', 'request-scoped-isolation'],
      tags: ['multi-tenant', 'context', 'middleware', 'injection'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
  ];
}

/**
 * Testing strategy patterns
 */
function createTestingPatterns(): PlatformPattern[] {
  const now = new Date().toISOString();

  return [
    {
      $id: generatePatternUrn(generatePatternId('test', 1)),
      patternId: generatePatternId('test', 1),
      name: 'UNIT_FIRST_TESTING',
      description: 'Unit tests before integration tests for new services',
      category: 'testing',
      actionType: 'implement_tests',
      contextSignature: [0.85, 0.95, 0.75, 0.85, 0.9, 0.8, 0.7, 0.85, 0.85, 0.9, 0.85, 0.8],
      actionTemplate: {
        steps: [
          'Write unit tests for business logic (80%+ coverage)',
          'Mock external dependencies',
          'Write integration tests for API routes',
          'Write E2E tests for critical paths',
          'Set up coverage thresholds in CI'
        ],
        coverageTargets: { unit: 0.8, integration: 0.6, e2e: 0.4 },
        testFramework: 'vitest'
      },
      outcomeProfile: { successRate: 0.92, averageImprovement: 0.15, variance: 0.05 },
      confidence: 0.94,
      frequency: 56,
      successCount: 52,
      contextBreadth: 0.85,
      conditions: ['new_service', 'has_business_logic'],
      tags: ['testing', 'unit', 'coverage', 'tdd'],
      sourceDecisions: [],
      createdAt: now,
      updatedAt: now,
      tier: 'platform',
      isGlobal: false,
    },
  ];
}

// ============================================================================
// Seeder Functions
// ============================================================================

/**
 * Generate all platform patterns
 */
export function generatePlatformPatterns(): PlatformPattern[] {
  return [
    ...createFeatureDecompositionPatterns(),
    ...createSchemaDesignPatterns(),
    ...createDeploymentPatterns(),
    ...createMultiTenantPatterns(),
    ...createTestingPatterns(),
  ];
}

/**
 * Create platform pattern collection
 */
export function createPlatformPatternCollection(): PlatformPatternCollection {
  const patterns = generatePlatformPatterns();
  const now = new Date().toISOString();

  const categories = [...new Set(patterns.map((p) => p.category))];

  return {
    $schema: 'https://luhtech.dev/schemas/success-stack-platform.schema.json',
    $id: 'urn:luhtech:ectropy-platform:success-stack:platform-tier',
    schemaVersion: '3.1.0',
    tier: 'platform',
    meta: {
      createdAt: now,
      lastUpdated: now,
      patternCount: patterns.length,
      categories,
    },
    patterns,
  };
}

/**
 * Serialize pattern collection to JSON
 */
export function serializePlatformPatterns(): string {
  const collection = createPlatformPatternCollection();
  return JSON.stringify(collection, null, 2);
}

export default {
  generatePlatformPatterns,
  createPlatformPatternCollection,
  serializePlatformPatterns,
};
