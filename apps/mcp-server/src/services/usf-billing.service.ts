/**
 * USF Billing Service - Phase 5: Billing Integration
 *
 * Comprehensive billing service for Universal Service Factors that integrates
 * with work packets, invoicing, pay applications, and contract management.
 *
 * Features:
 * - Invoice generation from completed work packets
 * - Pay application lifecycle management
 * - Retention tracking and release
 * - Contract-based bonus/penalty calculations
 * - Period-based billing reconciliation
 * - Reputation-based rate adjustments
 *
 * @see .roadmap/schemas/usf/usf-work-packet.schema.json
 * @version 1.0.0
 */

import type {
  USFWorkPacket,
  USFFactors,
  USFPricingTier,
  PMURN,
  GraphMetadata,
} from '../types/pm.types.js';
import {
  calculateBillingAmount,
  calculateReputationMultiplier,
  calculateContractAdjustment,
  determinePricingTier,
  USF_PRICING_TIERS,
} from './usf.service.js';
import { buildURN, createEmptyGraphMetadata } from './pm-urn.utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Invoice status lifecycle
 */
export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'submitted'
  | 'partially_paid'
  | 'paid'
  | 'disputed'
  | 'cancelled';

/**
 * Pay application status lifecycle
 */
export type PayApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'closed';

/**
 * Billing line item for work packet
 */
export interface BillingLineItem {
  /** Work packet reference */
  workPacketUrn: PMURN;
  /** Description of work */
  description: string;
  /** Work type classification */
  workType?: string;
  /** Base rate used */
  baseRate: number;
  /** Pricing tier applied */
  pricingTier: USFPricingTier;
  /** Tier multiplier applied */
  tierMultiplier: number;
  /** Reputation multiplier applied */
  reputationMultiplier: number;
  /** Contract adjustment (bonus/penalty) */
  contractAdjustment: number;
  /** Subtotal before retention */
  subtotal: number;
  /** Retention percentage */
  retentionPercent: number;
  /** Retention amount withheld */
  retentionAmount: number;
  /** Net amount after retention */
  netAmount: number;
  /** USF scores at time of billing */
  usfScores: USFFactors & { composite: number };
  /** Variance details */
  variance?: {
    qualityVariance: number;
    costVariance: number;
    scheduleVariance: number;
  };
}

/**
 * USF Invoice entity
 */
export interface USFInvoice {
  /** URN identifier */
  $id: PMURN;
  /** Schema reference */
  $schema: 'https://luhtech.dev/schemas/usf/usf-invoice.schema.json';
  /** Schema version */
  schemaVersion: '3.0.0';
  /** Human-readable invoice ID */
  invoiceId: string;
  /** Project reference */
  projectId: string;
  /** Provider being invoiced */
  providerUrn: PMURN;
  /** Invoice status */
  status: InvoiceStatus;
  /** Billing period */
  billingPeriod: {
    startDate: string;
    endDate: string;
  };
  /** Line items */
  lineItems: BillingLineItem[];
  /** Invoice totals */
  totals: {
    /** Sum of all subtotals */
    grossAmount: number;
    /** Total contract adjustments */
    adjustmentsAmount: number;
    /** Total retention withheld */
    retentionAmount: number;
    /** Net payable amount */
    netAmount: number;
    /** Currency code */
    currency: string;
  };
  /** Pay application reference if submitted */
  payApplicationRef?: PMURN;
  /** Contract reference */
  contractRef?: PMURN;
  /** Notes/comments */
  notes?: string;
  /** Audit trail */
  auditTrail: Array<{
    action: string;
    performedBy?: PMURN;
    timestamp: string;
    details?: string;
  }>;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  paidAt?: string;
  /** Graph metadata */
  graphMetadata: GraphMetadata;
}

/**
 * Pay Application entity (AIA G702/G703 style)
 */
