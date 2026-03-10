/**
 * USF Billing MCP Tools - Phase 5: Billing Integration
 *
 * MCP tool definitions for Universal Service Factors billing operations.
 * Provides AI agent access to invoice generation, pay applications,
 * retention management, and billing reconciliation.
 *
 * @version 1.0.0
 */

// Use the simpler MCPToolDefinition from usf-tools (without required handler)
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    required?: string[];
    properties: Record<string, unknown>;
  };
}
import type {
  PMURN,
  USFWorkPacket,
  USFPricingTier,
} from '../types/pm.types.js';
import {
  USFBillingService,
  generateInvoice,
  submitInvoice,
  approveInvoice,
  createPayApplication,
  submitPayApplication,
  approvePayApplication,
  calculateRetentionRelease,
  generateBillingReconciliation,
  calculateProjectedBilling,
  calculateBillingLineItem,
  type USFInvoice,
  type USFPayApplication,
  type BillingLineItem,
  type BillingReconciliation,
  type ContractBillingTerms,
  type GenerateInvoiceInput,
  type CreatePayApplicationInput,
} from './usf-billing.service.js';

// ============================================================================
// In-Memory Storage (for demonstration - real impl uses database)
// ============================================================================

const invoiceStore = new Map<PMURN, USFInvoice>();
const payApplicationStore = new Map<PMURN, USFPayApplication>();
const workPacketStore = new Map<PMURN, USFWorkPacket>();

/**
 * Register a work packet in the billing store
 */
export function registerWorkPacketForBilling(workPacket: USFWorkPacket): void {
  workPacketStore.set(workPacket.$id, workPacket);
}

/**
 * Get all invoices
 */
export function getAllInvoices(): USFInvoice[] {
  return Array.from(invoiceStore.values());
}

/**
 * Get all pay applications
 */
export function getAllPayApplications(): USFPayApplication[] {
  return Array.from(payApplicationStore.values());
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * usf_generate_invoice - Generate invoice from completed work packets
 */
const usf_generate_invoice: MCPToolDefinition = {
  name: 'usf_generate_invoice',
  description:
    'Generate a billing invoice from one or more completed USF work packets. ' +
    'Calculates line items with tier-based pricing, reputation multipliers, ' +
    'contract bonuses/penalties, and retention withholding.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      providerUrn: {
        type: 'string',
        description: 'URN of the provider being invoiced',
      },
      workPacketUrns: {
        type: 'array',
        items: { type: 'string' },
        description: 'URNs of completed work packets to invoice',
      },
      billingPeriodStart: {
        type: 'string',
        format: 'date',
        description: 'Billing period start date (ISO 8601)',
      },
      billingPeriodEnd: {
        type: 'string',
        format: 'date',
        description: 'Billing period end date (ISO 8601)',
      },
      baseRate: {
        type: 'number',
        description: 'Base rate for billing calculation (optional)',
      },
      retentionPercent: {
        type: 'number',
        description: 'Retention percentage (default: 10%)',
      },
    },
    required: ['projectId', 'providerUrn', 'workPacketUrns', 'billingPeriodStart', 'billingPeriodEnd'],
  },
};

/**
 * usf_submit_invoice - Submit invoice for approval
 */
const usf_submit_invoice: MCPToolDefinition = {
  name: 'usf_submit_invoice',
  description:
    'Submit a draft invoice for approval. Changes status from draft to pending_approval.',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceUrn: {
        type: 'string',
        description: 'URN of the invoice to submit',
      },
      submittedBy: {
        type: 'string',
        description: 'URN of the submitter (optional)',
      },
    },
    required: ['invoiceUrn'],
  },
};

/**
 * usf_approve_invoice - Approve a pending invoice
 */
const usf_approve_invoice: MCPToolDefinition = {
  name: 'usf_approve_invoice',
  description:
    'Approve a pending invoice. Changes status from pending_approval to approved.',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceUrn: {
        type: 'string',
        description: 'URN of the invoice to approve',
      },
      approvedBy: {
        type: 'string',
        description: 'URN of the approver',
      },
    },
    required: ['invoiceUrn', 'approvedBy'],
  },
};

/**
 * usf_get_invoice - Retrieve invoice details
 */
