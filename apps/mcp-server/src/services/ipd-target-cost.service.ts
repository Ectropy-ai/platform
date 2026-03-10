/**
 * IPD Target Cost Dashboard Service - IPD-M3
 *
 * Implements Target Cost tracking, savings projections, and distribution
 * calculations for Integrated Project Delivery contracts.
 *
 * Key Features:
 * - Target cost record management
 * - Line item tracking with variance analysis
 * - Savings projection and distribution
 * - Dashboard data for visualization
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import {
  type TargetCostRecord,
  type TargetCostLineItem,
  type TargetCostAmendment,
  type SavingsProjection,
  type SavingsDistribution,
  type PartySavingsShare,
  type UpdateTargetCostInput,
  type CalculateSavingsInput,
  type TargetCostURN,
  type IPDServiceResult,
  TargetCostChangeType,
  SavingsDistributionTrigger,
  IPD_SCHEMA_VERSION,
} from '../types/ipd-governance.types.js';

// ============================================================================
// In-Memory Storage
// ============================================================================

/**
 * In-memory storage for target cost records
 * In production, this would be replaced with database storage
 */
const targetCostStore = new Map<string, TargetCostRecord>();

/**
 * Clear all target cost records (for testing)
 */
export function clearAllTargetCostRecords(): void {
  targetCostStore.clear();
}

// ============================================================================
// URN Builders
// ============================================================================

/**
 * Build a target cost URN
 */
export function buildTargetCostURN(projectId: string): TargetCostURN {
  return `urn:luhtech:ectropy:ipd:target-cost:${projectId}` as TargetCostURN;
}

// ============================================================================
// Types for Service
// ============================================================================

export interface CreateTargetCostInput {
  projectId: string;
  currency: string;
  originalTargetCost: number;
  contingencyAmount?: number;
  distributionConfig: {
    ownerSharePercent: number;
    designTeamSharePercent: number;
    constructionTeamSharePercent: number;
    partyShares: Array<{
      partyName: string;
      sharePercent: number;
    }>;
  };
}

export interface AddLineItemInput {
  category: string;
  description: string;
  originalAmount: number;
}

export interface UpdateLineItemInput {
  committedCost?: number;
  actualCost?: number;
  forecastToComplete?: number;
  currentAmount?: number;
}

export interface CostStatus {
  totalCommitted: number;
  totalActual: number;
  totalForecast: number;
  totalOriginal: number;
  percentComplete: number;
}

export interface VarianceData {
  targetCost: number;
  estimatedAtCompletion: number;
  variance: number;
  variancePercent: number;
}

export interface EACData {
  eac: number;
  projectedSavings: number;
  targetCost: number;
}

export interface DashboardData {
  summary: {
    targetCost: number;
    originalTargetCost: number;
    committedCost: number;
    actualCost: number;
    forecastToComplete: number;
    estimatedAtCompletion: number;
    variance: number;
    variancePercent: number;
    contingencyRemaining: number;
  };
  healthStatus: 'on_track' | 'at_risk' | 'over_budget' | 'under_budget';
  categoryBreakdown: Array<{
    category: string;
    originalAmount: number;
    currentAmount: number;
    actualCost: number;
    variance: number;
    status: string;
  }>;
  savingsProjection: {
    projectedSavings: number;
    confidence: number;
  };
}

export interface TrendData {
  targetCostLine: number;
  actualCostLine: number[];
  forecastLine: number[];
  timestamps: string[];
}

