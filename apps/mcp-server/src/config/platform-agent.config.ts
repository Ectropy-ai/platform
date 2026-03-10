/**
 * Platform Agent Configuration
 *
 * Configuration for the internal Platform Decision Agent that operates
 * on Ectropy's own development planning data. Completely isolated from
 * tenant construction data.
 *
 * Key isolation layers:
 * 1. Repository boundary (private repo for platform files)
 * 2. PostgreSQL RLS bypass via tenant_id = NULL
 * 3. MCP tool excluded_contexts configuration
 * 4. Separate Success Stack tier
 *
 * @see .roadmap/features/platform-agent/FEATURE.json
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Agent type discriminator
 */
export type AgentType = 'PLATFORM' | 'TENANT';

/**
 * Success Stack tier for pattern isolation
 */
export type SuccessStackTier = 'platform' | 'global' | 'tenant';

/**
 * Platform authority levels (Dev → Architect → Erik)
 */
export enum PlatformAuthorityLevel {
  CLAUDE_AGENT = 0,
  DEVELOPER = 1,
  ARCHITECT = 2,
  ERIK = 3,
}

/**
 * Authority level configuration
 */
export interface AuthorityLevelConfig {
  level: PlatformAuthorityLevel;
  role: string;
  maxEffortHours: number | 'unlimited';
  scopeLimit: 'single_file' | 'single_feature' | 'multi_feature' | 'strategic';
  patternConfidenceRequired: number;
  explorationPermitted: boolean;
  permissions: string[];
  escalationTriggers: string[];
}

/**
 * Platform agent context for MCP tool calls
 */
export interface PlatformAgentContext {
  agentType: 'PLATFORM';
  tenantId: null;
  dataScope: 'PLATFORM_ONLY';
  successStackTier: 'platform';
  authorityContext: {
    cascade: PlatformAuthorityLevel[];
    currentActor: string;
    currentLevel: PlatformAuthorityLevel;
  };
  excludedContexts: string[];
  dataFiles: {
    roadmap: string;
    decisionLog: string;
    successStack: string;
    ventureSummary: string;
  };
}

/**
 * Platform agent configuration
 */
export interface PlatformAgentConfig {
  agentType: 'PLATFORM';
  tools: {
    include: string[];
    exclude: string[];
  };
  contextInjection: PlatformAgentContext;
  eigenmodeLabels: string[];
  authorityLevels: AuthorityLevelConfig[];
}

// ============================================================================
// Authority Cascade Configuration
// ============================================================================

/**
 * Platform authority cascade (4-tier)
 */
export const PLATFORM_AUTHORITY_LEVELS: AuthorityLevelConfig[] = [
  {
    level: PlatformAuthorityLevel.CLAUDE_AGENT,
    role: 'CLAUDE_AGENT',
    maxEffortHours: 4,
    scopeLimit: 'single_file',
    patternConfidenceRequired: 0.9,
    explorationPermitted: false,
    permissions: [
      'Apply high-confidence patterns',
      'Fix lint/type errors',
      'Update documentation',
      'Run tests and report',
    ],
    escalationTriggers: [
      'Novel situation (no pattern match)',
      'Multi-file changes required',
      'Schema modifications',
      'Pattern confidence < 0.9',
    ],
  },
  {
    level: PlatformAuthorityLevel.DEVELOPER,
    role: 'DEVELOPER',
    maxEffortHours: 40,
    scopeLimit: 'single_feature',
    patternConfidenceRequired: 0.7,
    explorationPermitted: true,
    permissions: [
      'Implement approved features',
      'Create new services',
      'Add tests',
      'Refactor within scope',
      'Minor schema additions',
    ],
    escalationTriggers: [
      'Cross-feature changes',
      'Schema design decisions',
      'External integrations',
      'Effort exceeds 40 hours',
    ],
  },
  {
    level: PlatformAuthorityLevel.ARCHITECT,
    role: 'ARCHITECT',
    maxEffortHours: 200,
    scopeLimit: 'multi_feature',
    patternConfidenceRequired: 0.5,
    explorationPermitted: true,
    permissions: [
      'Schema design',
      'Architecture decisions',
      'Cross-feature refactoring',
      'Integration design',
      'New eigenmode definitions',
    ],
    escalationTriggers: [
      'Strategic direction changes',
      'Venture-level impact',
      'Funding gate decisions',
      'Breaking API changes',
    ],
  },
  {
    level: PlatformAuthorityLevel.ERIK,
    role: 'ERIK',
    maxEffortHours: 'unlimited',
    scopeLimit: 'strategic',
    patternConfidenceRequired: 0,
    explorationPermitted: true,
    permissions: [
      'All decisions',
      'Venture priorities',
      'Funding allocation',
      'Strategic direction',
      'Team structure',
    ],
    escalationTriggers: [],
  },
];