export interface USFPayApplication {
  /** URN identifier */
  $id: PMURN;
  /** Schema reference */
  $schema: 'https://luhtech.dev/schemas/usf/usf-pay-application.schema.json';
  /** Schema version */
  schemaVersion: '3.0.0';
  /** Human-readable pay application ID */
  payApplicationId: string;
  /** Application number in sequence */
  applicationNumber: number;
  /** Project reference */
  projectId: string;
  /** Status */
  status: PayApplicationStatus;
  /** Period covered */
  periodTo: string;
  /** Contract reference */
  contractRef?: PMURN;
  /** Summary of work completed */
  schedule: {
    /** Original contract sum */
    originalContractSum: number;
    /** Net change by change orders */
    netChangeOrders: number;
    /** Contract sum to date */
    contractSumToDate: number;
    /** Total completed and stored to date */
    totalCompletedToDate: number;
    /** Retention percentage */
    retentionPercent: number;
    /** Total retention */
    totalRetention: number;
    /** Total earned less retention */
    totalEarnedLessRetention: number;
    /** Less previous certificates */
    lessPreviousCertificates: number;
    /** Current payment due */
    currentPaymentDue: number;
    /** Balance to finish plus retention */
    balanceToFinish: number;
  };
  /** Invoices included */
  invoiceRefs: PMURN[];
  /** Work packets included */
  workPacketRefs: PMURN[];
  /** USF Performance summary */
  usfPerformanceSummary: {
    averageQuality: number;
    averageCost: number;
    averageSpeed: number;
    averageComposite: number;
    workPacketCount: number;
    bonusEarned: number;
    penaltiesApplied: number;
  };
  /** Certifications */
  certifications?: {
    contractorCertified?: {
      date: string;
      signature?: string;
    };
    architectCertified?: {
      date: string;
      signature?: string;
      certifiedAmount: number;
    };
    ownerApproved?: {
      date: string;
      signature?: string;
    };
  };
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  /** Graph metadata */
  graphMetadata: GraphMetadata;
}

/**
 * Retention release record
 */
export interface RetentionRelease {
  /** URN identifier */
  $id: PMURN;
  /** Pay application reference */
  payApplicationRef: PMURN;
  /** Original retention amount */
  originalAmount: number;
  /** Amount released */
  releasedAmount: number;
  /** Remaining retention */
  remainingAmount: number;
  /** Release percentage */
  releasePercent: number;
  /** Release reason */
  reason: 'milestone_completion' | 'substantial_completion' | 'final_completion' | 'partial_release';
  /** Milestone reference if applicable */
  milestoneRef?: PMURN;
  /** Approval */
  approvedBy?: PMURN;
  /** Timestamps */
  createdAt: string;
  releasedAt?: string;
}

/**
 * Billing reconciliation report
 */
export interface BillingReconciliation {
  /** Project ID */
  projectId: string;
  /** Period */
  period: {
    startDate: string;
    endDate: string;
  };
  /** Provider URN */
  providerUrn: PMURN;
  /** Summary statistics */
  summary: {
    totalWorkPackets: number;
    completedWorkPackets: number;
    invoicedWorkPackets: number;
    paidWorkPackets: number;
    disputedWorkPackets: number;
  };
  /** Financial summary */
  financials: {
    totalBilled: number;
    totalPaid: number;
    totalPending: number;
    totalDisputed: number;
    totalRetentionHeld: number;
    totalRetentionReleased: number;
    totalBonuses: number;
    totalPenalties: number;
    netAdjustments: number;
  };
  /** USF performance across period */
  performance: {
    averageQuality: number;
    averageCost: number;
    averageSpeed: number;
    averageComposite: number;
    qualityTrend: 'improving' | 'stable' | 'declining';
    costTrend: 'improving' | 'stable' | 'declining';
    speedTrend: 'improving' | 'stable' | 'declining';
  };
  /** Recommendations */
  recommendations: string[];
  /** Generated at */
  generatedAt: string;
}

/**
 * Contract billing terms
 */
export interface ContractBillingTerms {
  /** Contract reference */
  contractRef: PMURN;
  /** Base rate per hour/unit */
  baseRate: number;
  /** Currency */
  currency: string;
  /** Retention percentage */
  retentionPercent: number;
  /** Retention cap (max amount) */
  retentionCap?: number;
  /** Payment terms (days) */
  paymentTermsDays: number;
  /** Bonus thresholds */
  bonusThresholds: Array<{
    qualityMin: number;
    bonusPercent: number;
  }>;
  /** Penalty thresholds */
  penaltyThresholds: Array<{
    qualityMax: number;
    penaltyPercent: number;
  }>;
  /** Schedule incentive/disincentive */
  scheduleTerms?: {
    earlyCompletionBonusPerDay: number;
    lateCompletionPenaltyPerDay: number;
    maxBonus?: number;
    maxPenalty?: number;
  };
}