export interface PartyShareSummary {
  parties: Array<{
    partyName: string;
    sharePercent: number;
    projectedSavings: number;
  }>;
  totalSharePercent: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique line item ID
 */
function generateLineItemId(): string {
  return `LI-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Determine line item status based on variance
 */
function determineLineItemStatus(
  originalAmount: number,
  actualCost: number,
  forecastToComplete: number
): 'on_track' | 'at_risk' | 'over_budget' | 'under_budget' {
  const eac = actualCost + forecastToComplete;
  const variance = originalAmount - eac;
  const variancePercent = originalAmount > 0 ? variance / originalAmount : 0;

  if (variancePercent < -0.1) {
    return 'over_budget';
  } else if (variancePercent < -0.05) {
    return 'at_risk';
  } else if (variancePercent > 0.05) {
    return 'under_budget';
  }
  return 'on_track';
}

// ============================================================================
// Target Cost Record Management
// ============================================================================

/**
 * Create a new target cost record
 */
export async function createTargetCostRecord(
  input: CreateTargetCostInput
): Promise<IPDServiceResult<TargetCostRecord>> {
  const now = new Date().toISOString();
  const urn = buildTargetCostURN(input.projectId);

  // Default contingency to 5% if not specified
  const contingencyAmount = input.contingencyAmount ?? input.originalTargetCost * 0.05;

  const record: TargetCostRecord = {
    $id: urn,
    $schema: 'urn:luhtech:ectropy:schema:ipd-target-cost',
    schemaVersion: IPD_SCHEMA_VERSION,
    meta: {
      projectId: input.projectId,
      sourceOfTruth: 'ipd-target-cost-service',
      lastUpdated: now,
    },
    projectId: input.projectId,
    currency: input.currency,
    originalTargetCost: input.originalTargetCost,
    currentTargetCost: input.originalTargetCost,
    lineItems: [],
    amendments: [],
    committedCost: 0,
    actualCost: 0,
    forecastToComplete: 0,
    estimatedAtCompletion: 0,
    currentVariance: 0,
    contingencyRemaining: contingencyAmount,
    savingsProjections: [],
    distributionConfig: input.distributionConfig,
    distributions: [],
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
    graphMetadata: {
      inEdges: [],
      outEdges: [],
    },
  };

  targetCostStore.set(input.projectId, record);

  return {
    success: true,
    data: record,
  };
}

/**
 * Get target cost record by project ID
 */
export async function getTargetCostRecord(
  projectId: string
): Promise<IPDServiceResult<TargetCostRecord>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  return {
    success: true,
    data: record,
  };
}

/**
 * Update target cost with an amendment
 */
export async function updateTargetCost(
  input: UpdateTargetCostInput
): Promise<IPDServiceResult<TargetCostRecord>> {
  const record = targetCostStore.get(input.projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${input.projectId} not found`,
    };
  }

  const now = new Date().toISOString();
  const newTotal = record.currentTargetCost + input.amountChange;

  // Create amendment
  const amendment: TargetCostAmendment = {
    id: `AMD-${Date.now()}`,
    changeType: input.changeType,
    description: input.description,
    amountChange: input.amountChange,
    newTotal,
    effectiveDate: now,
    approvedBySessionUrn: input.approvalSessionUrn,
    timestamp: now,
  };

  // Update record
  record.amendments.push(amendment);
  record.currentTargetCost = newTotal;
  record.meta.lastUpdated = now;
  record.timestamps.updatedAt = now;

  // Recalculate variance
  record.currentVariance = record.currentTargetCost - record.estimatedAtCompletion;

  targetCostStore.set(input.projectId, record);

  return {
    success: true,
    data: record,
  };
}

// ============================================================================
// Line Item Management
// ============================================================================

/**
 * Add a line item to target cost
 */
export async function addLineItem(
  projectId: string,
  input: AddLineItemInput
): Promise<IPDServiceResult<TargetCostRecord>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const lineItem: TargetCostLineItem = {
    id: generateLineItemId(),
    category: input.category,
    description: input.description,
    originalAmount: input.originalAmount,
    currentAmount: input.originalAmount,
    committedCost: 0,
    actualCost: 0,
    forecastToComplete: input.originalAmount,
    variance: 0,
    status: 'on_track',
  };

  record.lineItems.push(lineItem);
  record.meta.lastUpdated = new Date().toISOString();
  record.timestamps.updatedAt = new Date().toISOString();

  targetCostStore.set(projectId, record);

  return {
    success: true,
    data: record,
  };
}

/**
 * Update a line item
 */