// ============================================================================
// Platform Eigenmodes (12 dimensions)
// ============================================================================

/**
 * Platform eigenmode labels (12 dimensions for codebase health)
 */
export const PLATFORM_EIGENMODE_LABELS: string[] = [
  'codebase_health', // 0: TypeScript errors, linting warnings
  'test_coverage', // 1: Unit, integration, E2E coverage
  'technical_debt', // 2: TODO count, deprecated usage, complexity
  'dependency_freshness', // 3: npm outdated, security vulnerabilities
  'ci_stability', // 4: CI pass rate, flaky tests, build times
  'deployment_frequency', // 5: Deploy cadence, rollback rate (DORA)
  'documentation_coverage', // 6: JSDoc coverage, README completeness
  'api_stability', // 7: Breaking changes, deprecation warnings
  'performance_regression', // 8: Response times, memory, bundle size
  'security_posture', // 9: Vulnerability count, secrets exposure
  'team_velocity', // 10: PR throughput, review time, cycle time
  'feature_completion', // 11: Milestone completion rate, rework rate
];

// ============================================================================
// Tool Configuration
// ============================================================================

/**
 * MCP tools included for platform agent
 */
export const PLATFORM_INCLUDED_TOOLS: string[] = [
  // Cognitive Operations (SDI & Eigenmodes)
  'calculate_health_score',
  'get_eigenmodes',
  'calculate_sdi',
  'get_sdi_thresholds',
  'get_exploration_budget',

  // Success Stack (Engine 1)
  'query_success_stack',
  'get_pattern_details',
  'compress_decision_pattern',
  'store_success_pattern',
  'decay_patterns',
  'validate_pattern_compression',
  'get_success_stack_statistics',
  'compute_eigenmode_similarity',

  // Possibility Space (Engine 2)
  'generate_options',
  'project_sdi_impact',
  'rank_actions_by_sdi',
  'get_options_summary',
  'find_best_option',
  'filter_by_risk_level',

  // Mediation
  'mediate_decision',
  'set_monitoring_trigger',
  'check_monitoring_triggers',

  // Outcome Recording
  'record_decision_outcome',

  // Dependency Management
  'validate_dag',
  'propagate_date_change',
  'resolve_dependencies',

  // Platform-specific (roadmap access)
  'read_roadmap',
  'read_decision_log',
  'query_venture_summary',
  'link_decision_to_milestone',
  'get_milestone_decisions',
];

/**
 * MCP tools excluded for platform agent (construction-specific)
 */
export const PLATFORM_EXCLUDED_TOOLS: string[] = [
  // PM Decision tools (construction-specific)
  'capture_decision',
  'route_decision',
  'approve_decision',
  'reject_decision',
  'escalate_decision',
  'batch_decisions',

  // Voxel operations (construction-specific)
  'attach_decision_to_voxel',
  'get_voxel_decisions',
  'navigate_decision_surface',
  'query_voxels_by_status',

  // Inspection tools (construction-specific)
  'request_inspection',
  'complete_inspection',
  'get_inspection_requirements',

  // Tolerance tools (construction-specific)
  'apply_tolerance_override',
  'query_tolerance_overrides',

  // Authority graph (tenant version)
  'get_authority_graph',
  'find_decision_authority',
  'validate_authority_level',
];

/**
 * Contexts excluded from platform agent queries
 */
export const PLATFORM_EXCLUDED_CONTEXTS: string[] = [
  'tenant_projects',
  'construction_decisions',
  'field_operations',
  'cross_tenant_data',
  'global_patterns', // Platform uses platform tier only
  'tenant_patterns',
  'voxel_data',
  'inspection_data',
  'tolerance_data',
];