/**
 * Input for generating invoice from work packets
 */
export interface GenerateInvoiceInput {
  projectId: string;
  providerUrn: PMURN;
  workPacketUrns: PMURN[];
  billingPeriod: {
    startDate: string;
    endDate: string;
  };
  contractTerms?: Partial<ContractBillingTerms>;
}

/**
 * Input for creating pay application
 */
export interface CreatePayApplicationInput {
  projectId: string;
  invoiceUrns: PMURN[];
  periodTo: string;
  applicationNumber?: number;
  contractRef?: PMURN;
  previousCertificatesAmount?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default retention percentage
 */
export const DEFAULT_RETENTION_PERCENT = 10;

/**
 * Default payment terms (days)
 */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

/**
 * Standard bonus thresholds
 */
export const STANDARD_BONUS_THRESHOLDS = [
  { qualityMin: 0.95, bonusPercent: 5 },
  { qualityMin: 0.90, bonusPercent: 3 },
  { qualityMin: 0.85, bonusPercent: 1 },
];

/**
 * Standard penalty thresholds
 */
export const STANDARD_PENALTY_THRESHOLDS = [
  { qualityMax: 0.60, penaltyPercent: 10 },
  { qualityMax: 0.70, penaltyPercent: 5 },
  { qualityMax: 0.75, penaltyPercent: 2 },
];

// ============================================================================
// ID Generators
// ============================================================================

let invoiceIdCounter = 0;
let payApplicationIdCounter = 0;
let retentionReleaseIdCounter = 0;

export function generateInvoiceId(): string {
  invoiceIdCounter++;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(invoiceIdCounter).padStart(5, '0')}`;
}

export function generatePayApplicationId(): string {
  payApplicationIdCounter++;
  const year = new Date().getFullYear();
  return `PAY-${year}-${String(payApplicationIdCounter).padStart(4, '0')}`;
}

export function generateRetentionReleaseId(): string {
  retentionReleaseIdCounter++;
  const year = new Date().getFullYear();
  return `RET-${year}-${String(retentionReleaseIdCounter).padStart(4, '0')}`;
}

export function setBillingIdCounter(
  type: 'invoice' | 'pay-application' | 'retention-release',
  value: number
): void {
  if (type === 'invoice') {
    invoiceIdCounter = value;
  } else if (type === 'pay-application') {
    payApplicationIdCounter = value;
  } else {
    retentionReleaseIdCounter = value;
  }
}

// ============================================================================
// Core Billing Functions
// ============================================================================

/**
 * Calculate billing line item from completed work packet
 *
 * @param workPacket - Completed work packet
 * @param contractTerms - Contract billing terms
 * @returns Billing line item
 */
export function calculateBillingLineItem(
  workPacket: USFWorkPacket,
  contractTerms?: Partial<ContractBillingTerms>
): BillingLineItem {
  // Validate work packet is completed
  if (workPacket.status !== 'completed') {
    throw new Error(
      `Work packet ${workPacket.workPacketId} is not completed (status: ${workPacket.status})`
    );
  }

  // Get USF results or calculate from actuals
  const usfScores = workPacket.usfResults ?? {
    quality: workPacket.actuals?.qualityScore ?? 0.7,
    cost: 0.7,
    speed: 0.7,
    composite: 0.7,
  };

  // Ensure composite exists
  if (usfScores.composite === undefined) {
    usfScores.composite =
      usfScores.quality * 0.4 + usfScores.cost * 0.3 + usfScores.speed * 0.3;
  }

  // Determine pricing tier and multipliers
  const pricingTier = workPacket.pricingTier ?? determinePricingTier(usfScores.quality);
  const tierMultiplier = USF_PRICING_TIERS[pricingTier].costMultiplier;
  const reputationMultiplier = calculateReputationMultiplier(usfScores.composite);

  // Get base rate
  const baseRate =
    workPacket.billing?.baseRate ??
    contractTerms?.baseRate ??
    workPacket.targets.marketBenchmark ??
    100;

  // Calculate subtotal using core billing calculation
  const subtotal = calculateBillingAmount(
    baseRate,
    pricingTier,
    usfScores.composite,
    0 // We'll add contract adjustment separately
  );

  // Calculate contract adjustment (bonus/penalty)
  const bonusThresholds = contractTerms?.bonusThresholds ?? STANDARD_BONUS_THRESHOLDS;
  const penaltyThresholds = contractTerms?.penaltyThresholds ?? STANDARD_PENALTY_THRESHOLDS;

  let contractAdjustment = 0;

  // Check for bonus
  for (const threshold of bonusThresholds) {
    if (usfScores.quality >= threshold.qualityMin) {
      contractAdjustment = subtotal * (threshold.bonusPercent / 100);
      break;
    }
  }

  // Check for penalty (only if no bonus)
  if (contractAdjustment === 0) {
    for (const threshold of penaltyThresholds) {
      if (usfScores.quality <= threshold.qualityMax) {
        contractAdjustment = -subtotal * (threshold.penaltyPercent / 100);
        break;
      }
    }
  }

  // Add contract adjustment to subtotal
  const adjustedSubtotal = subtotal + contractAdjustment;

  // Calculate retention
  const retentionPercent = contractTerms?.retentionPercent ?? DEFAULT_RETENTION_PERCENT;
  const retentionAmount = adjustedSubtotal * (retentionPercent / 100);

  // Apply retention cap if specified
  const cappedRetention = contractTerms?.retentionCap
    ? Math.min(retentionAmount, contractTerms.retentionCap)
    : retentionAmount;

  const netAmount = adjustedSubtotal - cappedRetention;

  return {
    workPacketUrn: workPacket.$id,
    description: workPacket.description ?? `Work packet ${workPacket.workPacketId}`,
    workType: workPacket.workType,
    baseRate,
    pricingTier,
    tierMultiplier,
    reputationMultiplier,
    contractAdjustment,
    subtotal: adjustedSubtotal,
    retentionPercent,
    retentionAmount: cappedRetention,
    netAmount,
    usfScores: usfScores as USFFactors & { composite: number },
    variance: workPacket.variance
      ? {
          qualityVariance: workPacket.variance.qualityVariance ?? 0,
          costVariance: workPacket.variance.costVariance ?? 0,
          scheduleVariance: workPacket.variance.scheduleVariance ?? 0,
        }
      : undefined,
  };
}

/**
 * Generate invoice from multiple completed work packets
 *
 * @param input - Invoice generation parameters
 * @param workPackets - Map of work packet URNs to work packets
 * @returns Generated invoice
 */
export function generateInvoice(
  input: GenerateInvoiceInput,
  workPackets: Map<PMURN, USFWorkPacket>
): USFInvoice {
  const now = new Date().toISOString();
  const invoiceId = generateInvoiceId();

  // Calculate line items for each work packet
  const lineItems: BillingLineItem[] = [];
  for (const wpUrn of input.workPacketUrns) {
    const workPacket = workPackets.get(wpUrn);
    if (!workPacket) {
      throw new Error(`Work packet not found: ${wpUrn}`);
    }
    lineItems.push(calculateBillingLineItem(workPacket, input.contractTerms));
  }

  // Calculate totals
  const grossAmount = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
  const adjustmentsAmount = lineItems.reduce((sum, item) => sum + item.contractAdjustment, 0);
  const retentionAmount = lineItems.reduce((sum, item) => sum + item.retentionAmount, 0);
  const netAmount = lineItems.reduce((sum, item) => sum + item.netAmount, 0);

  const invoice: USFInvoice = {
    $id: buildURN(input.projectId, 'usf-work-packet', invoiceId) as PMURN, // Using work-packet type for compatibility
    $schema: 'https://luhtech.dev/schemas/usf/usf-invoice.schema.json',
    schemaVersion: '3.0.0',
    invoiceId,
    projectId: input.projectId,
    providerUrn: input.providerUrn,
    status: 'draft',
    billingPeriod: input.billingPeriod,
    lineItems,
    totals: {
      grossAmount,
      adjustmentsAmount,
      retentionAmount,
      netAmount,
      currency: input.contractTerms?.currency ?? 'USD',
    },
    contractRef: input.contractTerms?.contractRef,
    auditTrail: [
      {
        action: 'INVOICE_CREATED',
        timestamp: now,
        details: `Generated from ${lineItems.length} work packets`,
      },
    ],
    createdAt: now,
    updatedAt: now,
    graphMetadata: createEmptyGraphMetadata(),
  };

  return invoice;
}

/**
 * Submit invoice for approval
 *
 * @param invoice - Invoice to submit
 * @param submittedBy - URN of submitter
 * @returns Updated invoice
 */
export function submitInvoice(invoice: USFInvoice, submittedBy?: PMURN): USFInvoice {
  if (invoice.status !== 'draft') {
    throw new Error(`Cannot submit invoice in status: ${invoice.status}`);
  }

  const now = new Date().toISOString();

  return {
    ...invoice,
    status: 'pending_approval',
    submittedAt: now,
    updatedAt: now,
    auditTrail: [
      ...invoice.auditTrail,
      {
        action: 'INVOICE_SUBMITTED',
        performedBy: submittedBy,
        timestamp: now,
      },
    ],
  };
}

/**
 * Approve invoice
 *
 * @param invoice - Invoice to approve
 * @param approvedBy - URN of approver
 * @returns Updated invoice
 */
export function approveInvoice(invoice: USFInvoice, approvedBy: PMURN): USFInvoice {
  if (invoice.status !== 'pending_approval') {
    throw new Error(`Cannot approve invoice in status: ${invoice.status}`);
  }

  const now = new Date().toISOString();

  return {
    ...invoice,
    status: 'approved',
    updatedAt: now,
    auditTrail: [
      ...invoice.auditTrail,
      {
        action: 'INVOICE_APPROVED',
        performedBy: approvedBy,
        timestamp: now,
      },
    ],
  };
}

// ============================================================================
// Pay Application Functions
// ============================================================================

/**
 * Create pay application from approved invoices
 *
 * @param input - Pay application creation parameters
 * @param invoices - Map of invoice URNs to invoices
 * @param previousApplications - Previous pay applications for this contract
 * @returns Pay application
 */
export function createPayApplication(
  input: CreatePayApplicationInput,
  invoices: Map<PMURN, USFInvoice>,
  previousApplications: USFPayApplication[] = []
): USFPayApplication {
  const now = new Date().toISOString();
  const payApplicationId = generatePayApplicationId();

  // Validate invoices are approved
  const includedInvoices: USFInvoice[] = [];
  const workPacketRefs: PMURN[] = [];

  for (const invUrn of input.invoiceUrns) {
    const invoice = invoices.get(invUrn);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invUrn}`);
    }
    if (invoice.status !== 'approved') {
      throw new Error(`Invoice ${invoice.invoiceId} is not approved (status: ${invoice.status})`);
    }
    includedInvoices.push(invoice);
    for (const lineItem of invoice.lineItems) {
      workPacketRefs.push(lineItem.workPacketUrn);
    }
  }

  // Calculate application number
  const applicationNumber =
    input.applicationNumber ??
    (previousApplications.length > 0
      ? Math.max(...previousApplications.map((p) => p.applicationNumber)) + 1
      : 1);

  // Calculate schedule totals
  const totalCompletedToDate = includedInvoices.reduce(
    (sum, inv) => sum + inv.totals.grossAmount,
    0
  );
  const totalRetention = includedInvoices.reduce((sum, inv) => sum + inv.totals.retentionAmount, 0);
  const totalEarnedLessRetention = totalCompletedToDate - totalRetention;
  const lessPreviousCertificates = input.previousCertificatesAmount ?? 0;
  const currentPaymentDue = totalEarnedLessRetention - lessPreviousCertificates;

  // Calculate USF performance summary
  const allLineItems = includedInvoices.flatMap((inv) => inv.lineItems);
  const workPacketCount = allLineItems.length;

  const averageQuality =
    allLineItems.reduce((sum, li) => sum + li.usfScores.quality, 0) / workPacketCount;
  const averageCost =
    allLineItems.reduce((sum, li) => sum + li.usfScores.cost, 0) / workPacketCount;
  const averageSpeed =
    allLineItems.reduce((sum, li) => sum + li.usfScores.speed, 0) / workPacketCount;
  const averageComposite =
    allLineItems.reduce((sum, li) => sum + li.usfScores.composite, 0) / workPacketCount;

  const bonusEarned = allLineItems
    .filter((li) => li.contractAdjustment > 0)
    .reduce((sum, li) => sum + li.contractAdjustment, 0);
  const penaltiesApplied = allLineItems
    .filter((li) => li.contractAdjustment < 0)
    .reduce((sum, li) => sum + Math.abs(li.contractAdjustment), 0);

  // Default contract values (would come from contract in real implementation)
  const originalContractSum = totalCompletedToDate * 1.5; // Placeholder
  const netChangeOrders = 0;

  const payApplication: USFPayApplication = {
    $id: buildURN(input.projectId, 'usf-work-packet', payApplicationId) as PMURN,
    $schema: 'https://luhtech.dev/schemas/usf/usf-pay-application.schema.json',
    schemaVersion: '3.0.0',
    payApplicationId,
    applicationNumber,
    projectId: input.projectId,
    status: 'draft',
    periodTo: input.periodTo,
    contractRef: input.contractRef,
    schedule: {
      originalContractSum,
      netChangeOrders,
      contractSumToDate: originalContractSum + netChangeOrders,
      totalCompletedToDate,
      retentionPercent: DEFAULT_RETENTION_PERCENT,
      totalRetention,
      totalEarnedLessRetention,
      lessPreviousCertificates,
      currentPaymentDue,
      balanceToFinish: originalContractSum + netChangeOrders - totalCompletedToDate + totalRetention,
    },
    invoiceRefs: input.invoiceUrns,
    workPacketRefs,
    usfPerformanceSummary: {
      averageQuality,
      averageCost,
      averageSpeed,
      averageComposite,
      workPacketCount,
      bonusEarned,
      penaltiesApplied,
    },
    createdAt: now,
    updatedAt: now,
    graphMetadata: createEmptyGraphMetadata(),
  };

  return payApplication;
}