const usf_get_invoice: MCPToolDefinition = {
  name: 'usf_get_invoice',
  description:
    'Retrieve details of a specific invoice including line items, totals, and audit trail.',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceUrn: {
        type: 'string',
        description: 'URN of the invoice to retrieve',
      },
    },
    required: ['invoiceUrn'],
  },
};

/**
 * usf_create_pay_application - Create pay application from approved invoices
 */
const usf_create_pay_application: MCPToolDefinition = {
  name: 'usf_create_pay_application',
  description:
    'Create a pay application (AIA G702/G703 style) from one or more approved invoices. ' +
    'Aggregates work completed, calculates retention, and generates USF performance summary.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      invoiceUrns: {
        type: 'array',
        items: { type: 'string' },
        description: 'URNs of approved invoices to include',
      },
      periodTo: {
        type: 'string',
        format: 'date',
        description: 'Period end date for the application',
      },
      applicationNumber: {
        type: 'integer',
        description: 'Application number in sequence (auto-calculated if not provided)',
      },
      contractRef: {
        type: 'string',
        description: 'Contract reference URN (optional)',
      },
      previousCertificatesAmount: {
        type: 'number',
        description: 'Total amount from previous certificates (default: 0)',
      },
    },
    required: ['projectId', 'invoiceUrns', 'periodTo'],
  },
};

/**
 * usf_submit_pay_application - Submit pay application with contractor certification
 */
const usf_submit_pay_application: MCPToolDefinition = {
  name: 'usf_submit_pay_application',
  description:
    'Submit a pay application with contractor certification for architect review.',
  inputSchema: {
    type: 'object',
    properties: {
      payApplicationUrn: {
        type: 'string',
        description: 'URN of the pay application to submit',
      },
      certificationDate: {
        type: 'string',
        format: 'date',
        description: 'Date of contractor certification',
      },
      signature: {
        type: 'string',
        description: 'Contractor signature (optional)',
      },
    },
    required: ['payApplicationUrn', 'certificationDate'],
  },
};

/**
 * usf_approve_pay_application - Approve pay application (architect/owner)
 */
const usf_approve_pay_application: MCPToolDefinition = {
  name: 'usf_approve_pay_application',
  description:
    'Approve a submitted pay application with architect certification.',
  inputSchema: {
    type: 'object',
    properties: {
      payApplicationUrn: {
        type: 'string',
        description: 'URN of the pay application to approve',
      },
      certificationDate: {
        type: 'string',
        format: 'date',
        description: 'Date of architect certification',
      },
      certifiedAmount: {
        type: 'number',
        description: 'Amount certified for payment',
      },
      signature: {
        type: 'string',
        description: 'Architect signature (optional)',
      },
    },
    required: ['payApplicationUrn', 'certificationDate', 'certifiedAmount'],
  },
};

/**
 * usf_release_retention - Release retention amount
 */
const usf_release_retention: MCPToolDefinition = {
  name: 'usf_release_retention',
  description:
    'Release a portion or all of retained funds upon milestone completion.',
  inputSchema: {
    type: 'object',
    properties: {
      payApplicationUrn: {
        type: 'string',
        description: 'URN of the pay application with retention',
      },
      releasePercent: {
        type: 'number',
        description: 'Percentage of retention to release (0-100)',
      },
      reason: {
        type: 'string',
        enum: ['milestone_completion', 'substantial_completion', 'final_completion', 'partial_release'],
        description: 'Reason for retention release',
      },
      approvedBy: {
        type: 'string',
        description: 'URN of the approver (optional)',
      },
    },
    required: ['payApplicationUrn', 'releasePercent', 'reason'],
  },
};

/**
 * usf_billing_reconciliation - Generate billing reconciliation report
 */
const usf_billing_reconciliation: MCPToolDefinition = {
  name: 'usf_billing_reconciliation',
  description:
    'Generate a comprehensive billing reconciliation report for a provider ' +
    'over a specified period. Includes financial summary, USF performance metrics, ' +
    'and recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      providerUrn: {
        type: 'string',
        description: 'URN of the provider',
      },
      periodStart: {
        type: 'string',
        format: 'date',
        description: 'Reconciliation period start date',
      },
      periodEnd: {
        type: 'string',
        format: 'date',
        description: 'Reconciliation period end date',
      },
    },
    required: ['projectId', 'providerUrn', 'periodStart', 'periodEnd'],
  },
};

