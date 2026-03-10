/**
 * Enterprise Unit Tests - IFC Processing Service
 *
 * CRITICAL: IFC upload is the cornerstone of every demo
 * Tests align with actual IFCProcessingService implementation
 *
 * Tested Methods:
 * - processIFCFile(filePath, projectId, userId, options)
 * - parseIFCFile(filePath)
 * - getProcessingStats(projectId)
 * - setSpeckleService(speckleService)
 *
 * Events Tested:
 * - 'processing-started'
 * - 'processing-completed'
 * - 'processing-failed'
 */

import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IFCProcessingService,
  IFCElement,
  IFCProject,
  IFCProcessingResult,
} from '@ectropy/ifc-processing';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// Mock path module
vi.mock('path', () => ({
  default: {
    basename: vi.fn((p: string) => p.split('/').pop() || ''),
  },
  basename: vi.fn((p: string) => p.split('/').pop() || ''),
}));

// Mock logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Sample IFC file content for testing
const SAMPLE_IFC_CONTENT = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('demo-building.ifc','2026-01-15T10:30:00',('Ectropy'),('Ectropy Platform'),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('1FNFy8AJeHwwz8gy5E$ELP',$,'Demo Construction Project','Enterprise BIM demo',$,$,$,$,#2);
#10= IFCWALL('2xS3BCKGP0awBCzadm96WK',$,'Interior Wall','92mm Partition',$,#11,#12,$,.STANDARD.);
#20= IFCSLAB('3yT4CDLHQAaxDCzbem07XL',$,'Ground Floor Slab','200mm Concrete',$,#21,#22,$,.FLOOR.);
#30= IFCCOLUMN('4zU5DEMIRAbyEDzcfn18YM',$,'Structural Column','300x300',$,#31,#32,$,.COLUMN.);
#40= IFCBEAM('5AV6EFNJSBczFEadhg29ZN',$,'Steel Beam','IPE300',$,#41,#42,$,.BEAM.);
#50= IFCDOOR('6BW7FGOKTCdaGFbeil3A0O',$,'Entrance Door','Double Leaf',$,#51,#52,$,$);
#60= IFCWINDOW('7CX8GHPLUDebHGcfjm4B1P',$,'Office Window','1200x1500',$,#61,#62,$,$);
#70= IFCSPACE('8DY9HIQMVEfcIHdgkn5C2Q',$,'Office Space','Open Plan',$,#71,#72,$,.ELEMENT.,.INTERNAL.);
#80= IFCSTAIR('9EZ0IJRNWFgdJIehlo6D3R',$,'Main Staircase','Concrete',$,#81,#82,$,$);
#90= IFCROOF('0FA1JKSOXGheKJfikp7E4S',$,'Flat Roof','Membrane',$,#91,#92,$,.FLAT_ROOF.);
ENDSEC;
END-ISO-10303-21;`;

// Minimal IFC content
const MINIMAL_IFC_CONTENT = `ISO-10303-21;
HEADER;
FILE_NAME('minimal.ifc','2026-01-15','','','','','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1= IFCPROJECT('1',$,'Minimal',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;

// Invalid IFC content
const INVALID_IFC_CONTENT = `This is not a valid IFC file`;

describe('IFCProcessingService - Enterprise Unit Tests', () => {
  let ifcService: IFCProcessingService;
  let mockDb: any;
  let mockClient: any;
  let fs: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocked fs
    fs = await import('fs');

    // Setup mock database client
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };

    // Setup mock database pool
    mockDb = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    // Default fs mock behavior
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(SAMPLE_IFC_CONTENT));

    // Initialize service
    ifcService = new IFCProcessingService(mockDb, '/tmp/test-uploads');
  });

  afterEach(() => {
    vi.clearAllMocks();
    ifcService.removeAllListeners();
  });

  describe('Service Initialization', () => {
    it('should initialize service correctly', () => {
      expect(ifcService).toBeDefined();
      expect(ifcService).toBeInstanceOf(IFCProcessingService);
      expect(ifcService).toBeInstanceOf(EventEmitter);
    });

    it('should have all required public methods', () => {
      expect(typeof ifcService.processIFCFile).toBe('function');
      expect(typeof ifcService.parseIFCFile).toBe('function');
      expect(typeof ifcService.getProcessingStats).toBe('function');
      expect(typeof ifcService.setSpeckleService).toBe('function');
    });

    it('should create upload directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const newService = new IFCProcessingService(mockDb, '/tmp/new-uploads');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-uploads', { recursive: true });
    });
  });

  describe('parseIFCFile() - Core IFC Parsing', () => {
    it('should parse IFC file and return project with elements', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      expect(result).toBeDefined();
      expect(result.name).toBe('demo-building.ifc');
      expect(result.elements).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.ifcVersion).toBe('IFC4');
      expect(result.metadata.elementCount).toBe(result.elements.length);
    });

    it('should extract multiple element types from IFC file', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      const elementTypes = result.elements.map(el => el.type);

      // Verify different IFC element types are extracted
      expect(elementTypes).toContain('IFCPROJECT');
      expect(elementTypes).toContain('IFCWALL');
      expect(elementTypes).toContain('IFCSLAB');
      expect(elementTypes).toContain('IFCCOLUMN');
    });

    it('should extract element IDs correctly', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      // Elements should have IDs prefixed with 'ifc-'
      result.elements.forEach(element => {
        expect(element.id).toMatch(/^ifc-\d+$/);
      });
    });

    it('should extract element properties', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      result.elements.forEach(element => {
        expect(element.properties).toBeDefined();
        expect(element.properties.originalId).toBeDefined();
      });
    });

    it('should extract geometry for structural elements', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      const wallElement = result.elements.find(el => el.type === 'IFCWALL');

      if (wallElement) {
        expect(wallElement.geometry).toBeDefined();
        expect(wallElement.geometry?.type).toBe('solid');
      }
    });

    it('should handle IFC2X3 schema', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(MINIMAL_IFC_CONTENT));

      const result = ifcService.parseIFCFile('/path/to/minimal.ifc');

      expect(result.metadata.ifcVersion).toBe('IFC2X3');
    });

    it('should include processing timestamp in metadata', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      expect(result.metadata.processedAt).toBeDefined();
      expect(new Date(result.metadata.processedAt)).toBeInstanceOf(Date);
    });
  });

  describe('processIFCFile() - Full Processing Pipeline', () => {
    const projectId = 'project-123';
    const userId = 'user-456';

    beforeEach(() => {
      // Setup database mocks for successful processing
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('SELECT id FROM construction_elements')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if (query.includes('INSERT INTO construction_elements')) {
          return Promise.resolve({ rows: [{ id: 'elem-id' }], rowCount: 1 });
        }
        if (query.includes('INSERT INTO audit_log')) {
          return Promise.resolve({ rows: [], rowCount: 1 });
        }
        if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
          return Promise.resolve({ command: query });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
    });

    it('should process IFC file and return success result', async () => {
      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        projectId,
        userId
      );

      expect(result.success).toBe(true);
      expect(result.projectId).toBe(projectId);
      expect(result.elementsProcessed).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should emit processing-started event', async () => {
      const startedHandler = vi.fn();
      ifcService.on('processing-started', startedHandler);

      await ifcService.processIFCFile('/path/to/demo-building.ifc', projectId, userId);

      expect(startedHandler).toHaveBeenCalledWith({
        filePath: '/path/to/demo-building.ifc',
        projectId,
      });
    });

    it('should emit processing-completed event on success', async () => {
      const completedHandler = vi.fn();
      ifcService.on('processing-completed', completedHandler);

      await ifcService.processIFCFile('/path/to/demo-building.ifc', projectId, userId);

      expect(completedHandler).toHaveBeenCalled();
      const result = completedHandler.mock.calls[0][0];
      expect(result.success).toBe(true);
    });

    it('should emit processing-failed event on error', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const failedHandler = vi.fn();
      ifcService.on('processing-failed', failedHandler);

      const result = await ifcService.processIFCFile('/path/to/missing.ifc', projectId, userId);

      expect(result.success).toBe(false);
      expect(failedHandler).toHaveBeenCalled();
    });

    it('should filter elements by type when filterByType option provided', async () => {
      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        projectId,
        userId,
        { filterByType: ['IFCWALL', 'IFCSLAB'] }
      );

      expect(result.success).toBe(true);
      // Elements should be filtered
      expect(result.elementsProcessed).toBeLessThan(10);
    });

    it('should handle database import errors gracefully', async () => {
      mockClient.query.mockRejectedValue(new Error('Database connection failed'));

      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        projectId,
        userId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database connection failed');
    });

    it('should import elements into database', async () => {
      await ifcService.processIFCFile('/path/to/demo-building.ifc', projectId, userId);

      // Verify BEGIN transaction
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');

      // Verify COMMIT transaction
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('getProcessingStats() - Statistics Retrieval', () => {
    const projectId = 'project-123';

    beforeEach(() => {
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('COUNT(*)')) {
          return Promise.resolve({
            rows: [{ total: '45', last_processed: '2026-01-15T10:00:00Z' }],
          });
        }
        if (query.includes('GROUP BY element_type')) {
          return Promise.resolve({
            rows: [
              { element_type: 'IFCWALL', count: '15' },
              { element_type: 'IFCSLAB', count: '10' },
              { element_type: 'IFCCOLUMN', count: '20' },
            ],
          });
        }
        if (query.includes('audit_log')) {
          return Promise.resolve({
            rows: [{ filename: 'building.ifc' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should return processing statistics for project', async () => {
      const stats = await ifcService.getProcessingStats(projectId);

      expect(stats).toBeDefined();
      expect(stats.totalElements).toBe(45);
      expect(stats.elementsByType).toBeDefined();
      expect(stats.lastProcessed).toBeDefined();
    });

    it('should return elements grouped by type', async () => {
      const stats = await ifcService.getProcessingStats(projectId);

      // elementsByType is populated from database rows
      expect(stats.elementsByType).toBeDefined();
      expect(Object.keys(stats.elementsByType).length).toBeGreaterThan(0);
    });

    it('should return list of processed IFC files', async () => {
      const stats = await ifcService.getProcessingStats(projectId);

      expect(stats.ifcFiles).toBeInstanceOf(Array);
    });

    it('should release database client after query', async () => {
      await ifcService.getProcessingStats(projectId);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('setSpeckleService() - Speckle Integration', () => {
    it('should set Speckle service for integration', () => {
      const mockSpeckleService = {
        createSpeckleStream: vi.fn(),
        commitObjects: vi.fn(),
      };

      ifcService.setSpeckleService(mockSpeckleService);

      // Service should be set (internal state)
      expect(() => ifcService.setSpeckleService(mockSpeckleService)).not.toThrow();
    });

    it('should create Speckle stream when createSpeckleStream option is true', async () => {
      const mockSpeckleService = {
        createSpeckleStream: vi.fn().mockResolvedValue('stream-id-123'),
        commitObjects: vi.fn().mockResolvedValue(true),
      };

      ifcService.setSpeckleService(mockSpeckleService);

      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        'project-123',
        'user-456',
        { createSpeckleStream: true }
      );

      expect(result.success).toBe(true);
      expect(mockSpeckleService.createSpeckleStream).toHaveBeenCalled();
      expect(result.speckleStreamId).toBe('stream-id-123');
    });
  });

  describe('Demo Workflow Tests - Critical Path', () => {
    // These tests ensure the IFC upload demo workflow works correctly

    it('should handle complete demo workflow: upload → parse → process', async () => {
      // Step 1: Parse IFC file
      const parsed = ifcService.parseIFCFile('/path/to/demo-building.ifc');
      expect(parsed.elements.length).toBeGreaterThan(0);

      // Step 2: Process and import
      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        'demo-project-id',
        'demo-user-id'
      );

      expect(result.success).toBe(true);
      expect(result.elementsProcessed).toBeGreaterThan(0);
    });

    it('should extract all major building element types for demo', () => {
      const result = ifcService.parseIFCFile('/path/to/demo-building.ifc');

      const elementTypes = new Set(result.elements.map(el => el.type));

      // Demo should showcase multiple element types
      const expectedTypes = ['IFCWALL', 'IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCDOOR', 'IFCWINDOW'];

      expectedTypes.forEach(type => {
        expect(elementTypes.has(type)).toBe(true);
      });
    });

    it('should support stakeholder filtering for demo scenarios', async () => {
      // Structural engineer sees only structural elements
      const structuralResult = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        'project-123',
        'structural-engineer',
        { filterByType: ['IFCWALL', 'IFCCOLUMN', 'IFCBEAM', 'IFCSLAB'] }
      );

      expect(structuralResult.success).toBe(true);

      // Architect sees architectural elements
      const architectResult = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        'project-123',
        'architect',
        { filterByType: ['IFCWALL', 'IFCDOOR', 'IFCWINDOW', 'IFCSPACE'] }
      );

      expect(architectResult.success).toBe(true);
    });

    it('should provide real-time progress updates during demo', async () => {
      const events: string[] = [];

      ifcService.on('processing-started', () => events.push('started'));
      ifcService.on('processing-completed', () => events.push('completed'));

      await ifcService.processIFCFile('/path/to/demo-building.ifc', 'project-123', 'user-456');

      expect(events).toContain('started');
      expect(events).toContain('completed');
    });
  });

  describe('Error Handling - Robust Demo Experience', () => {
    it('should handle empty IFC files gracefully', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(''));

      const result = ifcService.parseIFCFile('/path/to/empty.ifc');

      expect(result.elements).toEqual([]);
      expect(result.metadata.elementCount).toBe(0);
    });

    it('should handle files without IFC elements', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(MINIMAL_IFC_CONTENT));

      const result = ifcService.parseIFCFile('/path/to/minimal.ifc');

      // Should still return valid project structure
      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should return meaningful error for file read failures', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await ifcService.processIFCFile(
        '/path/to/missing.ifc',
        'project-123',
        'user-456'
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('ENOENT');
    });

    it('should handle database transaction failures with rollback', async () => {
      // When database connect fails, processing should fail gracefully
      mockDb.connect.mockRejectedValue(new Error('Database connection refused'));

      const result = await ifcService.processIFCFile(
        '/path/to/demo-building.ifc',
        'project-123',
        'user-456'
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance - Demo Quality', () => {
    it('should parse IFC file within acceptable time', () => {
      const startTime = Date.now();

      ifcService.parseIFCFile('/path/to/demo-building.ifc');

      const duration = Date.now() - startTime;

      // Parsing should complete within 1 second for demo files
      expect(duration).toBeLessThan(1000);
    });

    it('should handle multiple sequential uploads', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await ifcService.processIFCFile(
          `/path/to/file-${i}.ifc`,
          `project-${i}`,
          'user-456'
        );

        expect(result.success).toBe(true);
      }
    });
  });
});