/**
 * Submit pay application
 *
 * @param payApplication - Pay application to submit
 * @param contractorCertification - Contractor certification details
 * @returns Updated pay application
 */
export function submitPayApplication(
  payApplication: USFPayApplication,
  contractorCertification: { date: string; signature?: string }
): USFPayApplication {
  if (payApplication.status !== 'draft') {
    throw new Error(`Cannot submit pay application in status: ${payApplication.status}`);
  }

  const now = new Date().toISOString();

  return {
    ...payApplication,
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
    certifications: {
      ...payApplication.certifications,
      contractorCertified: contractorCertification,
    },
  };
}

/**
 * Approve pay application (architect/owner)
 *
 * @param payApplication - Pay application to approve
 * @param certification - Architect certification
 * @returns Updated pay application
 */
export function approvePayApplication(
  payApplication: USFPayApplication,
  certification: { date: string; signature?: string; certifiedAmount: number }
): USFPayApplication {
  if (payApplication.status !== 'submitted') {
    throw new Error(`Cannot approve pay application in status: ${payApplication.status}`);
  }

  const now = new Date().toISOString();

  return {
    ...payApplication,
    status: 'approved',
    approvedAt: now,
    updatedAt: now,
    certifications: {
      ...payApplication.certifications,
      architectCertified: certification,
    },
  };
}