export async function updateLineItem(
  projectId: string,
  lineItemId: string,
  input: UpdateLineItemInput
): Promise<IPDServiceResult<TargetCostRecord>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const lineItem = record.lineItems.find(li => li.id === lineItemId);
  if (!lineItem) {
    return {
      success: false,
      error: `Line item ${lineItemId} not found`,
    };
  }

  // Update fields
  if (input.committedCost !== undefined) {
    lineItem.committedCost = input.committedCost;
  }
  if (input.actualCost !== undefined) {
    lineItem.actualCost = input.actualCost;
  }
  if (input.forecastToComplete !== undefined) {
    lineItem.forecastToComplete = input.forecastToComplete;
  }
  if (input.currentAmount !== undefined) {
    lineItem.currentAmount = input.currentAmount;
  }

  // Calculate variance and status
  const eac = lineItem.actualCost + lineItem.forecastToComplete;
  lineItem.variance = lineItem.currentAmount - eac;
  lineItem.status = determineLineItemStatus(
    lineItem.currentAmount,
    lineItem.actualCost,
    lineItem.forecastToComplete
  );

  // Update record totals
  recalculateRecordTotals(record);

  record.meta.lastUpdated = new Date().toISOString();
  record.timestamps.updatedAt = new Date().toISOString();

  targetCostStore.set(projectId, record);

  return {
    success: true,
    data: record,
  };
}

/**
 * Recalculate record totals from line items
 */
function recalculateRecordTotals(record: TargetCostRecord): void {
  record.committedCost = record.lineItems.reduce((sum, li) => sum + li.committedCost, 0);
  record.actualCost = record.lineItems.reduce((sum, li) => sum + li.actualCost, 0);
  record.forecastToComplete = record.lineItems.reduce((sum, li) => sum + li.forecastToComplete, 0);
  record.estimatedAtCompletion = record.actualCost + record.forecastToComplete;
  record.currentVariance = record.currentTargetCost - record.estimatedAtCompletion;
}

/**
 * Get line items by category
 */
export async function getLineItemsByCategory(
  projectId: string,
  category: string
): Promise<IPDServiceResult<TargetCostLineItem[]>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const items = record.lineItems.filter(li => li.category === category);

  return {
    success: true,
    data: items,
  };
}

// ============================================================================
// Amendments
// ============================================================================

/**
 * Add an amendment (internal helper - same as updateTargetCost)
 */
export async function addAmendment(
  projectId: string,
  amendment: Omit<TargetCostAmendment, 'id' | 'timestamp' | 'newTotal'>
): Promise<IPDServiceResult<TargetCostRecord>> {
  return updateTargetCost({
    projectId,
    changeType: amendment.changeType,
    amountChange: amendment.amountChange,
    description: amendment.description,
    updatedByUserId: 'system',
    approvalSessionUrn: amendment.approvedBySessionUrn,
  });
}

/**
 * Get all amendments for a project
 */
export async function getAmendments(
  projectId: string
): Promise<IPDServiceResult<TargetCostAmendment[]>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  return {
    success: true,
    data: record.amendments,
  };
}

// ============================================================================
// Cost Calculations
// ============================================================================

/**
 * Calculate current cost status
 */
export async function calculateCurrentCostStatus(
  projectId: string
): Promise<IPDServiceResult<CostStatus>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const totalOriginal = record.lineItems.reduce((sum, li) => sum + li.originalAmount, 0);
  const totalCommitted = record.lineItems.reduce((sum, li) => sum + li.committedCost, 0);
  const totalActual = record.lineItems.reduce((sum, li) => sum + li.actualCost, 0);
  const totalForecast = record.lineItems.reduce((sum, li) => sum + li.forecastToComplete, 0);

  const percentComplete = totalOriginal > 0
    ? (totalActual / (totalActual + totalForecast)) * 100
    : 0;

  return {
    success: true,
    data: {
      totalCommitted,
      totalActual,
      totalForecast,
      totalOriginal,
      percentComplete,
    },
  };
}

/**
 * Calculate variance from target
 */
export async function calculateVariance(
  projectId: string
): Promise<IPDServiceResult<VarianceData>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const eac = record.actualCost + record.forecastToComplete;
  const variance = record.currentTargetCost - eac;
  const variancePercent = record.currentTargetCost > 0
    ? (variance / record.currentTargetCost) * 100
    : 0;

  return {
    success: true,
    data: {
      targetCost: record.currentTargetCost,
      estimatedAtCompletion: eac,
      variance,
      variancePercent,
    },
  };
}

