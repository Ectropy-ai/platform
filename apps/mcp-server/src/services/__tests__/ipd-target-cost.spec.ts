/**
 * IPD Target Cost Dashboard Service Tests - IPD-M3
 *
 * Test-first development for IPD Target Cost tracking functionality.
 * Tests target cost management, savings projections, and distribution calculations.
 *
 * @see .roadmap/features/ipd-governance/FEATURE.json
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';

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
  TargetCostChangeType,
  SavingsDistributionTrigger,
} from '../../types/ipd-governance.types.js';

// Import the service (to be implemented)
import {
  // Target Cost Management
  createTargetCostRecord,
  getTargetCostRecord,
  updateTargetCost,
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

  // Service namespace
  IPDTargetCostService,
} from '../ipd-target-cost.service.js';

// ============================================================================
// Mock Data
// ============================================================================

const mockProjectId = 'PROJ-TC-001';

const mockLineItems: TargetCostLineItem[] = [
  {
    id: 'LI-001',
    category: 'General Conditions',
    description: 'Site supervision and management',
    originalAmount: 500000,
    currentAmount: 520000,
    committedCost: 480000,
    actualCost: 350000,
    forecastToComplete: 150000,
    variance: 20000,
    status: 'on_track',
  },
  {
    id: 'LI-002',
    category: 'Concrete',
    description: 'Foundation and structural concrete',
    originalAmount: 1200000,
    currentAmount: 1200000,
    committedCost: 1100000,
    actualCost: 800000,
    forecastToComplete: 320000,
    variance: -20000,
    status: 'at_risk',
  },
  {
    id: 'LI-003',
    category: 'Steel',
    description: 'Structural steel fabrication and erection',
    originalAmount: 800000,
    currentAmount: 750000,
    committedCost: 700000,
    actualCost: 600000,
    forecastToComplete: 80000,
    variance: -30000,
    status: 'under_budget',
  },
];

const mockDistributionConfig = {
  ownerSharePercent: 40,
  designTeamSharePercent: 30,
  constructionTeamSharePercent: 30,
  partyShares: [
    { partyName: 'Owner Corp', sharePercent: 40 },
    { partyName: 'Design Partners', sharePercent: 30 },
    { partyName: 'BuildRight Inc', sharePercent: 30 },
  ],
};

// ============================================================================
// Target Cost Record Tests
// ============================================================================

describe('IPDTargetCostService', () => {
  beforeEach(() => {
    clearAllTargetCostRecords();
  });

  describe('Target Cost Record Management', () => {
    describe('createTargetCostRecord', () => {
      it('should create a new target cost record', async () => {
        const result = await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          contingencyAmount: 500000,
          distributionConfig: mockDistributionConfig,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.projectId).toBe(mockProjectId);
        expect(result.data?.originalTargetCost).toBe(10000000);
        expect(result.data?.currentTargetCost).toBe(10000000);
      });

      it('should generate proper URN', async () => {
        const result = await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        expect(result.success).toBe(true);
        expect(result.data?.$id).toContain('urn:luhtech:ectropy:ipd:target-cost');
        expect(result.data?.$id).toContain(mockProjectId);
      });

      it('should set contingency to 5% if not specified', async () => {
        const result = await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        expect(result.success).toBe(true);
        expect(result.data?.contingencyRemaining).toBe(500000); // 5% of 10M
      });
    });

    describe('getTargetCostRecord', () => {
      it('should retrieve target cost record by project ID', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await getTargetCostRecord(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.projectId).toBe(mockProjectId);
      });

      it('should return error for non-existent project', async () => {
        const result = await getTargetCostRecord('non-existent');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('updateTargetCost', () => {
      it('should update target cost with amendment', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await updateTargetCost({
          projectId: mockProjectId,
          changeType: TargetCostChangeType.AMENDMENT,
          amountChange: 500000,
          description: 'Approved scope addition',
          updatedByUserId: 'user-001',
        });

        expect(result.success).toBe(true);
        expect(result.data?.currentTargetCost).toBe(10500000);
        expect(result.data?.amendments.length).toBe(1);
      });

      it('should track amendment history', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        await updateTargetCost({
          projectId: mockProjectId,
          changeType: TargetCostChangeType.AMENDMENT,
          amountChange: 200000,
          description: 'Change order 1',
          updatedByUserId: 'user-001',
        });

        await updateTargetCost({
          projectId: mockProjectId,
          changeType: TargetCostChangeType.SCOPE_CHANGE,
          amountChange: 300000,
          description: 'Scope change 1',
          updatedByUserId: 'user-002',
        });

        const result = await getTargetCostRecord(mockProjectId);

        expect(result.data?.amendments.length).toBe(2);
        expect(result.data?.currentTargetCost).toBe(10500000);
      });
    });
  });

  // ============================================================================
  // Line Item Tests
  // ============================================================================

  describe('Line Item Management', () => {
    describe('addLineItem', () => {
      it('should add a line item to target cost', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await addLineItem(mockProjectId, {
          category: 'Concrete',
          description: 'Foundation work',
          originalAmount: 500000,
        });

        expect(result.success).toBe(true);
        expect(result.data?.lineItems.length).toBe(1);
        expect(result.data?.lineItems[0].category).toBe('Concrete');
      });

      it('should initialize line item with correct defaults', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await addLineItem(mockProjectId, {
          category: 'Steel',
          description: 'Structural steel',
          originalAmount: 800000,
        });

        expect(result.success).toBe(true);
        const lineItem = result.data?.lineItems[0];
        expect(lineItem?.currentAmount).toBe(800000);
        expect(lineItem?.committedCost).toBe(0);
        expect(lineItem?.actualCost).toBe(0);
        expect(lineItem?.status).toBe('on_track');
      });
    });

    describe('updateLineItem', () => {
      it('should update line item costs', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const addResult = await addLineItem(mockProjectId, {
          category: 'Concrete',
          description: 'Foundation',
          originalAmount: 500000,
        });

        const lineItemId = addResult.data?.lineItems[0].id;

        const result = await updateLineItem(mockProjectId, lineItemId!, {
          committedCost: 450000,
          actualCost: 200000,
          forecastToComplete: 260000,
        });

        expect(result.success).toBe(true);
        const lineItem = result.data?.lineItems.find(li => li.id === lineItemId);
        expect(lineItem?.committedCost).toBe(450000);
        expect(lineItem?.actualCost).toBe(200000);
      });

      it('should update status based on variance', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const addResult = await addLineItem(mockProjectId, {
          category: 'Concrete',
          description: 'Foundation',
          originalAmount: 500000,
        });

        const lineItemId = addResult.data?.lineItems[0].id;

        // Update to be over budget
        const result = await updateLineItem(mockProjectId, lineItemId!, {
          committedCost: 550000,
          actualCost: 400000,
          forecastToComplete: 180000,
        });

        expect(result.success).toBe(true);
        const lineItem = result.data?.lineItems.find(li => li.id === lineItemId);
        expect(lineItem?.status).toBe('over_budget');
      });
    });

    describe('getLineItemsByCategory', () => {
      it('should return line items filtered by category', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'Concrete', description: 'Foundation', originalAmount: 500000 });
        await addLineItem(mockProjectId, { category: 'Steel', description: 'Structural', originalAmount: 800000 });
        await addLineItem(mockProjectId, { category: 'Concrete', description: 'Slabs', originalAmount: 300000 });

        const result = await getLineItemsByCategory(mockProjectId, 'Concrete');

        expect(result.success).toBe(true);
        expect(result.data?.length).toBe(2);
        expect(result.data?.every(li => li.category === 'Concrete')).toBe(true);
      });
    });
  });

  // ============================================================================
  // Calculation Tests
  // ============================================================================

  describe('Cost Calculations', () => {
    describe('calculateCurrentCostStatus', () => {
      it('should calculate cost status from line items', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        // Add line items
        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 500000 });
        const addResult = await addLineItem(mockProjectId, { category: 'B', description: 'Item B', originalAmount: 300000 });

        // Update with costs
        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, { committedCost: 450000, actualCost: 200000 });
        await updateLineItem(mockProjectId, lineItems[1].id, { committedCost: 280000, actualCost: 150000 });

        const result = await calculateCurrentCostStatus(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.totalCommitted).toBe(730000);
        expect(result.data?.totalActual).toBe(350000);
      });
    });

    describe('calculateVariance', () => {
      it('should calculate variance from target', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 1000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 500000 });
        const addResult = await addLineItem(mockProjectId, { category: 'B', description: 'Item B', originalAmount: 500000 });

        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, {
          committedCost: 480000,
          actualCost: 400000,
          forecastToComplete: 80000
        });
        await updateLineItem(mockProjectId, lineItems[1].id, {
          committedCost: 520000,
          actualCost: 300000,
          forecastToComplete: 230000
        });

        const result = await calculateVariance(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.targetCost).toBe(1000000);
        expect(result.data?.variance).toBeDefined();
      });
    });

    describe('calculateEstimatedAtCompletion', () => {
      it('should calculate EAC from actuals and forecast', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 1000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 600000 });
        const addResult = await addLineItem(mockProjectId, { category: 'B', description: 'Item B', originalAmount: 400000 });

        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, {
          actualCost: 400000,
          forecastToComplete: 180000
        });
        await updateLineItem(mockProjectId, lineItems[1].id, {
          actualCost: 200000,
          forecastToComplete: 190000
        });

        const result = await calculateEstimatedAtCompletion(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.eac).toBe(970000); // 400k + 180k + 200k + 190k
        expect(result.data?.projectedSavings).toBe(30000); // 1M - 970k
      });
    });
  });

  // ============================================================================
  // Savings Tests
  // ============================================================================

  describe('Savings Calculations', () => {
    describe('calculateSavingsProjection', () => {
      it('should calculate savings projection', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 10000000 });
        const addResult = await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 0 });

        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, {
          actualCost: 6000000,
          forecastToComplete: 3500000
        });

        const result = await calculateSavingsProjection({
          projectId: mockProjectId,
        });

        expect(result.success).toBe(true);
        expect(result.data?.projectedSavings).toBe(500000); // 10M - 9.5M
        expect(result.data?.confidenceLevel).toBeGreaterThan(0);
      });

      it('should project negative savings (overrun)', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 1000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 1000000 });
        const addResult = await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 0 });

        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, {
          actualCost: 800000,
          forecastToComplete: 300000
        });

        const result = await calculateSavingsProjection({
          projectId: mockProjectId,
        });

        expect(result.success).toBe(true);
        expect(result.data?.projectedSavings).toBe(-100000); // 1M - 1.1M
      });
    });

    describe('projectSavingsDistribution', () => {
      it('should project distribution based on party shares', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await projectSavingsDistribution(mockProjectId, 1000000);

        expect(result.success).toBe(true);
        expect(result.data?.partyShares.length).toBe(3);

        const ownerShare = result.data?.partyShares.find(p => p.partyName === 'Owner Corp');
        expect(ownerShare?.projectedAmount).toBe(400000); // 40% of 1M

        const designShare = result.data?.partyShares.find(p => p.partyName === 'Design Partners');
        expect(designShare?.projectedAmount).toBe(300000); // 30% of 1M
      });

      it('should handle zero savings', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await projectSavingsDistribution(mockProjectId, 0);

        expect(result.success).toBe(true);
        expect(result.data?.partyShares.every(p => p.projectedAmount === 0)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Dashboard Tests
  // ============================================================================

  describe('Dashboard', () => {
    describe('getTargetCostDashboard', () => {
      it('should return comprehensive dashboard data', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          contingencyAmount: 500000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'A', description: 'Item A', originalAmount: 5000000 });
        const addResult = await addLineItem(mockProjectId, { category: 'B', description: 'Item B', originalAmount: 4500000 });

        const lineItems = addResult.data?.lineItems || [];
        await updateLineItem(mockProjectId, lineItems[0].id, {
          actualCost: 3000000,
          forecastToComplete: 1800000,
          committedCost: 4800000,
        });
        await updateLineItem(mockProjectId, lineItems[1].id, {
          actualCost: 2000000,
          forecastToComplete: 2400000,
          committedCost: 4400000,
        });

        const result = await getTargetCostDashboard(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.summary).toBeDefined();
        expect(result.data?.summary.targetCost).toBe(10000000);
        expect(result.data?.summary.committedCost).toBeDefined();
        expect(result.data?.summary.actualCost).toBeDefined();
        expect(result.data?.summary.estimatedAtCompletion).toBeDefined();
        expect(result.data?.healthStatus).toBeDefined();
      });

      it('should include category breakdown', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        await addLineItem(mockProjectId, { category: 'Concrete', description: 'Foundation', originalAmount: 1000000 });
        await addLineItem(mockProjectId, { category: 'Concrete', description: 'Slabs', originalAmount: 500000 });
        await addLineItem(mockProjectId, { category: 'Steel', description: 'Structural', originalAmount: 800000 });

        const result = await getTargetCostDashboard(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.categoryBreakdown).toBeDefined();
        expect(result.data?.categoryBreakdown.length).toBeGreaterThan(0);
      });
    });

    describe('getCostTrendData', () => {
      it('should return trend data for visualization', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await getCostTrendData(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.targetCostLine).toBeDefined();
        expect(result.data?.actualCostLine).toBeDefined();
      });
    });

    describe('getPartyShareSummary', () => {
      it('should return party share summary', async () => {
        await createTargetCostRecord({
          projectId: mockProjectId,
          currency: 'USD',
          originalTargetCost: 10000000,
          distributionConfig: mockDistributionConfig,
        });

        const result = await getPartyShareSummary(mockProjectId);

        expect(result.success).toBe(true);
        expect(result.data?.parties.length).toBe(3);
        expect(result.data?.totalSharePercent).toBe(100);
      });
    });
  });

  // ============================================================================
  // Utility Tests
  // ============================================================================

  describe('Utilities', () => {
    describe('buildTargetCostURN', () => {
      it('should build correct URN format', () => {
        const urn = buildTargetCostURN('PROJ-001');
        expect(urn).toBe('urn:luhtech:ectropy:ipd:target-cost:PROJ-001');
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration', () => {
    it('should complete full target cost lifecycle', async () => {
      // 1. Create record
      const createResult = await createTargetCostRecord({
        projectId: mockProjectId,
        currency: 'USD',
        originalTargetCost: 5000000,
        contingencyAmount: 250000,
        distributionConfig: mockDistributionConfig,
      });
      expect(createResult.success).toBe(true);

      // 2. Add line items
      await addLineItem(mockProjectId, { category: 'Labor', description: 'Direct labor', originalAmount: 2000000 });
      await addLineItem(mockProjectId, { category: 'Materials', description: 'Construction materials', originalAmount: 2500000 });
      await addLineItem(mockProjectId, { category: 'Equipment', description: 'Equipment rental', originalAmount: 500000 });

      // 3. Update costs
      const record = await getTargetCostRecord(mockProjectId);
      const lineItems = record.data?.lineItems || [];

      await updateLineItem(mockProjectId, lineItems[0].id, {
        actualCost: 1200000,
        forecastToComplete: 750000,
        committedCost: 1950000,
      });
      await updateLineItem(mockProjectId, lineItems[1].id, {
        actualCost: 1500000,
        forecastToComplete: 900000,
        committedCost: 2400000,
      });
      await updateLineItem(mockProjectId, lineItems[2].id, {
        actualCost: 300000,
        forecastToComplete: 180000,
        committedCost: 480000,
      });

      // 4. Calculate savings
      const savingsResult = await calculateSavingsProjection({ projectId: mockProjectId });
      expect(savingsResult.success).toBe(true);
      expect(savingsResult.data?.projectedSavings).toBeDefined();

      // 5. Get dashboard
      const dashboardResult = await getTargetCostDashboard(mockProjectId);
      expect(dashboardResult.success).toBe(true);
      expect(dashboardResult.data?.summary).toBeDefined();

      // 6. Project distribution
      const projectedSavings = savingsResult.data?.projectedSavings || 0;
      if (projectedSavings > 0) {
        const distributionResult = await projectSavingsDistribution(mockProjectId, projectedSavings);
        expect(distributionResult.success).toBe(true);
        expect(distributionResult.data?.partyShares.length).toBe(3);
      }
    });
  });
});