/**
 * usf_projected_billing - Calculate projected billing for work in progress
 */
const usf_projected_billing: MCPToolDefinition = {
  name: 'usf_projected_billing',
  description:
    'Calculate projected billing amounts for work in progress and completed work packets.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project identifier',
      },
      providerUrn: {
        type: 'string',
        description: 'URN of the provider (optional - all if not specified)',
      },
      workPacketUrns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific work packets to project (optional - all if not specified)',
      },
      baseRate: {
        type: 'number',
        description: 'Base rate for projection (optional)',
      },
    },
    required: ['projectId'],
  },
};

/**
 * usf_calculate_line_item - Calculate billing for a single work packet
 */
const usf_calculate_line_item: MCPToolDefinition = {
  name: 'usf_calculate_line_item',
  description:
    'Calculate detailed billing line item for a single completed work packet. ' +
    'Shows tier multiplier, reputation adjustment, bonuses/penalties, and retention.',
  inputSchema: {
    type: 'object',
    properties: {
      workPacketUrn: {
        type: 'string',
        description: 'URN of the work packet to calculate',
      },
      baseRate: {
        type: 'number',
        description: 'Base rate override (optional)',
      },
      retentionPercent: {
        type: 'number',
        description: 'Retention percentage override (optional)',
      },
    },
    required: ['workPacketUrn'],
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All USF Billing MCP tools
 */
export const usfBillingTools: MCPToolDefinition[] = [
  usf_generate_invoice,
  usf_submit_invoice,
  usf_approve_invoice,
  usf_get_invoice,
  usf_create_pay_application,
  usf_submit_pay_application,
  usf_approve_pay_application,
  usf_release_retention,
  usf_billing_reconciliation,
  usf_projected_billing,
  usf_calculate_line_item,
];

/**
 * Get billing tool by name
 */
export function getUSFBillingToolByName(name: string): MCPToolDefinition | undefined {
  return usfBillingTools.find((tool) => tool.name === name);
}

/**
 * Get all billing tool names
 */
export function getUSFBillingToolNames(): string[] {
  return usfBillingTools.map((tool) => tool.name);
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handler for usf_generate_invoice
 */
export async function handleGenerateInvoice(input: {
  projectId: string;
  providerUrn: string;
  workPacketUrns: string[];
  billingPeriodStart: string;
  billingPeriodEnd: string;
  baseRate?: number;
  retentionPercent?: number;
}): Promise<{ success: boolean; invoice?: USFInvoice; error?: string }> {
  try {
    const invoiceInput: GenerateInvoiceInput = {
      projectId: input.projectId,
      providerUrn: input.providerUrn as PMURN,
      workPacketUrns: input.workPacketUrns as PMURN[],
      billingPeriod: {
        startDate: input.billingPeriodStart,
        endDate: input.billingPeriodEnd,
      },
      contractTerms: {
        baseRate: input.baseRate,
        retentionPercent: input.retentionPercent,
      },
    };

    const invoice = generateInvoice(invoiceInput, workPacketStore);
    invoiceStore.set(invoice.$id, invoice);

    return { success: true, invoice };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating invoice',
    };
  }
}

/**
 * Handler for usf_submit_invoice
 */
export async function handleSubmitInvoice(input: {
  invoiceUrn: string;
  submittedBy?: string;
}): Promise<{ success: boolean; invoice?: USFInvoice; error?: string }> {
  try {
    const invoice = invoiceStore.get(input.invoiceUrn as PMURN);
    if (!invoice) {
      return { success: false, error: `Invoice not found: ${input.invoiceUrn}` };
    }

    const updated = submitInvoice(invoice, input.submittedBy as PMURN | undefined);
    invoiceStore.set(updated.$id, updated);

    return { success: true, invoice: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error submitting invoice',
    };
  }
}

/**
 * Handler for usf_approve_invoice
 */
export async function handleApproveInvoice(input: {
  invoiceUrn: string;
  approvedBy: string;
}): Promise<{ success: boolean; invoice?: USFInvoice; error?: string }> {
  try {
    const invoice = invoiceStore.get(input.invoiceUrn as PMURN);
    if (!invoice) {
      return { success: false, error: `Invoice not found: ${input.invoiceUrn}` };
    }

    const updated = approveInvoice(invoice, input.approvedBy as PMURN);
    invoiceStore.set(updated.$id, updated);

    return { success: true, invoice: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error approving invoice',
    };
  }
}

/**
 * Handler for usf_get_invoice
 */
export async function handleGetInvoice(input: {
  invoiceUrn: string;
}): Promise<{ success: boolean; invoice?: USFInvoice; error?: string }> {
  const invoice = invoiceStore.get(input.invoiceUrn as PMURN);
  if (!invoice) {
    return { success: false, error: `Invoice not found: ${input.invoiceUrn}` };
  }
  return { success: true, invoice };
}

/**
 * Handler for usf_create_pay_application
 */
export async function handleCreatePayApplication(input: {
  projectId: string;
  invoiceUrns: string[];
  periodTo: string;
  applicationNumber?: number;
  contractRef?: string;
  previousCertificatesAmount?: number;
}): Promise<{ success: boolean; payApplication?: USFPayApplication; error?: string }> {
  try {
    const appInput: CreatePayApplicationInput = {
      projectId: input.projectId,
      invoiceUrns: input.invoiceUrns as PMURN[],
      periodTo: input.periodTo,
      applicationNumber: input.applicationNumber,
      contractRef: input.contractRef as PMURN | undefined,
      previousCertificatesAmount: input.previousCertificatesAmount,
    };

    const previousApps = Array.from(payApplicationStore.values()).filter(
      (app) => app.projectId === input.projectId
    );

    const payApplication = createPayApplication(appInput, invoiceStore, previousApps);
    payApplicationStore.set(payApplication.$id, payApplication);

    // Update invoices with pay application reference
    for (const invUrn of input.invoiceUrns) {
      const invoice = invoiceStore.get(invUrn as PMURN);
      if (invoice) {
        invoiceStore.set(invUrn as PMURN, {
          ...invoice,
          payApplicationRef: payApplication.$id,
          status: 'submitted',
        });
      }
    }

    return { success: true, payApplication };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating pay application',
    };
  }
}

/**
 * Handler for usf_submit_pay_application
 */
export async function handleSubmitPayApplication(input: {
  payApplicationUrn: string;
  certificationDate: string;
  signature?: string;
}): Promise<{ success: boolean; payApplication?: USFPayApplication; error?: string }> {
  try {
    const app = payApplicationStore.get(input.payApplicationUrn as PMURN);
    if (!app) {
      return { success: false, error: `Pay application not found: ${input.payApplicationUrn}` };
    }

    const updated = submitPayApplication(app, {
      date: input.certificationDate,
      signature: input.signature,
    });
    payApplicationStore.set(updated.$id, updated);

    return { success: true, payApplication: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error submitting pay application',
    };
  }
}

/**
 * Handler for usf_approve_pay_application
 */
export async function handleApprovePayApplication(input: {
  payApplicationUrn: string;
  certificationDate: string;
  certifiedAmount: number;
  signature?: string;
}): Promise<{ success: boolean; payApplication?: USFPayApplication; error?: string }> {
  try {
    const app = payApplicationStore.get(input.payApplicationUrn as PMURN);
    if (!app) {
      return { success: false, error: `Pay application not found: ${input.payApplicationUrn}` };
    }

    const updated = approvePayApplication(app, {
      date: input.certificationDate,
      certifiedAmount: input.certifiedAmount,
      signature: input.signature,
    });
    payApplicationStore.set(updated.$id, updated);

    return { success: true, payApplication: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error approving pay application',
    };
  }
}

/**
 * Handler for usf_release_retention
 */
export async function handleReleaseRetention(input: {
  payApplicationUrn: string;
  releasePercent: number;
  reason: 'milestone_completion' | 'substantial_completion' | 'final_completion' | 'partial_release';
  approvedBy?: string;
}): Promise<{
  success: boolean;
  release?: ReturnType<typeof calculateRetentionRelease>;
  error?: string;
}> {
  try {
    const app = payApplicationStore.get(input.payApplicationUrn as PMURN);
    if (!app) {
      return { success: false, error: `Pay application not found: ${input.payApplicationUrn}` };
    }

    const release = calculateRetentionRelease(app, input.releasePercent, input.reason);
    if (input.approvedBy) {
      release.approvedBy = input.approvedBy as PMURN;
    }

    return { success: true, release };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error releasing retention',
    };
  }
}

