/**
 * GraphQL Schema for Operational Runbooks
 *
 * Provides MCP query access to machine-readable runbooks for deployment,
 * migration, and operational procedures with decision intelligence support.
 *
 * Integration: apps/mcp-server/data/runbooks/*.json
 * Validation: scripts/runbooks/validate-runbook.ts
 * Schema: scripts/runbooks/schema/runbook-schema.json
 */

export const runbookTypeDefs = `
  """
  Runbook type classification
  """
  enum RunbookType {
    deployment
    migration
    operational
    emergency
    validation
  }

  """
  Target environment for runbook execution
  """
  enum Environment {
    development
    staging
    production
    all
  }

  """
  Runbook execution status
  """
  enum RunbookStatus {
    DRAFT
    READY
    IN_PROGRESS
    COMPLETE
    FAILED
    DEPRECATED
  }

  """
  Failure handling action
  """
  enum FailureAction {
    abort
    retry
    skip
    rollback
  }

  """
  Runbook metadata for catalog and discovery
  """
  type RunbookMetadata {
    catalogId: String!
    name: String
    type: RunbookType
    purpose: String!
    maintainer: String!
    lastUpdated: String!
    sourceFile: String
    schemaVersion: String
  }

  """
  Deployment or operational phase
  """
  type Phase {
    phase: Int!
    name: String!
    estimatedDuration: String
    purpose: String
    steps: [Step!]!
  }

  """
  Individual execution step within a phase
  """
  type Step {
    step: String!
    name: String!
    command: String
    commands: [String!]
    purpose: String
    required: Boolean
    expectedOutput: String
    expectedStatus: Int
    automatable: Boolean
    timeout: String
    retryable: Boolean
    maxRetries: Int
    onFailure: FailureHandler
    relatedFiles: [String!]
    validation: StepValidation
  }

  """
  Step failure handling configuration
  """
  type FailureHandler {
    action: FailureAction!
    rollbackStep: String
    message: String
  }

  """
  Step validation criteria
  """
  type StepValidation {
    type: String!
    criteria: String
  }

  """
  Pre-flight validation check
  """
  type PreFlightCheck {
    category: String!
    check: String!
    command: String
    commands: [String!]
    expectedResult: String
    automatable: Boolean
    onFailure: FailureHandler
  }

  """
  Post-deployment validation
  """
  type ValidationCheck {
    category: String!
    check: String!
    command: String
    commands: [String!]
    healthChecks: [HealthCheck!]
  }

  """
  Service health check definition
  """
  type HealthCheck {
    service: String!
    endpoint: String!
    expectedStatus: Int
    timeout: String
  }

  """
  Success criterion for deployment validation
  """
  type SuccessCriterion {
    criterion: String!
    validation: String!
    status: String!
  }

  """
  Rollback procedure configuration
  """
  type Rollback {
    supported: Boolean!
    estimatedDuration: String
    steps: [RollbackStep!]
  }

  """
  Individual rollback step
  """
  type RollbackStep {
    step: Int!
    name: String!
    command: String
    commands: [String!]
    validation: String
  }

  """
  MCP integration configuration for decision support
  """
  type McpIntegration {
    queryableFields: [String!]
    supportedQueries: [SupportedQuery!]
    decisionSupport: [String!]
    architectureAlignment: ArchitectureAlignment
  }

  """
  Supported GraphQL query definition
  """
  type SupportedQuery {
    query: String!
    returns: String!
    purpose: String!
  }

  """
  Architecture alignment references
  """
  type ArchitectureAlignment {
    routingConfig: String
    portAllocation: String
    oauthConfig: String
    featureFlags: String
    databaseConfig: String
  }

  """
  Complete operational runbook
  """
  type Runbook {
    version: String!
    environment: Environment!
    runbookType: RunbookType
    metadata: RunbookMetadata!
    executiveSummary: ExecutiveSummary!
    preFlightChecks: [PreFlightCheck!]
    phases: [Phase!]
    validation: ValidationCheck
    successCriteria: [SuccessCriterion!]
    rollback: Rollback
    mcpIntegration: McpIntegration
  }

  """
  Executive summary of runbook
  """
  type ExecutiveSummary {
    description: String
    deploymentStatus: String
    confidenceLevel: String
    riskAssessment: String
    purpose: String
    scope: String
    status: RunbookStatus
    estimatedDuration: String
    prerequisites: [String!]
    keyChanges: [String!]
  }

  """
  Runbook catalog entry (lightweight summary)
  """
  type RunbookCatalogEntry {
    catalogId: String!
    name: String!
    version: String!
    type: RunbookType!
    environment: Environment!
    purpose: String!
    status: RunbookStatus!
    phases: Int!
    steps: Int!
    estimatedDuration: String!
  }

  """
  Feature flag configuration for progressive rollout
  """
  type FeatureFlagConfig {
    name: String!
    description: String!
    environments: FeatureFlagEnvironments!
  }

  """
  Feature flag status per environment
  """
  type FeatureFlagEnvironments {
    alpha: Boolean!
    beta: Boolean!
    staging: Boolean!
    production: Boolean!
  }

  extend type Query {
    """
    Get complete runbook by catalog ID
    """
    getRunbook(catalogId: String!): Runbook

    """
    Get all runbooks (optionally filtered by type or environment)
    """
    getRunbooks(type: RunbookType, environment: Environment): [Runbook!]!

    """
    Get lightweight runbook catalog (for listing/discovery)
    """
    getRunbookCatalog(type: RunbookType, environment: Environment): [RunbookCatalogEntry!]!

    """
    Get deployment phases for a specific runbook
    """
    getDeploymentPhases(catalogId: String!): [Phase!]

    """
    Get rollback procedure for a specific runbook
    """
    getRollbackProcedure(catalogId: String!): Rollback

    """
    Get pre-flight checks for a specific runbook
    """
    getPreFlightChecks(catalogId: String!): [PreFlightCheck!]

    """
    Get success criteria for a specific runbook
    """
    getSuccessCriteria(catalogId: String!): [SuccessCriterion!]

    """
    Get feature flag configuration from multi-environment runbook
    """
    getFeatureFlagStatus(runbookId: String!): [FeatureFlagConfig!]

    """
    Get environment-specific configuration from runbook
    """
    getEnvironmentConfig(runbookId: String!, environment: Environment!): EnvironmentConfig
  }

  """
  Environment-specific configuration
  """
  type EnvironmentConfig {
    environment: Environment!
    featureFlags: FeatureFlags
    ports: [PortMapping!]
    services: [String!]
  }

  """
  Feature flags for an environment
  """
  type FeatureFlags {
    MCP_SERVER: Boolean
    SEMANTIC_SEARCH: Boolean
    NEW_IFC: Boolean
    ENHANCED_CACHING: Boolean
    NEW_DASHBOARD: Boolean
    REAL_TIME_COLLAB: Boolean
  }

  """
  Port mapping for service
  """
  type PortMapping {
    service: String!
    port: Int!
  }
`;
