/**
 * MCP Server Services Index
 * Enterprise service exports
 */

// Audit Service - Enterprise audit logging with tamper-evident chain
export {
  auditService,
  EnterpriseAuditService,
  AuditEventType,
  AuditResourceType,
} from './audit.service.js';
export type { AuditEventInput, AuditEvent } from './audit.service.js';

// PM URN Utilities - URN generation and validation for PM entities
export {
  buildURN,
  buildFileURN,
  buildAuthorityURN,
  parseURN,
  validateURN,
  validateURNType,
  validateIdFormat,
  generateDecisionId,
  generateConsequenceId,
  generateInspectionId,
  generateProposalId,
  generateVoxelId,
  generateParticipantId,
  createGraphMetadata,
  createEmptyGraphMetadata,
  mergeGraphMetadata,
  addInEdge,
  addOutEdge,
  removeInEdge,
  removeOutEdge,
  resetIdCounter,
  resetAllIdCounters,
  setIdCounter,
  PMURNUtils,
} from './pm-urn.utils.js';
export type { ParsedURN } from './pm-urn.utils.js';

// PM Authority Service - 7-tier authority cascade for construction decisions
export {
  calculateRequiredAuthority,
  calculateAuthorityFromDecision,
  hasAuthority,
  validateAuthority,
  validateAuthorityLevel,
  getAuthorityCascade,
  getAuthorityThreshold,
  getAuthorityName,
  getAuthorityTitle,
  getNextAuthority,
  getPreviousAuthority,
  getApprovalChain,
  parseAuthorityLevel,
  routeDecision,
  findDecisionAuthority,
  shouldAutoApprove,
  buildAuthorityURN as buildAuthorityURNFromService,
  parseAuthorityURN,
  daysToHours,
  hoursToDays,
  getBudgetThreshold,
  getScheduleThreshold,
  getVarianceThreshold,
  PMAuthorityService,
} from './pm-authority.service.js';
export type {
  AuthorityCalculationParams,
  RoutingResult,
} from './pm-authority.service.js';

// PM Decision Tools - 17 MCP tools for construction decision lifecycle
export {
  pmDecisionTools,
  getToolByName,
  getToolNames,
  registerPMTools,
} from './pm-decision-tools.js';
export type { MCPToolDefinition } from './pm-decision-tools.js';

// USF Service - Universal Service Factors calculation and normalization
export {
  USFService,
  calculateQualityScore,
  calculateCostScore,
  calculateSpeedScore,
  calculateComposite,
  calculateConfidence,
  calculateReputationMultiplier,
  determinePricingTier,
  calculateBillingAmount,
  calculateVariance,
  calculateContractAdjustment,
  updateProfileFactors,
  buildUSFProfileURN,
  buildUSFWorkPacketURN,
  generateUSFProfileId,
  generateUSFWorkPacketId,
  setUSFIdCounter,
  DEFAULT_USF_WEIGHTS,
  USF_PRICING_TIERS,
} from './usf.service.js';
export type { QualityMetrics, SpeedMetrics, VarianceReport } from './usf.service.js';

// USF MCP Tools - 7 tools for Universal Service Factors tracking
export {
  usfTools,
  getUSFToolByName,
  getUSFToolNames,
  usfToolHandlers,
  executeUSFTool,
  usf_get_provider_profile,
  usf_create_work_packet,
  usf_complete_work_packet,
  usf_search_providers,
  usf_compare_providers,
  usf_get_market_benchmarks,
  usf_calculate_pricing,
} from './usf-tools.js';

// USF Event Handler Service - Phase 3: Voxel Integration
export {
  USFEventType,
  USFEventHandlerService,
  // Event handlers
  handleVoxelCompletion,
  handleInspectionCompletion,
  handleDecisionOutcome,
  // Helper functions
  calculateDecisionUSFImpact,
  createWorkPacketFromVoxel,
  extractQualityMetricsFromFindings,
  calculateActualHoursFromSchedule,
  // Event system
  onUSFEvent,
  emitUSFEvent,
  initializeUSFEventHandlers,
} from './usf-event-handler.service.js';
export type {
  USFEvent,
  VoxelCompletionEvent,
  InspectionCompletionEvent,
  DecisionOutcomeEvent,
  USFEventResult,
} from './usf-event-handler.service.js';

// USF Decision Service - Phase 4: Decision Lifecycle Enhancement
export {
  USFDecisionService,
  // Core functions
  calculateProjectedUSFImpact,
  classifyImpactSeverity,
  getUSFProviderRecommendations,
  getUSFEscalationRecommendation,
  getUSFDecisionContext,
  calculateUSFAuthorityAdjustment,
  // Constants
  USF_ESCALATION_THRESHOLDS,
  USF_AUTHORITY_BUMPS,
} from './usf-decision.service.js';
export type {
  USFImpactSeverity,
  ProjectedUSFImpact,
  USFProviderRecommendation,
  USFEscalationRecommendation,
  DecisionRequirements,
  USFDecisionContext,
} from './usf-decision.service.js';

