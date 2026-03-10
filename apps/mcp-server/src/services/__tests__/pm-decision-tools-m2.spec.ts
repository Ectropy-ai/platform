/**
 * PM Decision MCP Tools - M2 Tests
 *
 * Validates the 4 new M2 MCP tools for construction decision lifecycle management:
 * - navigate_decision_surface: BFS traversal for connected decisions/alerts
 * - apply_tolerance_override: Pre-approved tolerance variances (authority 2+)
 * - query_tolerance_overrides: Query overrides by voxel/type/trade
 * - complete_inspection: Record results and validate/fail decisions (authority 2+)
 *
 * @see .roadmap/features/decision-lifecycle/interfaces.json
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

// Import types
import {
  PMDecision,
  AuthorityLevel,
  PMDecisionStatus,
  ToleranceType,
  InspectionType,
  InspectionOutcome,
} from '../../types/pm.types.js';

// Import URN utilities
import {
  buildURN,
  generateDecisionId,
  generateInspectionId,
  generateVoxelId,
  resetAllIdCounters,
} from '../pm-urn.utils.js';

// Import tools
import { pmDecisionTools, getToolByName, getToolNames } from '../pm-decision-tools.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_PROJECT_ID = 'test-project-m2';
const TEST_DATA_DIR = join(
  process.cwd(),
  '.roadmap',
  'projects',
  TEST_PROJECT_ID
);

describe('PM Decision MCP Tools - M2', () => {
  beforeEach(() => {
    // Reset ID counters before each test
    resetAllIdCounters();

    // Create test data directory
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Initialize test collections
    initializeTestCollections();
  });

  afterEach(() => {
    // Cleanup test data
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function initializeTestCollections(): void {
    // Initialize empty decisions collection
    const decisionsPath = join(TEST_DATA_DIR, 'decisions.json');
    writeFileSync(
      decisionsPath,
      JSON.stringify(
        {
          $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:decisions`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/decisions.json`,
            lastUpdated: new Date().toISOString(),
            totalDecisions: 0,
          },
          indexes: { byStatus: {}, byVoxel: {}, byAuthorityLevel: {} },
          decisions: [],
        },
        null,
        2
      )
    );

    // Initialize empty voxels collection
    const voxelsPath = join(TEST_DATA_DIR, 'voxels.json');
    writeFileSync(
      voxelsPath,
      JSON.stringify(
        {
          $schema: 'https://luhtech.dev/schemas/pm/voxels-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:voxels`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/voxels.json`,
            lastUpdated: new Date().toISOString(),
            totalVoxels: 0,
          },
          indexes: { byStatus: {}, byLevel: {}, byZone: {} },
          voxels: [],
        },
        null,
        2
      )
    );

    // Initialize empty inspections collection
    const inspectionsPath = join(TEST_DATA_DIR, 'inspections.json');
    writeFileSync(
      inspectionsPath,
      JSON.stringify(
        {
          $schema: 'https://luhtech.dev/schemas/pm/inspections-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:inspections`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/inspections.json`,
            lastUpdated: new Date().toISOString(),
            totalInspections: 0,
          },
          indexes: { byStatus: {}, byType: {}, byVoxel: {} },
          inspections: [],
        },
        null,
        2
      )
    );

    // Initialize empty tolerance-overrides collection
    const tolerancePath = join(TEST_DATA_DIR, 'tolerance-overrides.json');
    writeFileSync(
      tolerancePath,
      JSON.stringify(
        {
          $schema:
            'https://luhtech.dev/schemas/pm/tolerance-overrides-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:tolerance-overrides`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/tolerance-overrides.json`,
            lastUpdated: new Date().toISOString(),
            totalOverrides: 0,
          },
          indexes: { byType: {}, byVoxel: {}, byStatus: {} },
          overrides: [],
        },
        null,
        2
      )
    );
  }

  // ============================================================================
  // Tool Registry Tests - M2 Tools
  // ============================================================================

  describe('Tool Registry - M2 Tools', () => {
    describe('pmDecisionTools', () => {
      it('should contain 21 total tools (17 spec + 4 legacy)', () => {
        expect(pmDecisionTools).toHaveLength(21);
      });

      it('should have all M2 tools', () => {
        const names = getToolNames();
        expect(names).toContain('navigate_decision_surface');
        expect(names).toContain('apply_tolerance_override');
        expect(names).toContain('query_tolerance_overrides');
        expect(names).toContain('complete_inspection');
      });
    });

    describe('navigate_decision_surface', () => {
      it('should be registered with correct schema', () => {
        const tool = getToolByName('navigate_decision_surface');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.required).toContain('projectId');
        expect(tool?.inputSchema.required).toContain('startVoxelId');
        expect(tool?.inputSchema.properties).toHaveProperty('direction');
        expect(tool?.inputSchema.properties).toHaveProperty('maxDepth');
        expect(tool?.inputSchema.properties).toHaveProperty('filterTrades');
      });
    });

    describe('apply_tolerance_override', () => {
      it('should be registered with correct schema', () => {
        const tool = getToolByName('apply_tolerance_override');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.required).toContain('projectId');
        expect(tool?.inputSchema.required).toContain('voxelId');
        expect(tool?.inputSchema.required).toContain('toleranceType');
        expect(tool?.inputSchema.required).toContain('standardValue');
        expect(tool?.inputSchema.required).toContain('approvedValue');
        expect(tool?.inputSchema.required).toContain('rationale');
        expect(tool?.inputSchema.required).toContain('sourceDecisionId');
      });
    });

    describe('query_tolerance_overrides', () => {
      it('should be registered with correct schema', () => {
        const tool = getToolByName('query_tolerance_overrides');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.required).toContain('projectId');
        expect(tool?.inputSchema.properties).toHaveProperty('voxelId');
        expect(tool?.inputSchema.properties).toHaveProperty('toleranceType');
        expect(tool?.inputSchema.properties).toHaveProperty('applicableTrade');
        expect(tool?.inputSchema.properties).toHaveProperty('includeExpired');
      });
    });

    describe('complete_inspection', () => {
      it('should be registered with correct schema', () => {
        const tool = getToolByName('complete_inspection');
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.required).toContain('projectId');
        expect(tool?.inputSchema.required).toContain('inspectionId');
        expect(tool?.inputSchema.required).toContain('inspectorId');
        expect(tool?.inputSchema.required).toContain('outcome');
        expect(tool?.inputSchema.required).toContain('findings');
        expect(tool?.inputSchema.properties).toHaveProperty('decisionsValidated');
        expect(tool?.inputSchema.properties).toHaveProperty('decisionsFailed');
        expect(tool?.inputSchema.properties).toHaveProperty('reinspectionRequired');
      });
    });
  });

  // ============================================================================
  // navigate_decision_surface Tests
  // ============================================================================

  describe('navigate_decision_surface Tool', () => {
    it('should return empty path when no voxels exist', async () => {
      const tool = getToolByName('navigate_decision_surface');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: 'VOX-L1-MECH-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.path).toHaveLength(1);
      expect(result.data?.decisions).toHaveLength(0);
      expect(result.data?.alerts).toHaveLength(0);
    });

    it('should include graph nodes and edges in output', async () => {
      const tool = getToolByName('navigate_decision_surface');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: 'VOX-L1-ELEC-001',
        direction: 'adjacent',
        maxDepth: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data?.graph).toBeDefined();
      expect(result.data?.graph.nodes).toBeDefined();
      expect(result.data?.graph.edges).toBeDefined();
    });

    it('should respect maxDepth parameter', async () => {
      const tool = getToolByName('navigate_decision_surface');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: 'VOX-B1-PLMB-001',
        maxDepth: 1,
      });

      expect(result.success).toBe(true);
      // With maxDepth 1, should only traverse 1 level deep
      expect(result.data?.path.length).toBeLessThanOrEqual(
        10 // Reasonable upper bound for 1-level traversal
      );
    });

    it('should filter by trades when specified', async () => {
      const tool = getToolByName('navigate_decision_surface');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: 'VOX-L2-MECH-001',
        filterTrades: ['HVAC', 'PLUMBING'],
      });

      expect(result.success).toBe(true);
      // Decisions should only include those with matching trades
      for (const decision of result.data?.decisions || []) {
        const trade = decision.voxelContext?.system;
        if (trade) {
          expect(['HVAC', 'PLUMBING', undefined]).toContain(trade);
        }
      }
    });
  });

  // ============================================================================
  // apply_tolerance_override Tests
  // ============================================================================

  describe('apply_tolerance_override Tool', () => {
    let sourceDecisionId: string;

    beforeEach(async () => {
      // Create a source decision first
      const captureTool = getToolByName('capture_decision');
      const result = await captureTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
        title: 'Wall flatness variance approval',
        type: 'APPROVAL',
        description: 'Approve minor wall flatness deviation',
        budgetImpact: 500,
      });

      sourceDecisionId = result.data?.decisionId;
    });

    it('should create a tolerance override successfully', async () => {
      const tool = getToolByName('apply_tolerance_override');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: {
          value: 0.125,
          unit: 'inches',
          tolerance: 0.0625,
        },
        approvedValue: {
          value: 0.25,
          unit: 'inches',
          tolerance: 0.125,
        },
        rationale:
          'Site conditions require additional tolerance for concealed mechanical space',
        sourceDecisionId: sourceDecisionId,
        applicableTrades: ['MECHANICAL', 'HVAC'],
      });

      expect(result.success).toBe(true);
      expect(result.data?.override).toBeDefined();
      expect(result.data?.override.toleranceType).toBe('WALL_FLATNESS');
      expect(result.data?.override.status).toBe('ACTIVE');
      expect(result.data?.voxel).toBeDefined();
      expect(result.data?.alertsCreated).toHaveLength(1);
    });

    it('should create override with expiration date', async () => {
      const tool = getToolByName('apply_tolerance_override');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L2-ELEC-005',
        toleranceType: 'EQUIPMENT_CLEARANCE',
        standardValue: { value: 36, unit: 'inches', tolerance: 2 },
        approvedValue: { value: 30, unit: 'inches', tolerance: 4 },
        rationale: 'Temporary variance for equipment staging area',
        sourceDecisionId: sourceDecisionId,
        expiresAt: expiresAt,
      });

      expect(result.success).toBe(true);
      expect(result.data?.override.expiresAt).toBe(expiresAt);
    });

    it('should include graph edges in output', async () => {
      const tool = getToolByName('apply_tolerance_override');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L3-FIRE-001',
        toleranceType: 'PIPE_SLOPE',
        standardValue: { value: 0.25, unit: 'inches/foot', tolerance: 0.0625 },
        approvedValue: { value: 0.1875, unit: 'inches/foot', tolerance: 0.0625 },
        rationale: 'Field conditions prevent standard slope',
        sourceDecisionId: sourceDecisionId,
      });

      expect(result.success).toBe(true);
      expect(result.data?.override.graphMetadata).toBeDefined();
      expect(result.data?.override.graphMetadata.inEdges.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // query_tolerance_overrides Tests
  // ============================================================================

  describe('query_tolerance_overrides Tool', () => {
    beforeEach(async () => {
      // Create source decision
      const captureTool = getToolByName('capture_decision');
      const decResult = await captureTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
        title: 'Test decision for overrides',
        type: 'APPROVAL',
      });

      const sourceDecisionId = decResult.data?.decisionId;

      // Create multiple tolerance overrides for testing
      const applyTool = getToolByName('apply_tolerance_override');

      await applyTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 0.125, unit: 'inches', tolerance: 0.0625 },
        approvedValue: { value: 0.25, unit: 'inches', tolerance: 0.125 },
        rationale: 'Override 1',
        sourceDecisionId: sourceDecisionId,
        applicableTrades: ['MECHANICAL'],
      });

      await applyTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
        toleranceType: 'CEILING_HEIGHT',
        standardValue: { value: 96, unit: 'inches', tolerance: 0.5 },
        approvedValue: { value: 94, unit: 'inches', tolerance: 1 },
        rationale: 'Override 2',
        sourceDecisionId: sourceDecisionId,
        applicableTrades: ['HVAC'],
      });

      await applyTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L2-ELEC-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: { value: 0.125, unit: 'inches', tolerance: 0.0625 },
        approvedValue: { value: 0.1875, unit: 'inches', tolerance: 0.09375 },
        rationale: 'Override 3',
        sourceDecisionId: sourceDecisionId,
      });
    });

    it('should query all overrides for a project', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(3);
      expect(result.data?.overrides).toHaveLength(3);
    });

    it('should filter by voxelId', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: 'VOX-L1-MECH-001',
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(2);
    });

    it('should filter by toleranceType', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        toleranceType: 'WALL_FLATNESS',
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(2);
    });

    it('should filter by applicable trade', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        applicableTrade: 'MECHANICAL',
      });

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(1);
    });

    it('should return counts by type', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data?.byType).toBeDefined();
      expect(result.data?.byType['WALL_FLATNESS']).toBe(2);
      expect(result.data?.byType['CEILING_HEIGHT']).toBe(1);
    });

    it('should exclude expired overrides by default', async () => {
      const tool = getToolByName('query_tolerance_overrides');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        includeExpired: false,
      });

      // All 3 overrides should be active (not expired)
      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(3);
    });
  });

  // ============================================================================
  // complete_inspection Tests
  // ============================================================================

  describe('complete_inspection Tool', () => {
    let testInspectionId: string;
    let testDecisionId: string;
    let testVoxelId: string;

    beforeEach(async () => {
      testVoxelId = 'VOX-L1-MECH-001';

      // Create a decision first
      const captureTool = getToolByName('capture_decision');
      const decResult = await captureTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: testVoxelId,
        title: 'Test decision for inspection',
        type: 'PROPOSAL',
        description: 'Decision requiring inspection validation',
      });
      testDecisionId = decResult.data?.decisionId;

      // Create an inspection
      const inspectionTool = getToolByName('request_inspection');
      const inspResult = await inspectionTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: testVoxelId,
        decisionId: testDecisionId,
        inspectionType: 'QUALITY',
        scheduledDate: new Date().toISOString(),
        notes: 'Quality inspection for mechanical work',
      });
      testInspectionId = inspResult.data?.inspectionId;
    });

    it('should complete inspection with PASSED outcome', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: testInspectionId,
        inspectorId: 'INSP-001',
        outcome: 'PASSED',
        findings: [
          {
            findingId: 'FND-001',
            description: 'All work meets specifications',
            severity: 'MINOR',
            requiresCorrection: false,
          },
        ],
        decisionsValidated: [testDecisionId],
      });

      expect(result.success).toBe(true);
      expect(result.data?.inspection.status).toBe('PASSED');
      expect(result.data?.inspection.outcome).toBe('PASSED');
      expect(result.data?.validatedDecisions).toHaveLength(1);
      expect(result.data?.validatedDecisions[0].status).toBe('APPROVED');
    });

    it('should complete inspection with FAILED outcome and create consequences', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: testInspectionId,
        inspectorId: 'INSP-002',
        outcome: 'FAILED',
        findings: [
          {
            findingId: 'FND-002',
            description: 'Pipe alignment exceeds tolerance',
            severity: 'MAJOR',
            location: 'Grid B-7 to B-9',
            requiresCorrection: true,
            correctionDeadline: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
        ],
        decisionsFailed: [testDecisionId],
        reinspectionRequired: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.inspection.status).toBe('FAILED');
      expect(result.data?.inspection.reinspectionRequired).toBe(true);
      expect(result.data?.failedDecisions).toHaveLength(1);
      expect(result.data?.failedDecisions[0].status).toBe('REJECTED');
      expect(result.data?.consequencesCreated.length).toBeGreaterThanOrEqual(1);
    });

    it('should complete inspection with CONDITIONAL outcome', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: testInspectionId,
        inspectorId: 'INSP-003',
        outcome: 'CONDITIONAL',
        findings: [
          {
            findingId: 'FND-003',
            description: 'Minor touch-up required on finish',
            severity: 'MINOR',
            requiresCorrection: true,
          },
        ],
        conditions: [
          'Complete touch-up within 48 hours',
          'Submit photos of completed work',
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.inspection.status).toBe('CONDITIONAL');
      expect(result.data?.inspection.conditions).toHaveLength(2);
    });

    it('should fail when inspection not found', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: 'INSP-9999-9999',
        inspectorId: 'INSP-001',
        outcome: 'PASSED',
        findings: [],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INSPECTION_NOT_FOUND');
    });

    it('should include graph edges in output', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: testInspectionId,
        inspectorId: 'INSP-004',
        outcome: 'PASSED',
        findings: [
          {
            findingId: 'FND-004',
            description: 'Pass',
            severity: 'MINOR',
            requiresCorrection: false,
          },
        ],
        decisionsValidated: [testDecisionId],
      });

      expect(result.success).toBe(true);
      expect(result.data?.graphEdges).toBeDefined();
      expect(result.data?.graphEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should record evidence attachments', async () => {
      const tool = getToolByName('complete_inspection');
      const result = await tool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: testInspectionId,
        inspectorId: 'INSP-005',
        outcome: 'PASSED',
        findings: [
          {
            findingId: 'FND-005',
            description: 'All clear',
            severity: 'MINOR',
            requiresCorrection: false,
          },
        ],
        evidence: [
          { type: 'photo', uri: 'file:///evidence/photo1.jpg' },
          { type: 'document', uri: 'file:///evidence/report.pdf' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.inspection.evidence).toHaveLength(2);
    });
  });

  // ============================================================================
  // Integration Tests - M2 Tools Workflow
  // ============================================================================

  describe('M2 Tools Integration', () => {
    it('should support full tolerance override workflow', async () => {
      const voxelId = 'VOX-L1-HVAC-001';

      // 1. Create a decision
      const captureTool = getToolByName('capture_decision');
      const decResult = await captureTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: voxelId,
        title: 'HVAC duct clearance variance',
        type: 'PROPOSAL',
        budgetImpact: 1500,
      });
      expect(decResult.success).toBe(true);
      const decisionId = decResult.data?.decisionId;

      // 2. Apply tolerance override
      const applyTool = getToolByName('apply_tolerance_override');
      const overrideResult = await applyTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: voxelId,
        toleranceType: 'DUCT_SIZE',
        standardValue: { value: 24, unit: 'inches', tolerance: 0.5 },
        approvedValue: { value: 22, unit: 'inches', tolerance: 1 },
        rationale: 'Structural interference requires smaller duct',
        sourceDecisionId: decisionId,
        applicableTrades: ['HVAC'],
      });
      expect(overrideResult.success).toBe(true);

      // 3. Query overrides for voxel
      const queryTool = getToolByName('query_tolerance_overrides');
      const queryResult = await queryTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: voxelId,
      });
      expect(queryResult.success).toBe(true);
      expect(queryResult.data?.total).toBe(1);

      // 4. Navigate decision surface
      const navTool = getToolByName('navigate_decision_surface');
      const navResult = await navTool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: voxelId,
        maxDepth: 1,
      });
      expect(navResult.success).toBe(true);
      expect(navResult.data?.decisions.length).toBeGreaterThanOrEqual(1);
    });

    it('should support full inspection completion workflow', async () => {
      const voxelId = 'VOX-L2-FIRE-001';

      // 1. Create decision
      const captureTool = getToolByName('capture_decision');
      const decResult = await captureTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: voxelId,
        title: 'Fire suppression installation',
        type: 'PROPOSAL',
      });
      const decisionId = decResult.data?.decisionId;

      // 2. Request inspection
      const requestTool = getToolByName('request_inspection');
      const inspResult = await requestTool!.handler({
        projectId: TEST_PROJECT_ID,
        voxelId: voxelId,
        decisionId: decisionId,
        inspectionType: 'SAFETY',
        scheduledDate: new Date().toISOString(),
      });
      expect(inspResult.success).toBe(true);
      const inspectionId = inspResult.data?.inspectionId;

      // 3. Complete inspection
      const completeTool = getToolByName('complete_inspection');
      const completeResult = await completeTool!.handler({
        projectId: TEST_PROJECT_ID,
        inspectionId: inspectionId,
        inspectorId: 'FIRE-INSP-001',
        outcome: 'PASSED',
        findings: [
          {
            findingId: 'FND-FIRE-001',
            description: 'All suppression heads installed per code',
            severity: 'MINOR',
            requiresCorrection: false,
          },
        ],
        decisionsValidated: [decisionId],
      });
      expect(completeResult.success).toBe(true);

      // 4. Verify decision was approved
      expect(completeResult.data?.validatedDecisions[0].status).toBe('APPROVED');

      // 5. Navigate to see the approved decision
      const navTool = getToolByName('navigate_decision_surface');
      const navResult = await navTool!.handler({
        projectId: TEST_PROJECT_ID,
        startVoxelId: voxelId,
      });
      expect(navResult.success).toBe(true);
      const approvedDecision = navResult.data?.decisions.find(
        (d: PMDecision) => d.decisionId === decisionId
      );
      expect(approvedDecision?.status).toBe('APPROVED');
    });
  });
});
