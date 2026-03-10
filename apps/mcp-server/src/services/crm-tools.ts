/**
 * CRM Integration MCP Tools
 *
 * 6 agent-facing tools that expose CRM pipeline, customer health,
 * conversion metrics, sync operations, and lifecycle management
 * through the MCP tool protocol.
 *
 * Tools:
 *  1. read_customer_pipeline    - Pipeline stages and counts
 *  2. get_customer_health       - Health metrics for a customer/tenant
 *  3. get_conversion_metrics    - Funnel conversion rates
 *  4. sync_customer_to_crm      - Trigger CRM sync for a customer
 *  5. query_crm_sync_status     - Check CRM sync status
 *  6. manage_customer_lifecycle - Transition customer lifecycle stage
 *
 * @module services/crm-tools
 * @version 1.0.0
 */

import type { MCPToolDefinition } from './pm-decision-tools.js';
import type { PMToolResult } from '../types/pm.types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * CRM lifecycle stages matching the platform tenant lifecycle.
 */
type LifecycleStage =
  | 'WAITLIST'
  | 'EMAIL_SENT'
  | 'EMAIL_VERIFIED'
  | 'TRIAL'
  | 'TRIAL_EXPIRED'
  | 'PAID'
  | 'CHURNED'
  | 'REACTIVATED';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Build metadata with timing.
 */