// USF Billing Service - Phase 5: Billing Integration
export {
  USFBillingService,
  // Invoice management
  generateInvoice,
  submitInvoice,
  approveInvoice,
  // Pay application management
  createPayApplication,
  submitPayApplication,
  approvePayApplication,
  // Retention
  calculateRetentionRelease,
  // Reconciliation
  generateBillingReconciliation,
  calculateProjectedBilling,
  calculateBillingLineItem,
  // ID generators
  generateInvoiceId,
  generatePayApplicationId,
  generateRetentionReleaseId,
  setBillingIdCounter,
  // Constants
  DEFAULT_RETENTION_PERCENT,
  DEFAULT_PAYMENT_TERMS_DAYS,
  STANDARD_BONUS_THRESHOLDS,
  STANDARD_PENALTY_THRESHOLDS,
} from './usf-billing.service.js';
export type {
  InvoiceStatus,
  PayApplicationStatus,
  BillingLineItem,
  USFInvoice,
  USFPayApplication,
  RetentionRelease,
  BillingReconciliation,
  ContractBillingTerms,
  GenerateInvoiceInput,
  CreatePayApplicationInput,
} from './usf-billing.service.js';

// USF Billing MCP Tools - Phase 5: 11 billing tools for AI agent access
export {
  usfBillingTools,
  getUSFBillingToolByName,
  getUSFBillingToolNames,
  usfBillingToolHandlers,
  executeUSFBillingTool,
  registerWorkPacketForBilling,
  getAllInvoices,
  getAllPayApplications,
  // Individual tool handlers
  handleGenerateInvoice,
  handleSubmitInvoice,
  handleApproveInvoice,
  handleGetInvoice,
  handleCreatePayApplication,
  handleSubmitPayApplication,
  handleApprovePayApplication,
  handleReleaseRetention,
  handleBillingReconciliation,
  handleProjectedBilling,
  handleCalculateLineItem,
} from './usf-billing-tools.js';

// USF Labor Market Service - Phase 6: Labor Market Integration
export {
  USFLaborMarketService,
  // Provider registry
  registerProvider,
  getProvider,
  getAllProviders,
  updateProviderAvailability,
  // Availability management
  setAvailabilityWindows,
  getAvailabilityWindows,
  checkProviderAvailability,
  // Reservations
  createReservation,
  confirmReservation,
  releaseReservation,
  getProviderReservations,
  // Search & matching
  searchProviders,
  calculateProviderMatch,
  findOptimalProvider,
  // Work assignments
  assignProviderToWorkPacket,
  getWorkPacketAssignments,
  getProviderAssignments,
  completeAssignment,
  // Market analytics
  generateMarketAnalytics,
  // ID generators
  generateReservationId,
  generateAssignmentId,
  setLaborMarketIdCounter,
  // Constants
  MATCH_SCORE_WEIGHTS,
  MARKET_TIGHTNESS_THRESHOLDS,
  DEFAULT_RATE_BENCHMARKS,
} from './usf-labor-market.service.js';
export type {
  AvailabilityStatus,
  AssignmentStatus,
  MarketSegment,
  AvailabilityWindow,
  ProviderReservation,
  WorkAssignment,
  ProviderSearchCriteria,
  ProviderMatch,
  MarketAnalytics,
  AssignmentConflict,
  AssignmentResult,
} from './usf-labor-market.service.js';

// USF Historical Analytics Service - Phase 7: Historical Analytics
export {
  USFHistoricalAnalyticsService,
  // Time series
  recordTimeSeriesPoint,
  getTimeSeries,
  aggregateTimeSeries,
  // Trend analysis
  analyzeTrend,
  analyzeAllTrends,
  classifyTrendDirection,
  // Performance snapshots
  createPerformanceSnapshot,
  getProviderSnapshots,
  classifyPerformanceTier,
  // Forecasting
  generateForecast,
  // Benchmarking
  compareAgainstBenchmark,
  generateProviderRankings,
  // Reports
  generateAnalyticsReport,
  getReport,
  getAllReports,
  // Helpers
  getPeriodLabel,
  // ID generators
  generateSnapshotId,
  generateReportId,
  setAnalyticsIdCounter,
  // Constants
  TREND_THRESHOLDS,
  PERFORMANCE_TIER_THRESHOLDS,
  FORECAST_CONFIDENCE_THRESHOLDS,
  MOVING_AVERAGE_WINDOWS,
} from './usf-historical-analytics.service.js';
export type {
  AnalyticsPeriod,
  TrendDirection,
  PerformanceTier,
  ForecastConfidence,
  TimeSeriesPoint,
  TrendAnalysis,
  PerformanceSnapshot,
  Forecast,
  BenchmarkComparison,
  AnalyticsReport,
  ProviderRanking,
} from './usf-historical-analytics.service.js';

