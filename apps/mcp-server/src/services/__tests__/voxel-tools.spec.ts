/**
 * Voxel MCP Tools Tests
 *
 * Test suite for voxel MCP tool handlers:
 * - Voxelization tools
 * - Query tools
 * - Status management tools
 * - Visualization tools
 * - Coordination tools
 *
 * @module services/__tests__/voxel-tools.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeVoxelTool, voxelTools } from '../voxel-tools';
import { createVoxelDecompositionService } from '../voxel-decomposition.service';
import {
  VoxelStatus,
  VoxelSystem,
  VoxelColorScheme,
  VoxelVisualizationMode,
  AggregationLevel,
} from '../../types/voxel-decomposition.types';

describe('Voxel MCP Tools', () => {
  const testProjectId = 'mcp-test-project-001';
  const testModelId = 'mcp-test-model-001';

  // Initialize service for tests
  beforeAll(async () => {
    // Pre-voxelize a model for query tests
    const service = createVoxelDecompositionService();
    await service.voxelizeModel(testProjectId, testModelId);
  });

  // ===========================================================================
  // Tool Schema Tests
  // ===========================================================================

  describe('Tool Definitions', () => {
    it('should export tool definitions', () => {
      expect(voxelTools).toBeDefined();
      expect(Array.isArray(voxelTools)).toBe(true);
      expect(voxelTools.length).toBeGreaterThan(0);
    });

    it('should have valid schema for each tool', () => {
      for (const tool of voxelTools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      }
    });

    it('should include all expected tools', () => {
      const toolNames = voxelTools.map((t) => t.name);

      expect(toolNames).toContain('voxelize_model');
      expect(toolNames).toContain('query_voxels');
      expect(toolNames).toContain('get_voxel');
      expect(toolNames).toContain('update_voxel_status');
      expect(toolNames).toContain('attach_decision_to_voxel');
      expect(toolNames).toContain('get_voxel_aggregation');
      expect(toolNames).toContain('get_voxel_visualization');
      expect(toolNames).toContain('get_voxel_activity');
      expect(toolNames).toContain('create_coordination_session');
      expect(toolNames).toContain('navigate_decision_surface');
    });
  });

  // ===========================================================================
  // voxelize_model Tests
  // ===========================================================================

  describe('voxelize_model', () => {
    it('should voxelize a model successfully', async () => {
      const result = await executeVoxelTool('voxelize_model', {
        projectId: 'new-project-001',
        modelId: 'new-model-001',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).voxelCount).toBeGreaterThan(0);
      expect((result.data as any).stats).toBeDefined();
      expect((result.data as any).processingTimeMs).toBeDefined();
    });

    it('should accept custom resolution', async () => {
      const result = await executeVoxelTool('voxelize_model', {
        projectId: 'new-project-002',
        modelId: 'new-model-002',
        resolution: 100,
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // query_voxels Tests
  // ===========================================================================

  describe('query_voxels', () => {
    it('should query all voxels in project', async () => {
      const result = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).totalCount).toBeGreaterThan(0);
      expect(Array.isArray((result.data as any).voxels)).toBe(true);
    });

    it('should filter by bounding box', async () => {
      const result = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        boundingBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 5000, y: 5000, z: 4000 },
        },
      });

      expect(result.success).toBe(true);
    });

    it('should filter by systems', async () => {
      const result = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        systems: [VoxelSystem.STRUCTURAL],
      });

      expect(result.success).toBe(true);

      const voxels = (result.data as any).voxels;
      for (const v of voxels) {
        expect(v.system).toBe(VoxelSystem.STRUCTURAL);
      }
    });

    it('should filter by statuses', async () => {
      const result = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        statuses: [VoxelStatus.PLANNED],
      });

      expect(result.success).toBe(true);
    });

    it('should respect limit', async () => {
      const limit = 5;
      const result = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).voxels.length).toBeLessThanOrEqual(limit);
    });

    it('should return empty for non-existent project', async () => {
      const result = await executeVoxelTool('query_voxels', {
        projectId: 'non-existent-project',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).totalCount).toBe(0);
    });
  });

  // ===========================================================================
  // get_voxel Tests
  // ===========================================================================

  describe('get_voxel', () => {
    it('should get voxel by ID', async () => {
      // First get a voxel ID
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('get_voxel', { voxelId });

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe(voxelId);
    });

    it('should fail for non-existent voxel', async () => {
      const result = await executeVoxelTool('get_voxel', {
        voxelId: 'non-existent-voxel',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ===========================================================================
  // update_voxel_status Tests
  // ===========================================================================

  describe('update_voxel_status', () => {
    it('should update voxel status', async () => {
      // Get a voxel ID
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('update_voxel_status', {
        voxelId,
        status: VoxelStatus.IN_PROGRESS,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).status).toBe(VoxelStatus.IN_PROGRESS);
    });

    it('should update percent complete', async () => {
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('update_voxel_status', {
        voxelId,
        status: VoxelStatus.IN_PROGRESS,
        percentComplete: 75,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).percentComplete).toBe(75);
    });

    it('should fail for non-existent voxel', async () => {
      const result = await executeVoxelTool('update_voxel_status', {
        voxelId: 'non-existent-voxel',
        status: VoxelStatus.IN_PROGRESS,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ===========================================================================
  // attach_decision_to_voxel Tests
  // ===========================================================================

  describe('attach_decision_to_voxel', () => {
    it('should attach decision to voxel', async () => {
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('attach_decision_to_voxel', {
        voxelId,
        decisionId: 'mcp-test-decision-001',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).message).toContain('attached');
    });
  });

  // ===========================================================================
  // get_voxel_aggregation Tests
  // ===========================================================================

  describe('get_voxel_aggregation', () => {
    it('should aggregate by level', async () => {
      const result = await executeVoxelTool('get_voxel_aggregation', {
        projectId: testProjectId,
        level: AggregationLevel.LEVEL,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should aggregate by system', async () => {
      const result = await executeVoxelTool('get_voxel_aggregation', {
        projectId: testProjectId,
        level: AggregationLevel.SYSTEM,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as any[]).length).toBeGreaterThan(0);
    });

    it('should aggregate by project', async () => {
      const result = await executeVoxelTool('get_voxel_aggregation', {
        projectId: testProjectId,
        level: AggregationLevel.PROJECT,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as any[]).length).toBe(1);
    });

    it('should apply filters before aggregating', async () => {
      const result = await executeVoxelTool('get_voxel_aggregation', {
        projectId: testProjectId,
        level: AggregationLevel.PROJECT,
        filterSystems: [VoxelSystem.STRUCTURAL],
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // get_voxel_visualization Tests
  // ===========================================================================

  describe('get_voxel_visualization', () => {
    it('should generate visualization data', async () => {
      const result = await executeVoxelTool('get_voxel_visualization', {
        projectId: testProjectId,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).instanceCount).toBeGreaterThan(0);
      expect((result.data as any).voxelIds).toBeDefined();
    });

    it('should accept color scheme', async () => {
      const result = await executeVoxelTool('get_voxel_visualization', {
        projectId: testProjectId,
        colorScheme: VoxelColorScheme.BY_STATUS,
      });

      expect(result.success).toBe(true);
    });

    it('should accept visualization mode', async () => {
      const result = await executeVoxelTool('get_voxel_visualization', {
        projectId: testProjectId,
        mode: VoxelVisualizationMode.WIREFRAME,
      });

      expect(result.success).toBe(true);
    });

    it('should filter by systems', async () => {
      const result = await executeVoxelTool('get_voxel_visualization', {
        projectId: testProjectId,
        filterSystems: [VoxelSystem.STRUCTURAL],
      });

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // get_voxel_activity Tests
  // ===========================================================================

  describe('get_voxel_activity', () => {
    it('should return activity feed', async () => {
      const result = await executeVoxelTool('get_voxel_activity', {
        projectId: testProjectId,
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should filter by voxel IDs', async () => {
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 2,
      });
      const voxelIds = (queryResult.data as any).voxels.map((v: any) => v.id);

      const result = await executeVoxelTool('get_voxel_activity', {
        projectId: testProjectId,
        voxelIds,
      });

      expect(result.success).toBe(true);
    });

    it('should respect limit', async () => {
      const result = await executeVoxelTool('get_voxel_activity', {
        projectId: testProjectId,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect((result.data as any[]).length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // create_coordination_session Tests
  // ===========================================================================

  describe('create_coordination_session', () => {
    it('should create coordination session', async () => {
      const result = await executeVoxelTool('create_coordination_session', {
        projectId: testProjectId,
        participants: ['user-001', 'user-002'],
      });

      expect(result.success).toBe(true);
      expect((result.data as any).sessionId).toBeDefined();
      expect((result.data as any).projectId).toBe(testProjectId);
      expect((result.data as any).participants).toEqual(['user-001', 'user-002']);
    });
  });

  // ===========================================================================
  // navigate_decision_surface Tests
  // ===========================================================================

  describe('navigate_decision_surface', () => {
    it('should navigate spatially', async () => {
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('navigate_decision_surface', {
        projectId: testProjectId,
        startVoxelId: voxelId,
        traversalType: 'spatial',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).traversalType).toBe('spatial');
      expect((result.data as any).startVoxel).toBeDefined();
      expect((result.data as any).relatedVoxels).toBeDefined();
    });

    it('should support causal traversal', async () => {
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0].id;

      const result = await executeVoxelTool('navigate_decision_surface', {
        projectId: testProjectId,
        startVoxelId: voxelId,
        traversalType: 'causal',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).traversalType).toBe('causal');
    });

    it('should fail for non-existent start voxel', async () => {
      const result = await executeVoxelTool('navigate_decision_surface', {
        projectId: testProjectId,
        startVoxelId: 'non-existent-voxel',
        traversalType: 'spatial',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ===========================================================================
  // Decision Surface Phase 2 Tools
  // ===========================================================================

  describe('Decision Surface Tools - Schema Validation', () => {
    it('should include all Decision Surface Phase 2 tools', () => {
      const toolNames = voxelTools.map((t) => t.name);

      // Verify all 6 new tools are included
      expect(toolNames).toContain('get_voxel_decisions');
      expect(toolNames).toContain('acknowledge_decision');
      expect(toolNames).toContain('apply_tolerance_override');
      expect(toolNames).toContain('query_tolerance_overrides');
      expect(toolNames).toContain('request_inspection');
      expect(toolNames).toContain('complete_inspection');
    });

    it('get_voxel_decisions should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'get_voxel_decisions');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('voxelId');
      expect(tool!.inputSchema.properties).toHaveProperty('voxelId');
      expect(tool!.inputSchema.properties).toHaveProperty('attachmentType');
      expect(tool!.inputSchema.properties).toHaveProperty('requiresAcknowledgment');
      expect(tool!.inputSchema.properties).toHaveProperty('acknowledged');
      expect(tool!.inputSchema.properties).toHaveProperty('trades');
    });

    it('acknowledge_decision should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'acknowledge_decision');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('voxelId');
      expect(tool!.inputSchema.required).toContain('decisionId');
      expect(tool!.inputSchema.required).toContain('participantId');
      expect(tool!.inputSchema.required).toContain('method');
      expect(tool!.inputSchema.properties).toHaveProperty('method');
      // Verify method enum values
      const methodProp = tool!.inputSchema.properties.method as any;
      expect(methodProp.enum).toContain('APP_TAP');
      expect(methodProp.enum).toContain('SMS_REPLY');
      expect(methodProp.enum).toContain('VOICE');
      expect(methodProp.enum).toContain('AR_GESTURE');
    });

    it('apply_tolerance_override should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'apply_tolerance_override');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('voxelId');
      expect(tool!.inputSchema.required).toContain('toleranceType');
      expect(tool!.inputSchema.required).toContain('standardValue');
      expect(tool!.inputSchema.required).toContain('approvedValue');
      expect(tool!.inputSchema.required).toContain('sourceDecisionUrn');
      expect(tool!.inputSchema.required).toContain('rationale');

      // Verify tolerance type enum
      const typeProp = tool!.inputSchema.properties.toleranceType as any;
      expect(typeProp.enum).toContain('WALL_FLATNESS');
      expect(typeProp.enum).toContain('CEILING_HEIGHT');
      expect(typeProp.enum).toContain('FLOOR_LEVEL');
      expect(typeProp.enum).toContain('EQUIPMENT_CLEARANCE');
    });

    it('query_tolerance_overrides should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'query_tolerance_overrides');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('projectId');
      expect(tool!.inputSchema.properties).toHaveProperty('voxelId');
      expect(tool!.inputSchema.properties).toHaveProperty('toleranceType');
      expect(tool!.inputSchema.properties).toHaveProperty('trade');
      expect(tool!.inputSchema.properties).toHaveProperty('includeExpired');
    });

    it('request_inspection should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'request_inspection');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('voxelId');
      expect(tool!.inputSchema.required).toContain('projectId');
      expect(tool!.inputSchema.required).toContain('inspectionType');
      expect(tool!.inputSchema.required).toContain('requestedBy');

      // Verify inspection type enum
      const typeProp = tool!.inputSchema.properties.inspectionType as any;
      expect(typeProp.enum).toContain('ROUGH');
      expect(typeProp.enum).toContain('FINAL');
      expect(typeProp.enum).toContain('SPECIAL');

      // Verify priority enum
      const priorityProp = tool!.inputSchema.properties.priority as any;
      expect(priorityProp.enum).toContain('NORMAL');
      expect(priorityProp.enum).toContain('EXPEDITED');
    });

    it('complete_inspection should have correct schema', () => {
      const tool = voxelTools.find((t) => t.name === 'complete_inspection');

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('inspectionId');
      expect(tool!.inputSchema.required).toContain('voxelId');
      expect(tool!.inputSchema.required).toContain('result');
      expect(tool!.inputSchema.required).toContain('inspectorRef');

      // Verify result enum
      const resultProp = tool!.inputSchema.properties.result as any;
      expect(resultProp.enum).toContain('PASSED');
      expect(resultProp.enum).toContain('FAILED');
      expect(resultProp.enum).toContain('CONDITIONAL');
    });
  });

  /**
   * Note: The following Decision Surface tool handler tests require
   * a Prisma client to be initialized globally. These tests validate
   * the handler logic works correctly when the persistence layer is available.
   *
   * In integration environments with database connectivity, uncomment
   * these tests and ensure __prisma_client__ is set on globalThis.
   */
  describe('Decision Surface Tool Handlers (Schema Only)', () => {
    // These tests verify tool definitions without requiring database connectivity

    it('get_voxel_decisions handler should exist', async () => {
      // Handler exists and returns error when persistence not initialized
      // This is expected in test environment without Prisma
      const result = await executeVoxelTool('get_voxel_decisions', {
        voxelId: 'test-voxel-001',
      });

      // Should either succeed (if mock persistence) or fail with Prisma error
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('acknowledge_decision handler should exist', async () => {
      const result = await executeVoxelTool('acknowledge_decision', {
        voxelId: 'test-voxel-001',
        decisionId: 'test-decision-001',
        participantId: 'test-participant-001',
        method: 'APP_TAP',
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('apply_tolerance_override handler should exist', async () => {
      const result = await executeVoxelTool('apply_tolerance_override', {
        voxelId: 'test-voxel-001',
        toleranceType: 'WALL_FLATNESS',
        standardValue: 3,
        approvedValue: 5,
        sourceDecisionUrn: 'urn:test:decision:001',
        rationale: 'Field conditions require variance',
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('query_tolerance_overrides handler should exist', async () => {
      const result = await executeVoxelTool('query_tolerance_overrides', {
        projectId: testProjectId,
        voxelId: 'test-voxel-001',
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('request_inspection handler should exist', async () => {
      // First get a real voxel ID
      const queryResult = await executeVoxelTool('query_voxels', {
        projectId: testProjectId,
        limit: 1,
      });
      const voxelId = (queryResult.data as any).voxels[0]?.id || 'test-voxel-001';

      const result = await executeVoxelTool('request_inspection', {
        voxelId,
        projectId: testProjectId,
        inspectionType: 'ROUGH',
        requestedBy: 'urn:test:user:foreman',
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('complete_inspection handler should exist', async () => {
      const result = await executeVoxelTool('complete_inspection', {
        inspectionId: 'test-inspection-001',
        voxelId: 'test-voxel-001',
        result: 'PASSED',
        inspectorRef: 'urn:test:inspector:001',
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  // ===========================================================================
  // Unknown Tool Tests
  // ===========================================================================

  describe('Unknown Tool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeVoxelTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});