// ============================================================================
// Data File Paths
// ============================================================================

/**
 * Platform data file paths (private repository)
 */
export const PLATFORM_DATA_FILES = {
  roadmap: '.roadmap/roadmap.json',
  decisionLog: '.roadmap/decision-log.json',
  successStack: '.roadmap/success-stack-platform.json',
  ventureSummary: '.roadmap/venture-summary.json',
  businessRoadmap: '.roadmap/roadmap-business.json',
  boundaries: '.roadmap/boundaries.json',
  architecture: '.roadmap/architecture.json',
} as const;

// ============================================================================
// Full Configuration
// ============================================================================

/**
 * Complete platform agent configuration
 */
export const PLATFORM_AGENT_CONFIG: PlatformAgentConfig = {
  agentType: 'PLATFORM',
  tools: {
    include: PLATFORM_INCLUDED_TOOLS,
    exclude: PLATFORM_EXCLUDED_TOOLS,
  },
  contextInjection: {
    agentType: 'PLATFORM',
    tenantId: null,
    dataScope: 'PLATFORM_ONLY',
    successStackTier: 'platform',
    authorityContext: {
      cascade: [
        PlatformAuthorityLevel.CLAUDE_AGENT,
        PlatformAuthorityLevel.DEVELOPER,
        PlatformAuthorityLevel.ARCHITECT,
        PlatformAuthorityLevel.ERIK,
      ],
      currentActor: 'claude-agent',
      currentLevel: PlatformAuthorityLevel.CLAUDE_AGENT,
    },
    excludedContexts: PLATFORM_EXCLUDED_CONTEXTS,
    dataFiles: PLATFORM_DATA_FILES,
  },
  eigenmodeLabels: PLATFORM_EIGENMODE_LABELS,
  authorityLevels: PLATFORM_AUTHORITY_LEVELS,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tool is available for platform agent
 */
export function isToolAvailableForPlatform(toolName: string): boolean {
  return (
    PLATFORM_INCLUDED_TOOLS.includes(toolName) &&
    !PLATFORM_EXCLUDED_TOOLS.includes(toolName)
  );
}

/**
 * Get authority level configuration by level
 */
export function getAuthorityLevelConfig(
  level: PlatformAuthorityLevel
): AuthorityLevelConfig | undefined {
  return PLATFORM_AUTHORITY_LEVELS.find((l) => l.level === level);
}

/**
 * Determine required authority level for effort
 */
export function getRequiredAuthorityLevel(effortHours: number): PlatformAuthorityLevel {
  for (const levelConfig of PLATFORM_AUTHORITY_LEVELS) {
    if (
      levelConfig.maxEffortHours === 'unlimited' ||
      effortHours <= levelConfig.maxEffortHours
    ) {
      return levelConfig.level;
    }
  }
  return PlatformAuthorityLevel.ERIK;
}

/**
 * Check if actor has sufficient authority for decision
 */
export function hasAuthorityForDecision(
  actorLevel: PlatformAuthorityLevel,
  requiredLevel: PlatformAuthorityLevel
): boolean {
  return actorLevel >= requiredLevel;
}

/**
 * Get eigenmode label by index
 */
export function getEigenmodeLabel(index: number): string {
  if (index < 0 || index >= PLATFORM_EIGENMODE_LABELS.length) {
    throw new Error(`Invalid eigenmode index: ${index}. Must be 0-11.`);
  }
  return PLATFORM_EIGENMODE_LABELS[index];
}

/**
 * Create platform agent context for a specific actor
 */
export function createPlatformContext(
  actorId: string,
  actorLevel: PlatformAuthorityLevel = PlatformAuthorityLevel.CLAUDE_AGENT
): PlatformAgentContext {
  return {
    ...PLATFORM_AGENT_CONFIG.contextInjection,
    authorityContext: {
      ...PLATFORM_AGENT_CONFIG.contextInjection.authorityContext,
      currentActor: actorId,
      currentLevel: actorLevel,
    },
  };
}

export default PLATFORM_AGENT_CONFIG;