function meta(startTime: number): PMToolResult<unknown>['metadata'] {
  return {
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Tool 1: read_customer_pipeline
// ============================================================================

const readCustomerPipelineTool: MCPToolDefinition = {
  name: 'read_customer_pipeline',
  description:
    'Read customer pipeline stages and counts. Returns a breakdown of customers across lifecycle stages with percentages. Optionally filter by stage or date range.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      stage: {
        type: 'string',
        enum: [
          'WAITLIST',
          'EMAIL_SENT',
          'EMAIL_VERIFIED',
          'TRIAL',
          'TRIAL_EXPIRED',
          'PAID',
          'CHURNED',
          'REACTIVATED',
        ],
        description:
          'Filter to a specific pipeline stage. If omitted, returns all stages.',
      },
      dateRange: {
        type: 'object',
        description: 'Filter by date range (ISO 8601 strings)',
        properties: {
          from: {
            type: 'string',
            description: 'Start date (ISO 8601)',
          },
          to: {
            type: 'string',
            description: 'End date (ISO 8601)',
          },
        },
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const stageFilter = args.stage as LifecycleStage | undefined;
      const dateRange = args.dateRange as
        | { from?: string; to?: string }
        | undefined;

      // Mock pipeline data — in production, this queries the platform DB
      const allStages: Array<{
        stage: LifecycleStage;
        count: number;
        percentage: number;
      }> = [
        { stage: 'WAITLIST', count: 142, percentage: 28.4 },
        { stage: 'EMAIL_SENT', count: 89, percentage: 17.8 },
        { stage: 'EMAIL_VERIFIED', count: 67, percentage: 13.4 },
        { stage: 'TRIAL', count: 53, percentage: 10.6 },
        { stage: 'TRIAL_EXPIRED', count: 31, percentage: 6.2 },
        { stage: 'PAID', count: 78, percentage: 15.6 },
        { stage: 'CHURNED', count: 28, percentage: 5.6 },
        { stage: 'REACTIVATED', count: 12, percentage: 2.4 },
      ];

      const stages = stageFilter
        ? allStages.filter((s) => s.stage === stageFilter)
        : allStages;

      const total = stages.reduce((sum, s) => sum + s.count, 0);

      return {
        success: true,
        data: {
          stages,
          total,
          dateRange: dateRange || null,
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'READ_CUSTOMER_PIPELINE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 2: get_customer_health
// ============================================================================

const getCustomerHealthTool: MCPToolDefinition = {
  name: 'get_customer_health',
  description:
    'Get health metrics for a customer or tenant. Returns a composite health score, weighted factors, and subscription details. Provide either tenantId or email (at least one required).',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      tenantId: {
        type: 'string',
        description: 'The tenant ID to look up',
      },
      email: {
        type: 'string',
        description: 'The customer email to look up',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const tenantId = args.tenantId as string | undefined;
      const email = args.email as string | undefined;

      if (!tenantId && !email) {
        return {
          success: false,
          error: {
            code: 'MISSING_IDENTIFIER',
            message:
              'At least one of tenantId or email is required to look up customer health',
          },
          metadata: meta(startTime),
        };
      }

      // Mock customer health data — in production, queries platform + CRM
      const resolvedEmail = email || `user-${tenantId}@example.com`;
      const resolvedTenantId = tenantId || `tenant-${Date.now()}`;

      return {
        success: true,
        data: {
          customer: {
            email: resolvedEmail,
            stage: 'PAID' as LifecycleStage,
            tenantId: resolvedTenantId,
          },
          health: {
            score: 82,
            factors: [
              { name: 'login_frequency', value: 0.85, weight: 0.25 },
              { name: 'feature_adoption', value: 0.72, weight: 0.20 },
              { name: 'support_tickets', value: 0.95, weight: 0.15 },
              { name: 'billing_health', value: 1.0, weight: 0.20 },
              { name: 'team_growth', value: 0.60, weight: 0.10 },
              { name: 'api_usage', value: 0.78, weight: 0.10 },
            ],
          },
          subscription: {
            tier: 'professional',
            startedAt: '2025-11-15T00:00:00.000Z',
            expiresAt: '2026-11-15T00:00:00.000Z',
          },
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_CUSTOMER_HEALTH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 3: get_conversion_metrics
// ============================================================================

const getConversionMetricsTool: MCPToolDefinition = {
  name: 'get_conversion_metrics',
  description:
    'Get funnel conversion rates across pipeline stages. Returns stage-to-stage conversion counts and rates, plus overall lead-to-conversion metrics. Optionally filter by date range or UTM source.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      dateRange: {
        type: 'object',
        description: 'Filter by date range (ISO 8601 strings)',
        properties: {
          from: {
            type: 'string',
            description: 'Start date (ISO 8601)',
          },
          to: {
            type: 'string',
            description: 'End date (ISO 8601)',
          },
        },
      },
      utmSource: {
        type: 'string',
        description:
          'Filter by UTM source attribution (e.g., "google", "linkedin", "referral")',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const dateRange = args.dateRange as
        | { from?: string; to?: string }
        | undefined;
      const utmSource = args.utmSource as string | undefined;

      // Mock funnel data — in production, aggregated from platform DB
      const funnel = [
        {
          fromStage: 'WAITLIST',
          toStage: 'EMAIL_SENT',
          count: 89,
          conversionRate: 62.7,
        },
        {
          fromStage: 'EMAIL_SENT',
          toStage: 'EMAIL_VERIFIED',
          count: 67,
          conversionRate: 75.3,
        },
        {
          fromStage: 'EMAIL_VERIFIED',
          toStage: 'TRIAL',
          count: 53,
          conversionRate: 79.1,
        },
        {
          fromStage: 'TRIAL',
          toStage: 'PAID',
          count: 38,
          conversionRate: 71.7,
        },
        {
          fromStage: 'CHURNED',
          toStage: 'REACTIVATED',
          count: 12,
          conversionRate: 42.9,
        },
      ];

      return {
        success: true,
        data: {
          funnel,
          overall: {
            totalLeads: 142,
            totalConversions: 78,
            rate: 54.9,
          },
          filters: {
            dateRange: dateRange || null,
            utmSource: utmSource || null,
          },
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_CONVERSION_METRICS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 4: sync_customer_to_crm
// ============================================================================

const syncCustomerToCrmTool: MCPToolDefinition = {
  name: 'sync_customer_to_crm',
  description:
    'Trigger a CRM sync for a customer record. Creates or updates a lead, contact, or company record in the external CRM system. In production, this calls the api-gateway CRM endpoint.',
  inputSchema: {
    type: 'object',
    required: ['email', 'syncType'],
    properties: {
      email: {
        type: 'string',
        description: 'Customer email address to sync',
      },
      syncType: {
        type: 'string',
        enum: ['lead', 'contact', 'company'],
        description: 'Type of CRM record to create or update',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const email = args.email as string;
      const syncType = args.syncType as 'lead' | 'contact' | 'company';

      if (!email) {
        return {
          success: false,
          error: {
            code: 'MISSING_EMAIL',
            message: 'email is required for CRM sync',
          },
          metadata: meta(startTime),
        };
      }

      if (!syncType) {
        return {
          success: false,
          error: {
            code: 'MISSING_SYNC_TYPE',
            message:
              'syncType is required (one of: lead, contact, company)',
          },
          metadata: meta(startTime),
        };
      }

      // NOTE: In production, this would HTTP call api-gateway CRM endpoint
      // e.g., POST /api/v1/crm/sync { email, syncType }
      const crmId = `crm-${Date.now()}`;
      const syncedAt = new Date().toISOString();

      return {
        success: true,
        data: {
          synced: true,
          syncType,
          email,
          crmId,
          syncedAt,
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_CUSTOMER_TO_CRM_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 5: query_crm_sync_status
// ============================================================================

const queryCrmSyncStatusTool: MCPToolDefinition = {
  name: 'query_crm_sync_status',
  description:
    'Check CRM sync status for customer records. Returns sync records with their CRM IDs, timestamps, and status. Filter by email, tenant, or only show failed syncs.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      email: {
        type: 'string',
        description: 'Filter by customer email',
      },
      tenantId: {
        type: 'string',
        description: 'Filter by tenant ID',
      },
      onlyFailed: {
        type: 'boolean',
        description:
          'Only return failed sync records (default: false)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const email = args.email as string | undefined;
      const tenantId = args.tenantId as string | undefined;
      const onlyFailed = (args.onlyFailed as boolean) ?? false;

      // Mock sync status data — in production, queries crm_sync_log table
      const allRecords = [
        {
          email: 'alice@construction.co',
          tenantId: 'tenant-001',
          crmLeadId: 'crm-lead-1001',
          crmContactId: 'crm-contact-2001',
          crmCompanyId: 'crm-company-3001',
          syncedAt: '2026-03-02T14:30:00.000Z',
          status: 'synced' as const,
        },
        {
          email: 'bob@builder.io',
          tenantId: 'tenant-002',
          crmLeadId: 'crm-lead-1002',
          crmContactId: null,
          crmCompanyId: null,
          syncedAt: '2026-03-01T09:15:00.000Z',
          status: 'partial' as const,
        },
        {
          email: 'carol@design.dev',
          tenantId: 'tenant-003',
          crmLeadId: null,
          crmContactId: null,
          crmCompanyId: null,
          syncedAt: '2026-02-28T22:00:00.000Z',
          status: 'failed' as const,
        },
      ];

      let records = allRecords;

      if (email) {
        records = records.filter((r) => r.email === email);
      }
      if (tenantId) {
        records = records.filter((r) => r.tenantId === tenantId);
      }
      if (onlyFailed) {
        records = records.filter((r) => r.status === 'failed');
      }

      return {
        success: true,
        data: {
          records,
          total: records.length,
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'QUERY_CRM_SYNC_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool 6: manage_customer_lifecycle
// ============================================================================

const manageCustomerLifecycleTool: MCPToolDefinition = {
  name: 'manage_customer_lifecycle',
  description:
    'Transition a customer to a new lifecycle stage. Records the stage change with a reason and returns the transition details. Valid stages: WAITLIST, EMAIL_SENT, EMAIL_VERIFIED, TRIAL, TRIAL_EXPIRED, PAID, CHURNED, REACTIVATED.',
  inputSchema: {
    type: 'object',
    required: ['email', 'newStage', 'reason'],
    properties: {
      email: {
        type: 'string',
        description: 'Customer email address',
      },
      newStage: {
        type: 'string',
        enum: [
          'WAITLIST',
          'EMAIL_SENT',
          'EMAIL_VERIFIED',
          'TRIAL',
          'TRIAL_EXPIRED',
          'PAID',
          'CHURNED',
          'REACTIVATED',
        ],
        description: 'The target lifecycle stage to transition to',
      },
      reason: {
        type: 'string',
        description:
          'Reason for the lifecycle transition (for audit trail)',
      },
    },
  },
  handler: async (args): Promise<PMToolResult<unknown>> => {
    const startTime = Date.now();
    try {
      const email = args.email as string;
      const newStage = args.newStage as LifecycleStage;
      const reason = args.reason as string;

      if (!email) {
        return {
          success: false,
          error: {
            code: 'MISSING_EMAIL',
            message: 'email is required for lifecycle transition',
          },
          metadata: meta(startTime),
        };
      }

      if (!newStage) {
        return {
          success: false,
          error: {
            code: 'MISSING_NEW_STAGE',
            message: 'newStage is required for lifecycle transition',
          },
          metadata: meta(startTime),
        };
      }

      if (!reason) {
        return {
          success: false,
          error: {
            code: 'MISSING_REASON',
            message: 'reason is required for lifecycle transition (audit trail)',
          },
          metadata: meta(startTime),
        };
      }

      // Mock: resolve previous stage — in production, queries customer record
      const previousStage: LifecycleStage = 'TRIAL';
      const transitionedAt = new Date().toISOString();

      return {
        success: true,
        data: {
          transitioned: true,
          email,
          previousStage,
          newStage,
          reason,
          transitionedAt,
        },
        metadata: meta(startTime),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MANAGE_CUSTOMER_LIFECYCLE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: meta(startTime),
      };
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All 6 CRM MCP tool definitions.
 */
export const crmTools: MCPToolDefinition[] = [
  readCustomerPipelineTool,
  getCustomerHealthTool,
  getConversionMetricsTool,
  syncCustomerToCrmTool,
  queryCrmSyncStatusTool,
  manageCustomerLifecycleTool,
];

/**
 * Find a CRM tool by name.
 */
export function getCrmToolByName(name: string): MCPToolDefinition | undefined {
  return crmTools.find((tool) => tool.name === name);
}

/**
 * Get all CRM tool names.
 */
export function getCrmToolNames(): string[] {
  return crmTools.map((tool) => tool.name);
}

/**
 * Register all CRM tools with a server.
 */
export function registerCrmTools(server: {
  registerTool: (_tool: MCPToolDefinition) => void;
}): void {
  for (const tool of crmTools) {
    server.registerTool(tool);
  }
}
