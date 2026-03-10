/**
 * Element Service Unit Tests
 *
 * Comprehensive tests for BIM element management with IFC validation
 *
 * Test Coverage:
 * - CRUD operations for elements
 * - IFC type validation
 * - Redis caching
 * - Cache invalidation
 * - Error handling
 *
 * @module services/__tests__/element.service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElementService, type ElementData } from '../element.service';

// Mock dependencies
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();
const mockRedisDel = vi.fn();
const mockRedis = {
  get: mockRedisGet,
  setex: mockRedisSetex,
  del: mockRedisDel,
};

describe('ElementService', () => {
  let elementService: ElementService;

  beforeEach(() => {
    vi.clearAllMocks();
    elementService = new ElementService(mockPool as any, mockRedis as any);

    // Default mock implementations
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
  });

  // ===========================================================================
  // getElementsByProject Tests
  // ===========================================================================
  describe('getElementsByProject', () => {
    const projectId = 'project-123';
    const mockElements = [
      {
        id: 'elem-1',
        project_id: projectId,
        ifc_guid: 'IFC_001',
        element_type: 'IFCWALL',
        name: 'Wall 1',
        properties: { material: 'concrete' },
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'elem-2',
        project_id: projectId,
        ifc_guid: 'IFC_002',
        element_type: 'IFCBEAM',
        name: 'Beam 1',
        properties: { material: 'steel' },
        status: 'active',
        created_at: '2026-01-01T00:01:00.000Z',
      },
    ];

    it('should return cached elements when available', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify(mockElements));

      const result = await elementService.getElementsByProject(projectId);

      expect(result).toEqual(mockElements);
      expect(mockRedisGet).toHaveBeenCalledWith(`elements:project:${projectId}`);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should query database when cache is empty', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: mockElements });

      const result = await elementService.getElementsByProject(projectId);

      expect(result).toEqual(mockElements);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT ce.*'),
        [projectId]
      );
    });

    it('should cache results for 5 minutes (300 seconds)', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: mockElements });

      await elementService.getElementsByProject(projectId);

      expect(mockRedisSetex).toHaveBeenCalledWith(
        `elements:project:${projectId}`,
        300,
        JSON.stringify(mockElements)
      );
    });

    it('should return empty array when no elements exist', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await elementService.getElementsByProject(projectId);

      expect(result).toEqual([]);
    });

    it('should include created_by_name from users table', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockResolvedValue({ rows: mockElements });

      await elementService.getElementsByProject(projectId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN users u ON ce.created_by = u.id'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // createElement Tests
  // ===========================================================================
  describe('createElement', () => {
    const projectId = 'project-123';

    it('should create element with valid IFC type', async () => {
      const data: ElementData = {
        element_type: 'IFCWALL',
        name: 'Test Wall',
        properties: { height: 3.0 },
      };

      mockQuery.mockResolvedValue({
        rows: [{
          id: 'new-elem-id',
          project_id: projectId,
          element_type: 'IFCWALL',
          name: 'Test Wall',
        }],
      });

      const result = await elementService.createElement(projectId, data);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO construction_elements'),
        expect.arrayContaining([projectId])
      );
    });

    it('should accept all valid IFC types', async () => {
      const validTypes = ['IFCWALL', 'IFCBEAM', 'IFCCOLUMN', 'IFCSLAB', 'IFCDOOR', 'IFCWINDOW'];

      for (const ifcType of validTypes) {
        mockQuery.mockResolvedValue({
          rows: [{ id: `elem-${ifcType}`, element_type: ifcType }],
        });

        const data: ElementData = { element_type: ifcType };
        const result = await elementService.createElement(projectId, data);

        expect(result).toBeDefined();
      }
    });

    it('should normalize IFC type to uppercase', async () => {
      const data: ElementData = { element_type: 'ifcwall' };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem', element_type: 'IFCWALL' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['IFCWALL'])
      );
    });

    it('should throw error for invalid IFC type', async () => {
      const data: ElementData = { element_type: 'INVALID_TYPE' };

      await expect(
        elementService.createElement(projectId, data)
      ).rejects.toThrow('Invalid IFC type: INVALID_TYPE');
    });

    it('should generate IFC GUID when not provided', async () => {
      const data: ElementData = { element_type: 'IFCWALL' };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringMatching(/^IFC_\d+$/)])
      );
    });

    it('should use provided IFC GUID', async () => {
      const data: ElementData = {
        element_type: 'IFCWALL',
        ifc_guid: 'custom-guid-123',
      };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['custom-guid-123'])
      );
    });

    it('should invalidate project cache after creation', async () => {
      const data: ElementData = { element_type: 'IFCWALL' };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockRedisDel).toHaveBeenCalledWith(`elements:project:${projectId}`);
    });

    it('should set default status to planned', async () => {
      const data: ElementData = { element_type: 'IFCWALL' };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem', status: 'planned' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['planned'])
      );
    });

    it('should use provided status', async () => {
      const data: ElementData = {
        element_type: 'IFCWALL',
        status: 'in_progress',
      };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['in_progress'])
      );
    });

    it('should generate default name when not provided', async () => {
      const data: ElementData = { element_type: 'IFCBEAM' };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'new-elem' }],
      });

      await elementService.createElement(projectId, data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['IFCBEAM Element'])
      );
    });
  });

  // ===========================================================================
  // updateElement Tests
  // ===========================================================================
  describe('updateElement', () => {
    const elementId = 'elem-123';

    it('should update element properties', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: elementId,
          project_id: 'project-123',
          properties: { updated: true },
        }],
      });

      const result = await elementService.updateElement(elementId, {
        properties: { updated: true },
      });

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE construction_elements'),
        expect.any(Array)
      );
    });

    it('should update element status', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: elementId,
          project_id: 'project-123',
          status: 'completed',
        }],
      });

      const result = await elementService.updateElement(elementId, {
        status: 'completed',
      });

      expect(result.status).toBe('completed');
    });

    it('should update element name', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: elementId,
          project_id: 'project-123',
          name: 'New Name',
        }],
      });

      await elementService.updateElement(elementId, { name: 'New Name' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('element_name'),
        expect.arrayContaining(['New Name'])
      );
    });

    it('should update multiple fields at once', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: elementId,
          project_id: 'project-123',
        }],
      });

      await elementService.updateElement(elementId, {
        name: 'Updated Name',
        status: 'active',
        properties: { key: 'value' },
      });

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should throw error when no valid fields provided', async () => {
      await expect(
        elementService.updateElement(elementId, {})
      ).rejects.toThrow('No valid fields to update');
    });

    it('should throw error when element not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        elementService.updateElement(elementId, { status: 'active' })
      ).rejects.toThrow('Element not found');
    });

    it('should invalidate project cache after update', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: elementId,
          project_id: 'project-456',
        }],
      });

      await elementService.updateElement(elementId, { status: 'active' });

      expect(mockRedisDel).toHaveBeenCalledWith('elements:project:project-456');
    });

    it('should always set updated_at to NOW()', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: elementId, project_id: 'proj-1' }],
      });

      await elementService.updateElement(elementId, { status: 'active' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // deleteElement Tests
  // ===========================================================================
  describe('deleteElement', () => {
    const elementId = 'elem-to-delete';

    it('should soft delete element by setting status to rejected', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ project_id: 'project-123' }],
      });

      await elementService.deleteElement(elementId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'rejected'"),
        [elementId]
      );
    });

    it('should throw error when element not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        elementService.deleteElement(elementId)
      ).rejects.toThrow('Element not found');
    });

    it('should invalidate project cache after deletion', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ project_id: 'project-789' }],
      });

      await elementService.deleteElement(elementId);

      expect(mockRedisDel).toHaveBeenCalledWith('elements:project:project-789');
    });

    it('should update updated_at timestamp', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ project_id: 'proj-1' }],
      });

      await elementService.deleteElement(elementId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // getElementHistory Tests
  // ===========================================================================
  describe('getElementHistory', () => {
    const elementId = 'elem-with-history';

    it('should return element audit history', async () => {
      const mockHistory = [
        {
          audit_id: 'audit-1',
          change_type: 'UPDATE',
          changed_by: 'user-1',
          changed_at: '2026-01-01T00:00:00.000Z',
          old_values: { status: 'planned' },
          new_values: { status: 'active' },
        },
        {
          audit_id: 'audit-2',
          change_type: 'UPDATE',
          changed_by: 'user-2',
          changed_at: '2026-01-01T01:00:00.000Z',
          old_values: { status: 'active' },
          new_values: { status: 'completed' },
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockHistory });

      const result = await elementService.getElementHistory(elementId);

      expect(result).toEqual(mockHistory);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM audit_logs'),
        [elementId]
      );
    });

    it('should filter by entity_type project_element', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await elementService.getElementHistory(elementId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("entity_type = 'project_element'"),
        expect.any(Array)
      );
    });

    it('should order history by changed_at descending', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await elementService.getElementHistory(elementId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY changed_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no history exists', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await elementService.getElementHistory(elementId);

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        elementService.getElementsByProject('project-123')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        elementService.getElementsByProject('project-123')
      ).rejects.toThrow('Redis connection failed');
    });

    it('should handle JSON stringify of complex properties', async () => {
      const data: ElementData = {
        element_type: 'IFCWALL',
        properties: {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          special: 'with "quotes"',
        },
      };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'elem-1' }],
      });

      await elementService.createElement('proj-1', data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.stringContaining('"nested"')
        ])
      );
    });

    it('should handle null properties', async () => {
      const data: ElementData = {
        element_type: 'IFCWALL',
        properties: undefined,
      };

      mockQuery.mockResolvedValue({
        rows: [{ id: 'elem-1' }],
      });

      await elementService.createElement('proj-1', data);

      // Should stringify empty object
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['{}'])
      );
    });
  });
});
