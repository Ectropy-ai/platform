/**
 * =============================================================================
 * COMPLIANCE AGENT - PUBLIC API EXPORTS
 *
 * PURPOSE: Main entry point for the Compliance Agent library
 * EXPORTS:
 * - ComplianceAgent: Main compliance validation agent class
 * - Building code validation interfaces and types
 * - Comprehensive IFC model and project requirements validation
 * USAGE:
 * import { ComplianceAgent } from '@ectropy/ai-agents/compliance';
 */

// Export main compliance agent class
export { ComplianceAgent } from './compliance-agent.js';
// Re-export shared interfaces for convenience
export type {
  ComplianceResult,
  ComplianceIssue,
  ValidationDetails,
  TemplateService,
  AgentConfig,
} from '../../shared/types.js';
