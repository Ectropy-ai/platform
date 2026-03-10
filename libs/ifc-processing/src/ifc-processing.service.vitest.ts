/**
 * Enterprise Unit Tests - IFC Processing Service
 * Target: 100% code coverage with comprehensive BIM workflow scenarios
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { vi } from 'vitest';
import {
  IFCProcessingService,
  IFCElement,
  IFCProject,
  IFCProcessingResult,
} from '@ectropy/ifc-processing';

// Mock dependencies
vi.mock('pg');
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('path', () => ({
  extname: vi.fn(),
  basename: vi.fn(),
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

describe('IFCProcessingService - Enterprise Unit Tests', () => {
  let ifcService: IFCProcessingService;
  let mockDb: Pool;
  let mockFs: typeof fs;
  let mockPath: typeof path;

  const mockIFCFileContent = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION (('ViewDefinition [CoordinationView]'), '2;1');
FILE_NAME ('test.ifc', '2023-01-01T12:00:00', ('Test Author'), ('Test Organization'), 'IFC Library', 'Test Application', '');
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',$,'Basic Wall:Interior - Partition (92mm):Wall-Interior',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
  `.trim();

  beforeEach(() => {
    // Setup mock database
    mockDb = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    } as any;

    // Setup mock fs - the mocks are already created by vi.mock above
    mockFs = fs as typeof fs;

    // Setup mock path - the mocks are already created by vi.mock above
    mockPath = path as typeof path;

    // Initialize service
    ifcService = new IFCProcessingService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize service correctly', () => {
      expect(ifcService).toBeDefined();
      expect(ifcService).toBeInstanceOf(EventEmitter);
    });

    it('should have all required public methods', () => {
      expect(typeof ifcService.processIFCFile).toBe('function');
      expect(typeof ifcService.getProcessingStats).toBe('function');
    });
  });

  describe('IFC File Processing', () => {
    beforeEach(() => {
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFs.readFileSync).mockReturnValue(mockIFCFileContent);
      vi.mocked(mockPath.extname).mockReturnValue('.ifc');
      vi.mocked(mockPath.basename).mockReturnValue('test.ifc');
    });

    it('should process IFC file successfully', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      // This pattern is standard for database mocking in enterprise test suites
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('project-123');
      expect(result.elementsProcessed).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle file not found error', async () => {
      // Mock fs.readFileSync to throw ENOENT error
      const fileError = new Error(
        'ENOENT: no such file or directory'
      ) as NodeJS.ErrnoException;
      fileError.code = 'ENOENT';
      vi.mocked(mockFs.readFileSync).mockImplementation(() => {
        throw fileError;
      });

      const result = await ifcService.processIFCFile(
        '/path/to/nonexistent.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/ENOENT|no such file/i);
    });

    it('should handle invalid IFC format gracefully', async () => {
      // Invalid IFC content that will result in no parseable elements
      vi.mocked(mockFs.readFileSync).mockReturnValue(
        'Invalid IFC content without proper IFC elements'
      );

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations (no elements to insert)
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/invalid.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true); // Service succeeds but processes 0 elements
      expect(result.elementsProcessed).toBe(0);
    });

    it('should support element filtering by type', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123',
        { filterByType: ['IFCWALL'] }
      );

      expect(result.success).toBe(true);
      // Should process elements (the mock IFC file contains one IFCWALL)
      expect(result.elementsProcessed).toBeGreaterThanOrEqual(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(mockDb.connect).mockRejectedValue(dbError);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/Database connection failed/);
    });
  });

  describe('Processing Statistics', () => {
    it('should return processing statistics for a project', async () => {
      const mockStats = {
        total: 100,
        last_processed: '2023-01-01T12:00:00Z',
      };

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockStats] })
        .mockResolvedValueOnce({
          rows: [{ element_type: 'IFCWALL', count: '50' }],
        })
        .mockResolvedValueOnce({ rows: [{ filename: 'test.ifc' }] });

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const stats = await ifcService.getProcessingStats('project-123');

      expect(stats.totalElements).toBe(100);
      expect(stats.elementsByType).toEqual({ IFCWALL: 50 });
      expect(stats.lastProcessed).toBe('2023-01-01T12:00:00Z');
      expect(stats.ifcFiles).toEqual(['test.ifc']);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle empty project statistics', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total: '0', last_processed: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const stats = await ifcService.getProcessingStats('empty-project');

      expect(stats.totalElements).toBe(0);
      expect(stats.elementsByType).toEqual({});
      expect(stats.ifcFiles).toEqual([]);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should emit processing-failed event on error', async () => {
      const failedHandler = vi.fn();
      ifcService.on('processing-failed', failedHandler);

      // Mock fs.readFileSync to throw ENOENT error
      const fileError = new Error(
        'ENOENT: no such file or directory'
      ) as NodeJS.ErrnoException;
      fileError.code = 'ENOENT';
      vi.mocked(mockFs.readFileSync).mockImplementation(() => {
        throw fileError;
      });

      await ifcService.processIFCFile(
        '/nonexistent.ifc',
        'project-123',
        'user-123'
      );

      expect(failedHandler).toHaveBeenCalled();
    });

    it('should emit processing-completed event on success', async () => {
      const completedHandler = vi.fn();
      ifcService.on('processing-completed', completedHandler);

      // Set up mocks for successful processing
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFs.readFileSync).mockReturnValue(mockIFCFileContent);
      vi.mocked(mockPath.extname).mockReturnValue('.ifc');
      vi.mocked(mockPath.basename).mockReturnValue('test.ifc');

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(completedHandler).toHaveBeenCalled();
    });
  });

  describe('Speckle Integration', () => {
    it('should set Speckle service correctly', () => {
      const mockSpeckleService = {
        createStream: vi.fn(),
        uploadElements: vi.fn(),
      };

      ifcService.setSpeckleService(mockSpeckleService);

      expect(ifcService['speckleService']).toBe(mockSpeckleService);
    });

    it('should create Speckle stream when requested and service is available', async () => {
      const mockSpeckleService = {
        createSpeckleStream: vi.fn().mockResolvedValue('stream-123'),
        commitObjects: vi.fn().mockResolvedValue(true),
      };

      ifcService.setSpeckleService(mockSpeckleService);

      // Set up mocks for successful processing
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFs.readFileSync).mockReturnValue(mockIFCFileContent);
      vi.mocked(mockPath.extname).mockReturnValue('.ifc');
      vi.mocked(mockPath.basename).mockReturnValue('test.ifc');

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123',
        { createSpeckleStream: true }
      );

      expect(result.success).toBe(true);
      expect(result.speckleStreamId).toBeDefined();
      expect(mockSpeckleService.createSpeckleStream).toHaveBeenCalled();
    });

    it('should not create Speckle stream when service is not available', async () => {
      // Don't set Speckle service (it's null by default)

      // Set up mocks for successful processing
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFs.readFileSync).mockReturnValue(mockIFCFileContent);
      vi.mocked(mockPath.extname).mockReturnValue('.ifc');
      vi.mocked(mockPath.basename).mockReturnValue('test.ifc');

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for the database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123',
        { createSpeckleStream: true }
      );

      expect(result.success).toBe(true);
      expect(result.speckleStreamId).toBeUndefined();
    });
  });

  describe('Database Import Edge Cases', () => {
    beforeEach(() => {
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFs.readFileSync).mockReturnValue(mockIFCFileContent);
      vi.mocked(mockPath.extname).mockReturnValue('.ifc');
      vi.mocked(mockPath.basename).mockReturnValue('test.ifc');
    });

    it('should handle existing elements when updateExisting is false', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query to simulate existing element
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Check existing elements - element exists
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/already exists/);
    });

    it('should handle element import errors gracefully', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query to simulate element import error
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements - no existing
        .mockRejectedValueOnce(new Error('Database insert failed')) // Insert element fails
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Failed to import element/);
    });

    it('should handle database transaction rollback on error', async () => {
      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query to simulate transaction error
      mockClient.query.mockRejectedValueOnce(
        new Error('Database connection failed')
      ); // BEGIN transaction fails

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/test.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(false);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('IFC Parsing Edge Cases', () => {
    it('should handle IFC content with various element types', async () => {
      const complexIFCContent = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION (('ViewDefinition [CoordinationView]'), '2;1');
FILE_NAME ('complex.ifc', '2023-01-01T12:00:00', ('Test Author'), ('Test Organization'), 'IFC Library', 'Test Application', '');
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',$,'Basic Wall:Interior - Partition (92mm):Wall-Interior',$,$,$,$,$,$);
#2 = IFCCOLUMN('4qLycLLHggedC6Z4li9A1M',$,'Column','Description',$,$,$,$,$);
#3 = IFCSLAB('5rMzdMMIhheED7a5mj0B2N',$,'Slab',$,$,$,$,$,$);
#4 = IFCBEAM('6sNaeNNJiifeE8b6nk1C3O',$,'Beam',$,$,$,$,$,$);
#5 = IFCSPACE('7tObfOOKjjgfF9c7ol2D4P',$,'Space',$,$,$,$,$,$);
#6 = IFCBUILDINGSTOREY('8uPcgPPLkkgGB0d8pm3E5Q',$,'Ground Floor',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(complexIFCContent);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      // Mock client.query for multiple elements
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValue({ rows: [] }) // Check existing elements (multiple calls)
        .mockResolvedValue({ rows: [{ id: 1 }] }) // Insert element (multiple calls)
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/complex.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.elementsProcessed).toBeGreaterThan(1);
    });

    it('should handle malformed IFC lines gracefully', async () => {
      const malformedIFCContent = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION (('ViewDefinition [CoordinationView]'), '2;1');
FILE_NAME ('malformed.ifc', '2023-01-01T12:00:00', ('Test Author'), ('Test Organization'), 'IFC Library', 'Test Application', '');
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL(; // Malformed line - missing parameters
#2 = INVALID_LINE_FORMAT
#3 = IFCCOLUMN('4qLycLLHggedC6Z4li9A1M',$,'Column',$,$,$,$,$,$); // Valid line
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(malformedIFCContent);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/malformed.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      // Should only process valid elements
      expect(result.elementsProcessed).toBe(1);
    });

    it('should extract different IFC schema versions', async () => {
      const ifc2x3Content = `
ISO-10303-21;
HEADER;
FILE_SCHEMA (('IFC2X3'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',$,'Basic Wall',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(ifc2x3Content);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/ifc2x3.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.elementsProcessed).toBe(1);
    });

    it('should handle IFC lines with materials and relationships', async () => {
      const ifcWithMaterialsContent = `
ISO-10303-21;
HEADER;
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',#2,'Wall with Material',#3,'Description',#4,#5,#6,#7);
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(ifcWithMaterialsContent);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/materials.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.elementsProcessed).toBe(1);
    });

    it('should handle parsing errors in individual IFC lines', async () => {
      const mixedQualityContent = `
ISO-10303-21;
HEADER;
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',$,'Good Wall',$,$,$,$,$,$);
#2 = INVALID_LINE_WITHOUT_PROPER_FORMAT;
#3 = IFCSLAB('5rMzdMMIhheED7a5mj0B2N',$,'Good Slab',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(mixedQualityContent);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValue({ rows: [] }) // Check existing elements (multiple calls)
        .mockResolvedValue({ rows: [{ id: 1 }] }) // Insert element (multiple calls)
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/mixed.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      // Should process valid elements, ignore invalid lines
      expect(result.elementsProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Parameter Parsing Edge Cases', () => {
    it('should handle complex quoted parameters', async () => {
      const complexParamsContent = `
ISO-10303-21;
HEADER;
FILE_SCHEMA (('IFC4'));
ENDSEC;
DATA;
#1 = IFCWALL('3pKxbKKGfgdfB5Y3kh8Z0L',$,'Wall with "quotes"',('Description with, commas'),$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
      `.trim();

      vi.mocked(mockFs.readFileSync).mockReturnValue(complexParamsContent);

      // ENTERPRISE: Type mock client as 'any' to match PoolClient interface in test environment
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      } as any;

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // Check existing elements
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert element
        .mockResolvedValueOnce(undefined); // COMMIT transaction

      vi.mocked(mockDb.connect).mockResolvedValue(mockClient);

      const result = await ifcService.processIFCFile(
        '/path/to/complex.ifc',
        'project-123',
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.elementsProcessed).toBe(1);
    });
  });
});