// ============================================================================
// Retention Functions
// ============================================================================

/**
 * Calculate retention release amount
 *
 * @param payApplication - Pay application with retention
 * @param releasePercent - Percentage of retention to release
 * @param reason - Reason for release
 * @returns Retention release record
 */
export function calculateRetentionRelease(
  payApplication: USFPayApplication,
  releasePercent: number,
  reason: RetentionRelease['reason']
): RetentionRelease {
  const now = new Date().toISOString();
  const releaseId = generateRetentionReleaseId();

  const originalAmount = payApplication.schedule.totalRetention;
  const releasedAmount = originalAmount * (releasePercent / 100);
  const remainingAmount = originalAmount - releasedAmount;

  return {
    $id: buildURN(payApplication.projectId, 'usf-work-packet', releaseId) as PMURN,
    payApplicationRef: payApplication.$id,
    originalAmount,
    releasedAmount,
    remainingAmount,
    releasePercent,
    reason,
    createdAt: now,
  };
}

// ============================================================================
// Reconciliation Functions
// ============================================================================

/**
 * Generate billing reconciliation report
 *
 * @param projectId - Project ID
 * @param providerUrn - Provider URN
 * @param period - Billing period
 * @param workPackets - Work packets for the period
 * @param invoices - Invoices for the period
 * @param payApplications - Pay applications for the period
 * @returns Billing reconciliation report
 */
