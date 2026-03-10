/**
 * Universal Decision Engine Types & Interfaces
 *
 * Domain-agnostic foundation for the Unified Decision Engine.
 * Import from this module for all universal types and the adapter contract.
 *
 * @module adapters/universal
 * @version 1.0.0
 */

// Universal domain-agnostic types
export type {
  DomainId,
  DomainContext,
  UniversalStatus,
  ImpactLevel,
  RiskLevel,
  IWorkUnit,
  IDecision,
  IDecisionAlternative,
  IDependency,
  DependencyType,
  IStateNode,
  IStateNodeRelationships,
  IContainer,
  IMilestone,
  IAuthorityLevel,
  IAuthorityCascade,
  IHealthMetric,
  IHealthAssessment,
  WorkUnitFilter,
  DecisionFilter,
  StateNodeFilter,
  IWorkRecommendation,
} from './universal.types.js';

// Context adapter contract
export type {
  IContextAdapter,
  AdapterHealthStatus,
  ContextAdapterConfig,
} from './context-adapter.interface.js';