/**
 * Handler for usf_billing_reconciliation
 */
export async function handleBillingReconciliation(input: {
  projectId: string;
  providerUrn: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ success: boolean; reconciliation?: BillingReconciliation; error?: string }> {
  try {
    // Filter work packets, invoices, and pay applications for this provider and period
    const workPackets = Array.from(workPacketStore.values()).filter(
      (wp) => wp.projectId === input.projectId
    );

    const invoices = Array.from(invoiceStore.values()).filter(
      (inv) => inv.projectId === input.projectId && inv.providerUrn === input.providerUrn
    );

    const payApplications = Array.from(payApplicationStore.values()).filter(
      (app) => app.projectId === input.projectId
    );

    const reconciliation = generateBillingReconciliation(
      input.projectId,
      input.providerUrn as PMURN,
      { startDate: input.periodStart, endDate: input.periodEnd },
      workPackets,
      invoices,
      payApplications
    );

    return { success: true, reconciliation };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating reconciliation',
    };
  }
}

/**
 * Handler for usf_projected_billing
 */
export async function handleProjectedBilling(input: {
  projectId: string;
  providerUrn?: string;
  workPacketUrns?: string[];
  baseRate?: number;
}): Promise<{
  success: boolean;
  projection?: ReturnType<typeof calculateProjectedBilling>;
  error?: string;
}> {
  try {
    let workPackets: USFWorkPacket[];

    if (input.workPacketUrns && input.workPacketUrns.length > 0) {
      workPackets = input.workPacketUrns
        .map((urn) => workPacketStore.get(urn as PMURN))
        .filter((wp): wp is USFWorkPacket => wp !== undefined);
    } else {
      workPackets = Array.from(workPacketStore.values()).filter(
        (wp) => wp.projectId === input.projectId
      );
    }

    const projection = calculateProjectedBilling(workPackets, {
      baseRate: input.baseRate,
    });

    return { success: true, projection };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calculating projection',
    };
  }
}