export function generateBillingReconciliation(
  projectId: string,
  providerUrn: PMURN,
  period: { startDate: string; endDate: string },
  workPackets: USFWorkPacket[],
  invoices: USFInvoice[],
  payApplications: USFPayApplication[]
): BillingReconciliation {
  const now = new Date().toISOString();

  // Work packet summary
  const totalWorkPackets = workPackets.length;
  const completedWorkPackets = workPackets.filter((wp) => wp.status === 'completed').length;

  // Find invoiced and paid work packets
  const invoicedWorkPacketUrns = new Set(invoices.flatMap((inv) => inv.lineItems.map((li) => li.workPacketUrn)));
  const invoicedWorkPackets = workPackets.filter((wp) => invoicedWorkPacketUrns.has(wp.$id)).length;

  const paidWorkPacketUrns = new Set(
    invoices
      .filter((inv) => inv.status === 'paid')
      .flatMap((inv) => inv.lineItems.map((li) => li.workPacketUrn))
  );
  const paidWorkPackets = workPackets.filter((wp) => paidWorkPacketUrns.has(wp.$id)).length;

  const disputedWorkPacketUrns = new Set(
    invoices
      .filter((inv) => inv.status === 'disputed')
      .flatMap((inv) => inv.lineItems.map((li) => li.workPacketUrn))
  );
  const disputedWorkPackets = workPackets.filter((wp) => disputedWorkPacketUrns.has(wp.$id)).length;

  // Financial summary
  const totalBilled = invoices.reduce((sum, inv) => sum + inv.totals.netAmount, 0);
  const totalPaid = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.totals.netAmount, 0);
  const totalPending = invoices
    .filter((inv) => ['draft', 'pending_approval', 'approved', 'submitted'].includes(inv.status))
    .reduce((sum, inv) => sum + inv.totals.netAmount, 0);
  const totalDisputed = invoices
    .filter((inv) => inv.status === 'disputed')
    .reduce((sum, inv) => sum + inv.totals.netAmount, 0);

  const totalRetentionHeld = invoices.reduce((sum, inv) => sum + inv.totals.retentionAmount, 0);

  // Calculate retention released from pay applications
  const totalRetentionReleased = 0; // Would come from retention release records

  const totalBonuses = invoices
    .flatMap((inv) => inv.lineItems)
    .filter((li) => li.contractAdjustment > 0)
    .reduce((sum, li) => sum + li.contractAdjustment, 0);

  const totalPenalties = invoices
    .flatMap((inv) => inv.lineItems)
    .filter((li) => li.contractAdjustment < 0)
    .reduce((sum, li) => sum + Math.abs(li.contractAdjustment), 0);

  // USF performance
  const completedWithScores = workPackets.filter(
    (wp) => wp.status === 'completed' && wp.usfResults
  );
  const avgQuality =
    completedWithScores.length > 0
      ? completedWithScores.reduce((sum, wp) => sum + (wp.usfResults?.quality ?? 0), 0) /
        completedWithScores.length
      : 0;
  const avgCost =
    completedWithScores.length > 0
      ? completedWithScores.reduce((sum, wp) => sum + (wp.usfResults?.cost ?? 0), 0) /
        completedWithScores.length
      : 0;
  const avgSpeed =
    completedWithScores.length > 0
      ? completedWithScores.reduce((sum, wp) => sum + (wp.usfResults?.speed ?? 0), 0) /
        completedWithScores.length
      : 0;
  const avgComposite = avgQuality * 0.4 + avgCost * 0.3 + avgSpeed * 0.3;

  // Trend analysis (simplified - would compare to previous period)
  const qualityTrend: 'improving' | 'stable' | 'declining' =
    avgQuality >= 0.8 ? 'improving' : avgQuality >= 0.7 ? 'stable' : 'declining';
  const costTrend: 'improving' | 'stable' | 'declining' =
    avgCost >= 0.8 ? 'improving' : avgCost >= 0.7 ? 'stable' : 'declining';
  const speedTrend: 'improving' | 'stable' | 'declining' =
    avgSpeed >= 0.8 ? 'improving' : avgSpeed >= 0.7 ? 'stable' : 'declining';

  // Generate recommendations
  const recommendations: string[] = [];

  if (avgQuality < 0.75) {
    recommendations.push('Quality performance below target. Consider additional QA measures.');
  }
  if (totalPenalties > totalBonuses) {
    recommendations.push('Penalties exceed bonuses. Review contract compliance and work quality.');
  }
  if (disputedWorkPackets > 0) {
    recommendations.push(`${disputedWorkPackets} disputed work packets require resolution.`);
  }
  if (totalRetentionHeld > totalBilled * 0.15) {
    recommendations.push('High retention balance. Verify milestone completion for release eligibility.');
  }
  if (completedWorkPackets > invoicedWorkPackets) {
    recommendations.push(
      `${completedWorkPackets - invoicedWorkPackets} completed work packets pending invoicing.`
    );
  }

  return {
    projectId,
    period,
    providerUrn,
    summary: {
      totalWorkPackets,
      completedWorkPackets,
      invoicedWorkPackets,
      paidWorkPackets,
      disputedWorkPackets,
    },
    financials: {
      totalBilled,
      totalPaid,
      totalPending,
      totalDisputed,
      totalRetentionHeld,
      totalRetentionReleased,
      totalBonuses,
      totalPenalties,
      netAdjustments: totalBonuses - totalPenalties,
    },
    performance: {
      averageQuality: avgQuality,
      averageCost: avgCost,
      averageSpeed: avgSpeed,
      averageComposite: avgComposite,
      qualityTrend,
      costTrend,
      speedTrend,
    },
    recommendations,
    generatedAt: now,
  };
}

