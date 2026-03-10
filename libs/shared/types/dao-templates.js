/*
 * =============================================================================
 * DAO DATA SHARING TEMPLATE TYPES - FEDERATED CONSTRUCTION GOVERNANCE
 * =============================================================================
 *
 * STATUS: ✅ COMPLETE - Phase 3 Implementation Ready
 * LAST UPDATED: July 8, 2025
 * INTEGRATION: Fully integrated with API Gateway, Database Schema, and Services
 *
 * PURPOSE:
 * Type definitions for decentralized governance of data sharing between
 * construction stakeholders. Templates define access rules that can be
 * modified through DAO voting mechanisms.
 *
 * CAPABILITIES:
 * - Stakeholder role-based data access definitions
 * - Manufacturer data tier governance
 * - Emergency access override mechanisms
 * - Template versioning with rollback support
 * - Blockchain governance integration
 * - Time-based access restrictions
 * - Project-specific overrides
 * - Compliance audit trails
 *
 * GOVERNANCE WORKFLOW:
 * 1. Templates are proposed by stakeholders
 * 2. DAO voting period begins with defined quorum/threshold
 * 3. Stakeholders vote based on their assigned voting weights
 * 4. Approved templates become active access control rules
 * 5. Emergency access can override templates when needed
 *
 * INTEGRATION POINTS:
 * - Used by DAOTemplateGovernanceService for proposal management
 * - Consumed by API Gateway for access control decisions
 * - Stored in PostgreSQL with audit trails
 * - Connected to manufacturer API integration
 * =============================================================================
 */
export {};
//# sourceMappingURL=dao-templates.js.map