/**
 * Handler for usf_calculate_line_item
 */
export async function handleCalculateLineItem(input: {
  workPacketUrn: string;
  baseRate?: number;
  retentionPercent?: number;
}): Promise<{ success: boolean; lineItem?: BillingLineItem; error?: string }> {
  try {
    const workPacket = workPacketStore.get(input.workPacketUrn as PMURN);
    if (!workPacket) {
      return { success: false, error: `Work packet not found: ${input.workPacketUrn}` };
    }

    const lineItem = calculateBillingLineItem(workPacket, {
      baseRate: input.baseRate,
      retentionPercent: input.retentionPercent,
    });

    return { success: true, lineItem };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calculating line item',
    };
  }
}

// ============================================================================
// Tool Handler Registry
// ============================================================================

/**
 * Billing tool handlers map
 */
export const usfBillingToolHandlers = {
  usf_generate_invoice: handleGenerateInvoice,
  usf_submit_invoice: handleSubmitInvoice,
  usf_approve_invoice: handleApproveInvoice,
  usf_get_invoice: handleGetInvoice,
  usf_create_pay_application: handleCreatePayApplication,
  usf_submit_pay_application: handleSubmitPayApplication,
  usf_approve_pay_application: handleApprovePayApplication,
  usf_release_retention: handleReleaseRetention,
  usf_billing_reconciliation: handleBillingReconciliation,
  usf_projected_billing: handleProjectedBilling,
  usf_calculate_line_item: handleCalculateLineItem,
};

/**
 * Execute a billing tool by name
 */
export async function executeUSFBillingTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const handler = usfBillingToolHandlers[toolName as keyof typeof usfBillingToolHandlers];
  if (!handler) {
    throw new Error(`Unknown billing tool: ${toolName}`);
  }
  return handler(input as never);
}