/**
 * Calculate projected billing for work in progress
 *
 * @param workPackets - Work packets (including in-progress)
 * @param contractTerms - Contract billing terms
 * @returns Projected billing amount
 */
export function calculateProjectedBilling(
  workPackets: USFWorkPacket[],
  contractTerms?: Partial<ContractBillingTerms>
): {
  completedAmount: number;
  inProgressAmount: number;
  totalProjected: number;
  breakdown: Array<{
    workPacketUrn: PMURN;
    status: string;
    projectedAmount: number;
  }>;
} {
  const breakdown: Array<{
    workPacketUrn: PMURN;
    status: string;
    projectedAmount: number;
  }> = [];

  let completedAmount = 0;
  let inProgressAmount = 0;

  for (const wp of workPackets) {
    let projectedAmount: number;

    if (wp.status === 'completed') {
      const lineItem = calculateBillingLineItem(wp, contractTerms);
      projectedAmount = lineItem.netAmount;
      completedAmount += projectedAmount;
    } else if (wp.status === 'in_progress') {
      // For in-progress, estimate based on targets
      const baseRate = contractTerms?.baseRate ?? wp.targets.marketBenchmark ?? 100;
      const tier = wp.pricingTier ?? 'standard';
      projectedAmount = baseRate * USF_PRICING_TIERS[tier].costMultiplier;
      inProgressAmount += projectedAmount;
    } else {
      projectedAmount = 0;
    }

    breakdown.push({
      workPacketUrn: wp.$id,
      status: wp.status,
      projectedAmount,
    });
  }

  return {
    completedAmount,
    inProgressAmount,
    totalProjected: completedAmount + inProgressAmount,
    breakdown,
  };
}

// ============================================================================
// Service Export
// ============================================================================

export const USFBillingService = {
  // Line item calculation
  calculateBillingLineItem,

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
};

export default USFBillingService;