// SDI Calculator Service - Dual-Process Decision DP-M2: Solution Density Index
export {
  calculateSDI,
  getSDIThresholds,
  computeSDIFromComponents,
  classifySDI,
  computeShannonEntropy,
  computeExplorationBudget,
  validateSDIComponents,
  normalizeSDI,
  setProjectThresholds,
  clearProjectThresholds,
  getExplorationRecommendationText,
  projectSDIChange,
} from './sdi-calculator.service.js';
export type {
  SDICalculatorConfig,
  SDICalculationInput,
  ExplorationBudgetInput,
} from './sdi-calculator.service.js';

// SDI MCP Tools - Dual-Process Decision DP-M2: 4 tools for SDI calculation
export {
  tool_calculate_sdi,
  tool_get_sdi_thresholds,
  tool_query_sdi_history,
  tool_get_exploration_budget,
  SDI_TOOL_DEFINITIONS,
  setSDIIdCounter,
} from './sdi-tools.js';
export type {
  SDISnapshotsCollection,
  SDIToolResult,
  QuerySDIHistoryInput,
  QuerySDIHistoryOutput,
  GetExplorationBudgetInput,
} from './sdi-tools.js';

// Eigenmode Similarity Service - Dual-Process Decision DP-M3: Vector similarity foundation
export {
  computeCosineSimilarity,
  computeEuclideanDistance,
  computeWeightedSimilarity,
  normalizeVector,
  areVectorsSimilar,
  findMostSimilarVector,
  findAllSimilar,
  computeStability,
  computeVectorCentroid,
  EigenmodeSimilarityService,
  DEFAULT_SIMILARITY_CONFIG,
  DEFAULT_EIGENMODE_WEIGHTS,
} from './eigenmode-similarity.service.js';
export type {
  SimilarityConfig,
  SimilaritySearchResult,
} from './eigenmode-similarity.service.js';

// Pattern Compression Service - Dual-Process Decision DP-M3: Decision validation and compression
export {
  validateForCompression,
  compressDecision,
  mergePatterns,
  applyDecay,
  prunePatterns,
  isCompressionEligible,
  computeContextBreadth,
  setPatternIdCounter,
  PatternCompressionService,
  DEFAULT_COMPRESSION_CONFIG,
  CompressionAction,
} from './pattern-compression.service.js';
export type {
  CompressionConfig,
  CompressionResult,
  CompressionOptions,
  PruneOptions,
  PruneResult,
} from './pattern-compression.service.js';

// Success Stack Service - Dual-Process Decision DP-M3: Engine 1 pattern storage and retrieval
export {
  querySuccessStack,
  getPatternDetails,
  storePattern,
  removePattern,
  updatePattern,
  decayAllPatterns,
  getRecommendedAction,
  computeOverallConfidence,
  rankPatternsByRelevance,
  getStoreStatistics,
  clearPatternStore,
  setStackIdCounter,
  SuccessStackService,
  DEFAULT_STACK_CONFIG,
} from './success-stack.service.js';
export type {
  SuccessStackConfig,
  StoreResult,
  UpdateResult,
  DecayResult,
  RankedPattern,
  GetPatternOptions,
  DecayOptions,
} from './success-stack.service.js';

// SDI Projector Service - Dual-Process Decision DP-M4: SDI impact projection
export {
  projectSDI,
  projectMultipleActions,
  estimateComponentDeltas,
  applyComponentDeltas,
  calculateConfidenceInterval,
  calculateCascadingEffects,
  rankActionsBySDIImpact,
  detectThresholdCrossing,
  SDIProjectorService,
  DEFAULT_PROJECTOR_CONFIG,
  DEFAULT_THRESHOLDS as SDI_PROJECTOR_THRESHOLDS,
} from './sdi-projector.service.js';
export type {
  SDIProjectorConfig,
  ProjectSDIInput,
  SDIProjectionResult,
  SDIComponentDeltas,
  ConfidenceInterval,
  CascadingEffect,
  ZoneDependency,
  ProposedAction,
  ResourceImpact,
  ConstraintImpact,
} from './sdi-projector.service.js';

// Possibility Space Service - Dual-Process Decision DP-M4: Engine 2 option generation
export {
  generateOptions,
  generateCandidateActions,
  checkConstraintViolations,
  calculateFeasibility,
  checkNovelty,
  calculateRiskProfile,
  calculateExplorationValue,
  findBestOption,
  filterByRiskLevel,
  getOptionsSummary,
  setOptionIdCounter,
  PossibilitySpaceService,
  DEFAULT_POSSIBILITY_SPACE_CONFIG,
} from './possibility-space.service.js';
export type {
  DecisionContext,
  Constraint,
  ResourceState,
  Option,
  ConstraintViolation,
  RiskProfile,
  RiskFactor,
  GenerateOptionsInput,
  GenerateOptionsOutput,
  PossibilitySpaceConfig,
} from './possibility-space.service.js';

// Dual-Process MCP Tools - DP-M3/M4: 15 tools for Success Stack, Possibility Space, and SDI operations
export {
  dualProcessTools,
  getDualProcessToolByName,
  getDualProcessToolNames,
  registerDualProcessTools,
} from './dual-process-tools.js';
export type {
  DualProcessToolResult,
  MCPToolDefinition as DualProcessMCPToolDefinition,
} from './dual-process-tools.js';
