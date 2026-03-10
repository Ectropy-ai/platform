/**
 * Voxel Decomposition Service Tests
 *
 * Comprehensive test suite for the SEPPA voxelization pipeline:
 * - Model voxelization (IFC → Voxels)
 * - Spatial queries (bounding box, radius)
 * - Property filtering
 * - Aggregation
 * - Visualization data generation
 * - Live site coordination
 *
 * @module services/__tests__/voxel-decomposition.spec
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  VoxelDecompositionService,
  createVoxelDecompositionService,
} from '../voxel-decomposition.service';
import {
  VoxelStatus,
  VoxelHealthStatus,
  VoxelSystem,
  VoxelResolution,
  VoxelColorScheme,
  VoxelVisualizationMode,
  AggregationLevel,
  BoundingBox,
  Vector3,
} from '../../types/voxel-decomposition.types';

describe('VoxelDecompositionService', () => {
  let service: VoxelDecompositionService;
  const testProjectId = 'test-project-001';
  const testModelId = 'test-model-001';

  beforeEach(() => {
    // Create fresh service instance for each test
    service = createVoxelDecompositionService();
  });

  // ===========================================================================
  // Model Voxelization Tests
  // ===========================================================================

  describe('voxelizeModel', () => {
    it('should voxelize a model successfully', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);
      expect(result.projectId).toBe(testProjectId);
      expect(result.modelId).toBe(testModelId);
      expect(result.voxelCount).toBeGreaterThan(0);
      expect(result.voxels).toHaveLength(result.voxelCount);
    });

    it('should generate valid voxel data', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);
      const voxel = result.voxels[0];

      // Check required fields
      expect(voxel.id).toBeDefined();
      expect(voxel.urn).toMatch(/^urn:ectropy:/);
      expect(voxel.voxelId).toMatch(/^VOX-/);
      expect(voxel.projectId).toBe(testProjectId);

      // Check spatial data
      expect(voxel.coord).toBeDefined();
      expect(typeof voxel.coord.i).toBe('number');
      expect(typeof voxel.coord.j).toBe('number');
      expect(typeof voxel.coord.k).toBe('number');

      expect(voxel.center).toBeDefined();
      expect(typeof voxel.center.x).toBe('number');
      expect(typeof voxel.center.y).toBe('number');
      expect(typeof voxel.center.z).toBe('number');

      expect(voxel.bounds).toBeDefined();
      expect(voxel.bounds.min).toBeDefined();
      expect(voxel.bounds.max).toBeDefined();

      // Check status
      expect(voxel.status).toBe(VoxelStatus.PLANNED);
      expect(voxel.healthStatus).toBe(VoxelHealthStatus.HEALTHY);
    });

    it('should respect custom resolution', async () => {
      const coarseResult = await service.voxelizeModel(testProjectId, testModelId, {
        resolution: VoxelResolution.COARSE,
      });

      const fineResult = await service.voxelizeModel(
        `${testProjectId}-fine`,
        testModelId,
        {
          resolution: VoxelResolution.FINE,
        }
      );

      // Coarse resolution should produce fewer voxels than fine
      expect(coarseResult.voxelCount).toBeLessThan(fineResult.voxelCount);
      expect(coarseResult.resolution).toBe(VoxelResolution.COARSE);
      expect(fineResult.resolution).toBe(VoxelResolution.FINE);
    });

    it('should classify voxels by building system', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Should have voxels from multiple systems
      const systems = new Set(result.voxels.map((v) => v.system));
      expect(systems.size).toBeGreaterThan(1);

      // Should include structural and MEP systems
      const hasStructural = result.voxels.some((v) => v.system === VoxelSystem.STRUCTURAL);
      const hasMech = result.voxels.some(
        (v) => v.system === VoxelSystem.MECHANICAL || v.system === VoxelSystem.HVAC
      );

      expect(hasStructural || hasMech).toBe(true);
    });

    it('should extract level information', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Should have voxels with level info
      const voxelsWithLevel = result.voxels.filter((v) => v.level !== undefined);
      expect(voxelsWithLevel.length).toBeGreaterThan(0);

      // Stats should track levels
      expect(Object.keys(result.stats.voxelsByLevel).length).toBeGreaterThan(0);
    });

    it('should calculate grid extent correctly', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);
      expect(result.gridExtent).toBeDefined();

      const { gridExtent } = result;
      expect(gridExtent.origin).toBeDefined();
      expect(gridExtent.dimensions.i).toBeGreaterThan(0);
      expect(gridExtent.dimensions.j).toBeGreaterThan(0);
      expect(gridExtent.dimensions.k).toBeGreaterThan(0);
      expect(gridExtent.cellSize).toBe(result.resolution);
    });

    it('should generate voxelization statistics', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();

      const { stats } = result;
      expect(stats.totalVoxels).toBe(result.voxelCount);
      expect(stats.ifcElementsProcessed).toBeGreaterThan(0);
      expect(stats.averageVoxelsPerElement).toBeGreaterThan(0);
      expect(stats.gridDensity).toBeGreaterThan(0);
      expect(stats.gridDensity).toBeLessThanOrEqual(1);
    });

    it('should track IFC elements per voxel', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      for (const voxel of result.voxels) {
        expect(Array.isArray(voxel.ifcElements)).toBe(true);
        expect(voxel.ifcElements.length).toBeGreaterThan(0);
        expect(voxel.elementCount).toBe(voxel.ifcElements.length);
        expect(voxel.primaryElement).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Adjacent Voxel & Graph Traversal Tests (M4a)
  // ===========================================================================

  describe('adjacentVoxelComputation', () => {
    it('should compute adjacent voxels during voxelization', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);
      expect(result.voxels.length).toBeGreaterThan(0);

      // Find voxels that have neighbors
      const voxelsWithNeighbors = result.voxels.filter(
        (v) => v.adjacentVoxels && v.adjacentVoxels.length > 0
      );

      // At least some voxels should have adjacent voxels
      expect(voxelsWithNeighbors.length).toBeGreaterThan(0);

      // Adjacent voxel URNs should be valid
      for (const voxel of voxelsWithNeighbors) {
        for (const neighborUrn of voxel.adjacentVoxels!) {
          expect(neighborUrn).toMatch(/^urn:ectropy:/);
        }
      }
    });

    it('should populate graphMetadata with adjacency edges', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Find voxels with graphMetadata
      const voxelsWithGraphMetadata = result.voxels.filter(
        (v) => v.graphMetadata && v.graphMetadata.outEdges.length > 0
      );

      // At least some voxels should have graph edges
      expect(voxelsWithGraphMetadata.length).toBeGreaterThan(0);

      // Check graph metadata structure
      for (const voxel of voxelsWithGraphMetadata) {
        expect(voxel.graphMetadata!.inEdges).toBeDefined();
        expect(voxel.graphMetadata!.outEdges).toBeDefined();
        expect(Array.isArray(voxel.graphMetadata!.outEdges)).toBe(true);
      }
    });

    it('should create bidirectional adjacency (A adjacent to B implies B adjacent to A)', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Create URN to voxel map for lookup
      const urnToVoxel = new Map(result.voxels.map((v) => [v.urn, v]));

      // Check bidirectional adjacency
      for (const voxel of result.voxels) {
        if (voxel.adjacentVoxels && voxel.adjacentVoxels.length > 0) {
          for (const neighborUrn of voxel.adjacentVoxels) {
            const neighbor = urnToVoxel.get(neighborUrn);
            expect(neighbor).toBeDefined();

            // Neighbor should also have current voxel as adjacent
            if (neighbor && neighbor.adjacentVoxels) {
              expect(neighbor.adjacentVoxels).toContain(voxel.urn);
            }
          }
        }
      }
    });

    it('should populate edges array with proper GraphEdge structure', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Find voxels with edges array
      const voxelsWithEdges = result.voxels.filter(
        (v) => v.graphMetadata && v.graphMetadata.edges && v.graphMetadata.edges.length > 0
      );

      expect(voxelsWithEdges.length).toBeGreaterThan(0);

      for (const voxel of voxelsWithEdges) {
        for (const edge of voxel.graphMetadata!.edges!) {
          expect(edge.from).toBe(voxel.urn);
          expect(edge.to).toMatch(/^urn:ectropy:/);
          expect(edge.type).toBe('adjacent-to');
          expect(edge.createdAt).toBeDefined();
        }
      }
    });

    it('should only connect 6-connected neighbors (face-sharing)', async () => {
      const result = await service.voxelizeModel(testProjectId, testModelId);

      expect(result.success).toBe(true);

      // Create coord to voxel map
      const coordToVoxel = new Map(
        result.voxels.map((v) => [`${v.coord.i},${v.coord.j},${v.coord.k}`, v])
      );

      // For each voxel, verify adjacents are exactly 6-connected
      for (const voxel of result.voxels) {
        if (voxel.adjacentVoxels && voxel.adjacentVoxels.length > 0) {
          // Max 6 neighbors for 6-connected
          expect(voxel.adjacentVoxels.length).toBeLessThanOrEqual(6);

          // Each adjacent should be exactly 1 unit away in exactly one dimension
          for (const neighborUrn of voxel.adjacentVoxels) {
            const neighbor = result.voxels.find((v) => v.urn === neighborUrn);
            expect(neighbor).toBeDefined();

            if (neighbor) {
              const di = Math.abs(voxel.coord.i - neighbor.coord.i);
              const dj = Math.abs(voxel.coord.j - neighbor.coord.j);
              const dk = Math.abs(voxel.coord.k - neighbor.coord.k);

              // Manhattan distance should be exactly 1 (face-sharing)
              expect(di + dj + dk).toBe(1);
            }
          }
        }
      }
    });
  });

  // ===========================================================================
  // Spatial Query Tests
  // ===========================================================================

  describe('queryVoxels', () => {
    beforeEach(async () => {
      // Voxelize model before queries
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should query all voxels in project', async () => {
      const result = await service.queryVoxels({ projectId: testProjectId });

      expect(result.voxels.length).toBeGreaterThan(0);
      expect(result.totalCount).toBe(result.voxels.length);
      expect(result.queryTimeMs).toBeDefined();
    });

    it('should query voxels by bounding box', async () => {
      // Get all voxels first
      const allResult = await service.queryVoxels({ projectId: testProjectId });

      // Query a subset by bounding box
      const boundingBox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5000, y: 5000, z: 4000 },
      };

      const boxResult = await service.queryVoxels({
        projectId: testProjectId,
        boundingBox,
      });

      // Should return fewer voxels
      expect(boxResult.totalCount).toBeLessThan(allResult.totalCount);

      // All returned voxels should be in bounds
      for (const voxel of boxResult.voxels) {
        expect(voxel.center.x).toBeGreaterThanOrEqual(boundingBox.min.x);
        expect(voxel.center.x).toBeLessThanOrEqual(boundingBox.max.x);
        expect(voxel.center.y).toBeGreaterThanOrEqual(boundingBox.min.y);
        expect(voxel.center.y).toBeLessThanOrEqual(boundingBox.max.y);
        expect(voxel.center.z).toBeGreaterThanOrEqual(boundingBox.min.z);
        expect(voxel.center.z).toBeLessThanOrEqual(boundingBox.max.z);
      }
    });

    it('should query voxels by radius from point', async () => {
      // Get a voxel to use as center
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const centerVoxel = allResult.voxels[0];

      const radius = 1000; // 1 meter
      const radiusResult = await service.queryVoxels({
        projectId: testProjectId,
        center: centerVoxel.center,
        radius,
      });

      // Should include at least the center voxel
      expect(radiusResult.totalCount).toBeGreaterThan(0);

      // All returned voxels should be within radius
      for (const voxel of radiusResult.voxels) {
        const dx = voxel.center.x - centerVoxel.center.x;
        const dy = voxel.center.y - centerVoxel.center.y;
        const dz = voxel.center.z - centerVoxel.center.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        expect(distance).toBeLessThanOrEqual(radius);
      }
    });

    it('should filter voxels by system', async () => {
      const result = await service.queryVoxels({
        projectId: testProjectId,
        systems: [VoxelSystem.STRUCTURAL],
      });

      // All returned voxels should be structural
      for (const voxel of result.voxels) {
        expect(voxel.system).toBe(VoxelSystem.STRUCTURAL);
      }
    });

    it('should filter voxels by status', async () => {
      // First update some voxels
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxelToUpdate = allResult.voxels[0];
      await service.updateVoxelStatus(voxelToUpdate.id, VoxelStatus.IN_PROGRESS);

      // Query by status
      const inProgressResult = await service.queryVoxels({
        projectId: testProjectId,
        statuses: [VoxelStatus.IN_PROGRESS],
      });

      expect(inProgressResult.totalCount).toBe(1);
      expect(inProgressResult.voxels[0].status).toBe(VoxelStatus.IN_PROGRESS);
    });

    it('should filter voxels by level', async () => {
      const result = await service.queryVoxels({
        projectId: testProjectId,
        levels: ['0'],
      });

      // All returned voxels should be on level 0
      for (const voxel of result.voxels) {
        expect(voxel.level).toBe('0');
      }
    });

    it('should filter voxels with decisions', async () => {
      // First attach a decision
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];
      await service.attachDecision(voxel.id, 'test-decision-001');

      // Query voxels with decisions
      const withDecisionsResult = await service.queryVoxels({
        projectId: testProjectId,
        hasDecisions: true,
      });

      expect(withDecisionsResult.totalCount).toBe(1);
      expect(withDecisionsResult.voxels[0].decisionCount).toBeGreaterThan(0);
    });

    it('should respect query limit', async () => {
      const limit = 5;
      const result = await service.queryVoxels({
        projectId: testProjectId,
        limit,
      });

      expect(result.voxels.length).toBeLessThanOrEqual(limit);
    });

    it('should respect query offset', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });

      const offset = 5;
      const offsetResult = await service.queryVoxels({
        projectId: testProjectId,
        offset,
      });

      expect(offsetResult.totalCount).toBe(allResult.totalCount - offset);
    });
  });

  // ===========================================================================
  // Voxel Management Tests
  // ===========================================================================

  describe('getVoxel', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should get voxel by ID', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const targetVoxel = allResult.voxels[0];

      const voxel = await service.getVoxel(targetVoxel.id);

      expect(voxel).not.toBeNull();
      expect(voxel!.id).toBe(targetVoxel.id);
      expect(voxel!.voxelId).toBe(targetVoxel.voxelId);
    });

    it('should return null for non-existent voxel', async () => {
      const voxel = await service.getVoxel('non-existent-id');
      expect(voxel).toBeNull();
    });
  });

  describe('updateVoxelStatus', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should update voxel status', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];

      const updated = await service.updateVoxelStatus(
        voxel.id,
        VoxelStatus.IN_PROGRESS
      );

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe(VoxelStatus.IN_PROGRESS);
    });

    it('should update percent complete', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];

      const updated = await service.updateVoxelStatus(
        voxel.id,
        VoxelStatus.IN_PROGRESS,
        50
      );

      expect(updated).not.toBeNull();
      expect(updated!.percentComplete).toBe(50);
    });

    it('should update health status for blocked voxels', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];

      const updated = await service.updateVoxelStatus(voxel.id, VoxelStatus.BLOCKED);

      expect(updated).not.toBeNull();
      expect(updated!.healthStatus).toBe(VoxelHealthStatus.BLOCKED);
    });

    it('should update health status for issue voxels', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];

      const updated = await service.updateVoxelStatus(voxel.id, VoxelStatus.ISSUE);

      expect(updated).not.toBeNull();
      expect(updated!.healthStatus).toBe(VoxelHealthStatus.CRITICAL);
    });

    it('should return null for non-existent voxel', async () => {
      const updated = await service.updateVoxelStatus(
        'non-existent-id',
        VoxelStatus.IN_PROGRESS
      );
      expect(updated).toBeNull();
    });
  });

  describe('attachDecision', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should attach decision to voxel', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];
      const decisionId = 'test-decision-001';

      await service.attachDecision(voxel.id, decisionId);

      const updated = await service.getVoxel(voxel.id);
      expect(updated!.decisionCount).toBe(1);
      expect(updated!.unacknowledgedCount).toBe(1);
      expect(updated!.graphMetadata?.inEdges).toContain(
        `urn:ectropy:decision:${decisionId}`
      );
    });

    it('should increment decision count for multiple attachments', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const voxel = allResult.voxels[0];

      await service.attachDecision(voxel.id, 'decision-001');
      await service.attachDecision(voxel.id, 'decision-002');
      await service.attachDecision(voxel.id, 'decision-003');

      const updated = await service.getVoxel(voxel.id);
      expect(updated!.decisionCount).toBe(3);
      expect(updated!.unacknowledgedCount).toBe(3);
    });
  });

  // ===========================================================================
  // Aggregation Tests
  // ===========================================================================

  describe('getAggregation', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should aggregate by level', async () => {
      const aggregations = await service.getAggregation(
        testProjectId,
        AggregationLevel.LEVEL
      );

      expect(aggregations.length).toBeGreaterThan(0);

      for (const agg of aggregations) {
        expect(agg.level).toBe(AggregationLevel.LEVEL);
        expect(agg.voxelCount).toBeGreaterThan(0);
        expect(agg.overallProgress).toBeDefined();
        expect(agg.healthScore).toBeDefined();
      }
    });

    it('should aggregate by system', async () => {
      const aggregations = await service.getAggregation(
        testProjectId,
        AggregationLevel.SYSTEM
      );

      expect(aggregations.length).toBeGreaterThan(0);

      // Should have aggregation for each system
      const systems = new Set(aggregations.map((a) => a.key));
      expect(systems.size).toBeGreaterThan(1);
    });

    it('should calculate progress breakdown', async () => {
      // Update some voxels
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      await service.updateVoxelStatus(allResult.voxels[0].id, VoxelStatus.IN_PROGRESS);
      await service.updateVoxelStatus(allResult.voxels[1].id, VoxelStatus.COMPLETE);

      const aggregations = await service.getAggregation(
        testProjectId,
        AggregationLevel.PROJECT
      );

      expect(aggregations.length).toBe(1);
      const projectAgg = aggregations[0];

      expect(projectAgg.inProgressCount).toBe(1);
      expect(projectAgg.completeCount).toBe(1);
      expect(projectAgg.plannedCount).toBe(projectAgg.voxelCount - 2);
    });

    it('should calculate health scores', async () => {
      // Update some voxels to different health states
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      await service.updateVoxelStatus(allResult.voxels[0].id, VoxelStatus.BLOCKED);
      await service.updateVoxelStatus(allResult.voxels[1].id, VoxelStatus.ISSUE);

      const aggregations = await service.getAggregation(
        testProjectId,
        AggregationLevel.PROJECT
      );

      const projectAgg = aggregations[0];
      expect(projectAgg.blockedCount).toBe(1);
      expect(projectAgg.criticalCount).toBe(1);
      expect(projectAgg.healthScore).toBeLessThan(100);
    });

    it('should filter before aggregating', async () => {
      const filteredAgg = await service.getAggregation(
        testProjectId,
        AggregationLevel.PROJECT,
        {
          projectId: testProjectId,
          systems: [VoxelSystem.STRUCTURAL],
        }
      );

      const unfilteredAgg = await service.getAggregation(
        testProjectId,
        AggregationLevel.PROJECT
      );

      expect(filteredAgg[0].voxelCount).toBeLessThanOrEqual(
        unfilteredAgg[0].voxelCount
      );
    });
  });

  // ===========================================================================
  // Visualization Tests
  // ===========================================================================

  describe('getVisualizationData', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should generate instance data for solid mode', async () => {
      const instanceData = await service.getVisualizationData(testProjectId, {
        mode: VoxelVisualizationMode.SOLID,
        colorScheme: VoxelColorScheme.BY_SYSTEM,
        opacity: 0.7,
        showWireframe: false,
        showLabels: false,
        labelField: 'voxelId',
      });

      expect(instanceData.instanceCount).toBeGreaterThan(0);
      expect(instanceData.centers.length).toBe(instanceData.instanceCount * 3);
      expect(instanceData.scales.length).toBe(instanceData.instanceCount * 3);
      expect(instanceData.colors.length).toBe(instanceData.instanceCount * 4);
      expect(instanceData.voxelIds.length).toBe(instanceData.instanceCount);
    });

    it('should filter visualization by system', async () => {
      const allData = await service.getVisualizationData(testProjectId, {
        mode: VoxelVisualizationMode.SOLID,
        colorScheme: VoxelColorScheme.BY_SYSTEM,
        opacity: 0.7,
        showWireframe: false,
        showLabels: false,
        labelField: 'voxelId',
      });

      const filteredData = await service.getVisualizationData(testProjectId, {
        mode: VoxelVisualizationMode.SOLID,
        colorScheme: VoxelColorScheme.BY_SYSTEM,
        opacity: 0.7,
        showWireframe: false,
        showLabels: false,
        labelField: 'voxelId',
        filterSystems: [VoxelSystem.STRUCTURAL],
      });

      expect(filteredData.instanceCount).toBeLessThan(allData.instanceCount);
    });

    it('should filter visualization by status', async () => {
      // Update some voxels
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      await service.updateVoxelStatus(
        allResult.voxels[0].id,
        VoxelStatus.IN_PROGRESS
      );

      const filteredData = await service.getVisualizationData(testProjectId, {
        mode: VoxelVisualizationMode.SOLID,
        colorScheme: VoxelColorScheme.BY_STATUS,
        opacity: 0.7,
        showWireframe: false,
        showLabels: false,
        labelField: 'voxelId',
        filterStatuses: [VoxelStatus.IN_PROGRESS],
      });

      expect(filteredData.instanceCount).toBe(1);
    });

    it('should respect bounding box filter', async () => {
      const boundingBox: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5000, y: 5000, z: 4000 },
      };

      const allData = await service.getVisualizationData(testProjectId, {
        mode: VoxelVisualizationMode.SOLID,
        colorScheme: VoxelColorScheme.BY_SYSTEM,
        opacity: 0.7,
        showWireframe: false,
        showLabels: false,
        labelField: 'voxelId',
      });

      const boundedData = await service.getVisualizationData(
        testProjectId,
        {
          mode: VoxelVisualizationMode.SOLID,
          colorScheme: VoxelColorScheme.BY_SYSTEM,
          opacity: 0.7,
          showWireframe: false,
          showLabels: false,
          labelField: 'voxelId',
        },
        boundingBox
      );

      expect(boundedData.instanceCount).toBeLessThan(allData.instanceCount);
    });
  });

  // ===========================================================================
  // Activity & Coordination Tests
  // ===========================================================================

  describe('getActivityFeed', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should return activity feed', async () => {
      // Attach some decisions to generate activity
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      await service.attachDecision(allResult.voxels[0].id, 'decision-001');

      const activity = await service.getActivityFeed(testProjectId);

      expect(Array.isArray(activity)).toBe(true);
    });

    it('should filter activity by voxel IDs', async () => {
      const allResult = await service.queryVoxels({ projectId: testProjectId });
      const targetVoxels = allResult.voxels.slice(0, 2).map((v) => v.id);

      const activity = await service.getActivityFeed(
        testProjectId,
        targetVoxels
      );

      expect(Array.isArray(activity)).toBe(true);
    });

    it('should respect activity limit', async () => {
      const limit = 5;
      const activity = await service.getActivityFeed(
        testProjectId,
        undefined,
        limit
      );

      expect(activity.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('createCoordinationSession', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should create coordination session', async () => {
      const participants = ['user-001', 'user-002'];
      const session = await service.createCoordinationSession(
        testProjectId,
        participants
      );

      expect(session.sessionId).toBeDefined();
      expect(session.projectId).toBe(testProjectId);
      expect(session.participants).toEqual(participants);
      expect(session.startedAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
    });
  });

  // ===========================================================================
  // Summary Tests
  // ===========================================================================

  describe('getVoxelSummaries', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should return lightweight summaries', async () => {
      const summaries = await service.getVoxelSummaries(testProjectId);

      expect(summaries.length).toBeGreaterThan(0);

      const summary = summaries[0];
      expect(summary.id).toBeDefined();
      expect(summary.voxelId).toBeDefined();
      expect(summary.coord).toBeDefined();
      expect(summary.center).toBeDefined();
      expect(summary.status).toBeDefined();
      expect(summary.healthStatus).toBeDefined();
      expect(summary.system).toBeDefined();
      expect(summary.decisionCount).toBeDefined();
      expect(summary.color).toBeDefined();
    });
  });

  // ===========================================================================
  // Bounds Query Tests
  // ===========================================================================

  describe('getVoxelsInBounds', () => {
    beforeEach(async () => {
      await service.voxelizeModel(testProjectId, testModelId);
    });

    it('should return voxels in bounding box', async () => {
      const bounds: BoundingBox = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5000, y: 5000, z: 4000 },
      };

      const voxels = await service.getVoxelsInBounds(testProjectId, bounds);

      expect(voxels.length).toBeGreaterThan(0);

      for (const voxel of voxels) {
        expect(voxel.center.x).toBeGreaterThanOrEqual(bounds.min.x);
        expect(voxel.center.x).toBeLessThanOrEqual(bounds.max.x);
        expect(voxel.center.y).toBeGreaterThanOrEqual(bounds.min.y);
        expect(voxel.center.y).toBeLessThanOrEqual(bounds.max.y);
        expect(voxel.center.z).toBeGreaterThanOrEqual(bounds.min.z);
        expect(voxel.center.z).toBeLessThanOrEqual(bounds.max.z);
      }
    });

    it('should return empty for bounds outside model', async () => {
      const bounds: BoundingBox = {
        min: { x: 100000, y: 100000, z: 100000 },
        max: { x: 200000, y: 200000, z: 200000 },
      };

      const voxels = await service.getVoxelsInBounds(testProjectId, bounds);

      expect(voxels.length).toBe(0);
    });
  });
});