/**
 * Calculate estimated at completion
 */
export async function calculateEstimatedAtCompletion(
  projectId: string
): Promise<IPDServiceResult<EACData>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const eac = record.lineItems.reduce(
    (sum, li) => sum + li.actualCost + li.forecastToComplete,
    0
  );

  const projectedSavings = record.currentTargetCost - eac;

  return {
    success: true,
    data: {
      eac,
      projectedSavings,
      targetCost: record.currentTargetCost,
    },
  };
}

// ============================================================================
// Savings Calculations
// ============================================================================

/**
 * Calculate savings projection
 */
export async function calculateSavingsProjection(
  input: CalculateSavingsInput
): Promise<IPDServiceResult<SavingsProjection>> {
  const record = targetCostStore.get(input.projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${input.projectId} not found`,
    };
  }

  const eac = record.lineItems.reduce(
    (sum, li) => sum + li.actualCost + li.forecastToComplete,
    0
  );

  const projectedSavings = record.currentTargetCost - eac;

  // Calculate confidence based on completion percentage
  const totalCost = record.lineItems.reduce((sum, li) => sum + li.actualCost + li.forecastToComplete, 0);
  const actualCost = record.lineItems.reduce((sum, li) => sum + li.actualCost, 0);
  const completionPercent = totalCost > 0 ? actualCost / totalCost : 0;

  // Confidence increases as project progresses
  const confidenceLevel = Math.min(0.95, 0.5 + completionPercent * 0.45);

  const projection: SavingsProjection = {
    projectionDate: input.asOfDate || new Date().toISOString(),
    targetCost: record.currentTargetCost,
    projectedFinalCost: eac,
    projectedSavings,
    confidenceLevel,
    methodology: input.methodology || 'Actual + Forecast to Complete',
    assumptions: [
      'Forecast to complete based on current commitments',
      'No major scope changes anticipated',
      'Current productivity rates maintained',
    ],
  };

  // Store projection
  record.savingsProjections.push(projection);
  targetCostStore.set(input.projectId, record);

  return {
    success: true,
    data: projection,
  };
}

/**
 * Project savings distribution
 */
export async function projectSavingsDistribution(
  projectId: string,
  savingsAmount: number
): Promise<IPDServiceResult<SavingsDistribution>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const partyShares: PartySavingsShare[] = record.distributionConfig.partyShares.map(party => ({
    partyName: party.partyName,
    organization: party.partyName,
    role: party.partyName.includes('Owner') ? 'Owner' :
          party.partyName.includes('Design') ? 'Designer' : 'Contractor',
    sharePercent: party.sharePercent,
    projectedAmount: Math.round((party.sharePercent / 100) * savingsAmount * 100) / 100,
  }));

  const distribution: SavingsDistribution = {
    id: `DIST-${Date.now()}`,
    triggerType: SavingsDistributionTrigger.SUBSTANTIAL_COMPLETION,
    distributionDate: new Date().toISOString(),
    totalSavings: savingsAmount,
    partyShares,
    status: 'projected',
  };

  return {
    success: true,
    data: distribution,
  };
}

/**
 * Get distribution history
 */
export async function getDistributionHistory(
  projectId: string
): Promise<IPDServiceResult<SavingsDistribution[]>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  return {
    success: true,
    data: record.distributions,
  };
}

// ============================================================================
// Dashboard
// ============================================================================

/**
 * Get comprehensive dashboard data
 */
export async function getTargetCostDashboard(
  projectId: string
): Promise<IPDServiceResult<DashboardData>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  // Calculate totals
  const committedCost = record.lineItems.reduce((sum, li) => sum + li.committedCost, 0);
  const actualCost = record.lineItems.reduce((sum, li) => sum + li.actualCost, 0);
  const forecastToComplete = record.lineItems.reduce((sum, li) => sum + li.forecastToComplete, 0);
  const eac = actualCost + forecastToComplete;
  const variance = record.currentTargetCost - eac;
  const variancePercent = record.currentTargetCost > 0
    ? (variance / record.currentTargetCost) * 100
    : 0;

  // Determine health status
  let healthStatus: 'on_track' | 'at_risk' | 'over_budget' | 'under_budget';
  if (variancePercent < -10) {
    healthStatus = 'over_budget';
  } else if (variancePercent < -5) {
    healthStatus = 'at_risk';
  } else if (variancePercent > 5) {
    healthStatus = 'under_budget';
  } else {
    healthStatus = 'on_track';
  }

  // Build category breakdown
  const categoryMap = new Map<string, {
    originalAmount: number;
    currentAmount: number;
    actualCost: number;
    variance: number;
    status: string;
  }>();

  for (const item of record.lineItems) {
    const existing = categoryMap.get(item.category);
    if (existing) {
      existing.originalAmount += item.originalAmount;
      existing.currentAmount += item.currentAmount;
      existing.actualCost += item.actualCost;
      existing.variance += item.variance;
    } else {
      categoryMap.set(item.category, {
        originalAmount: item.originalAmount,
        currentAmount: item.currentAmount,
        actualCost: item.actualCost,
        variance: item.variance,
        status: item.status,
      });
    }
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    ...data,
  }));

  // Calculate savings projection
  const completionPercent = eac > 0 ? actualCost / eac : 0;
  const confidence = Math.min(0.95, 0.5 + completionPercent * 0.45);

  const dashboard: DashboardData = {
    summary: {
      targetCost: record.currentTargetCost,
      originalTargetCost: record.originalTargetCost,
      committedCost,
      actualCost,
      forecastToComplete,
      estimatedAtCompletion: eac,
      variance,
      variancePercent,
      contingencyRemaining: record.contingencyRemaining,
    },
    healthStatus,
    categoryBreakdown,
    savingsProjection: {
      projectedSavings: variance,
      confidence,
    },
  };

  return {
    success: true,
    data: dashboard,
  };
}

/**
 * Get cost trend data for visualization
 */
export async function getCostTrendData(
  projectId: string
): Promise<IPDServiceResult<TrendData>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  // For now, return simple trend data
  // In production, this would aggregate historical snapshots
  const trendData: TrendData = {
    targetCostLine: record.currentTargetCost,
    actualCostLine: [record.actualCost],
    forecastLine: [record.actualCost + record.forecastToComplete],
    timestamps: [new Date().toISOString()],
  };

  return {
    success: true,
    data: trendData,
  };
}

/**
 * Get party share summary
 */
export async function getPartyShareSummary(
  projectId: string
): Promise<IPDServiceResult<PartyShareSummary>> {
  const record = targetCostStore.get(projectId);

  if (!record) {
    return {
      success: false,
      error: `Target cost record for project ${projectId} not found`,
    };
  }

  const projectedSavings = record.currentTargetCost - record.estimatedAtCompletion;

  const parties = record.distributionConfig.partyShares.map(party => ({
    partyName: party.partyName,
    sharePercent: party.sharePercent,
    projectedSavings: Math.round((party.sharePercent / 100) * projectedSavings * 100) / 100,
  }));

  const totalSharePercent = parties.reduce((sum, p) => sum + p.sharePercent, 0);

  return {
    success: true,
    data: {
      parties,
      totalSharePercent,
    },
  };
}

// ============================================================================
// Service Export
// ============================================================================

/**
 * IPD Target Cost Service namespace
 */
export const IPDTargetCostService = {
  // Record Management
  createTargetCostRecord,
  getTargetCostRecord,
  updateTargetCost,

  // Line Items
  addLineItem,
  updateLineItem,
  getLineItemsByCategory,

  // Amendments
  addAmendment,
  getAmendments,

  // Calculations
  calculateCurrentCostStatus,
  calculateVariance,
  calculateEstimatedAtCompletion,

  // Savings
  calculateSavingsProjection,
  projectSavingsDistribution,
  getDistributionHistory,

  // Dashboard
  getTargetCostDashboard,
  getCostTrendData,
  getPartyShareSummary,

  // Utilities
  buildTargetCostURN,
  clearAllTargetCostRecords,
};

export default IPDTargetCostService;
