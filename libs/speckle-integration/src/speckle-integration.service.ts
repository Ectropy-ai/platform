/**
 * Speckle Integration Service - Main Orchestrator
 * Refactored from the monolithic service into modular components
 *
 * ENTERPRISE FIX (2025-11-23): Added IFC processor integration
 * When IFC processor is attached, IFC uploads are parsed for proper 3D geometry rendering
 */

import type { Pool } from 'pg';
import { EventEmitter } from 'events';
import { z } from 'zod';
import type {
  SpeckleConfig,
  SpeckleSyncResult,
} from './interfaces/speckle.types.js';
import { SpeckleStreamService } from './services/speckle-stream.service.js';
import { SpeckleSyncService } from './services/speckle-sync.service.js';

// Interface for IFC processor (from libs/ifc-processing)
interface IFCProcessor {
  parseIFCFile?(filePath: string): any;
}

// Custom error for Speckle integration
/**
 * Custom error for Speckle integration failures.
 */
class SpeckleIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeckleIntegrationError';
  }
}

// Runtime validation schemas
const ProjectIdSchema = z.string().min(1);
const FilePathSchema = z.string().min(1);

/**
 * Main orchestrator for Speckle integration.
 * Handles project/stream setup, import/export, and event forwarding.
 */
export class SpeckleIntegrationService extends EventEmitter {
  private db: Pool;
  private config: SpeckleConfig;
  private streamService: SpeckleStreamService;
  private syncService: SpeckleSyncService;

  /**
   * Construct a new SpeckleIntegrationService.
   * @param db PostgreSQL connection pool
   * @param config Speckle configuration
   */
  constructor(db: Pool, config: SpeckleConfig) {
    super();
    this.db = db;
    this.config = config;
    this.streamService = new SpeckleStreamService(db, config);
    this.syncService = new SpeckleSyncService(db, config);
    // Forward events from child services
    this.streamService.on('error', (error) => this.emit('error', error));
    this.syncService.on('error', (error) => this.emit('error', error));
    this.streamService.on('streamCreated', (data) =>
      this.emit('streamCreated', data)
    );
    this.syncService.on('importCompleted', (data) =>
      this.emit('importCompleted', data)
    );
    this.syncService.on('exportCompleted', (data) =>
      this.emit('exportCompleted', data)
    );
  }

  /**
   * Initialize project with Speckle integration.
   * Creates a new Speckle stream if needed and returns the stream ID.
   * @param constructionProjectId Project UUID
   * @returns Stream ID
   * @throws SpeckleIntegrationError if project not found
   */
  async initializeProject(constructionProjectId: string): Promise<string> {
    try {
      ProjectIdSchema.parse(constructionProjectId);
      const projectResult = await this.db.query(
        'SELECT name FROM projects WHERE id = $1',
        [constructionProjectId]
      );
      if (projectResult.rows.length === 0) {
        throw new SpeckleIntegrationError(
          `Construction project ${constructionProjectId} not found`
        );
      }
      const projectName: string = projectResult.rows[0].name;
      const streamName = `${projectName} - Ectropy Integration`;
      const streamId = await this.streamService.createStream(
        constructionProjectId,
        streamName
      );
      return streamId;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Import IFC file to Speckle.
   * @param constructionProjectId Project UUID
   * @param ifcFilePath Path to IFC file
   * @param options Optional import options (template filtering)
   * @returns SpeckleSyncResult
   */
  async importIFCFile(
    constructionProjectId: string,
    ifcFilePath: string,
    options: {
      filterByTemplate?: boolean;
      templateIds?: string[];
    } = {}
  ): Promise<SpeckleSyncResult> {
    ProjectIdSchema.parse(constructionProjectId);
    FilePathSchema.parse(ifcFilePath);
    let streamId = await this.getProjectStreamId(constructionProjectId);

    // Validate stream exists in Speckle, handle stale entries
    if (streamId) {
      const streamExists = await this.validateStreamExists(streamId);
      if (!streamExists) {
        // Stale entry - delete from database and create new stream
        await this.deleteStaleStreamEntry(constructionProjectId);
        streamId = null;
      }
    }

    if (!streamId) {
      streamId = await this.initializeProject(constructionProjectId);
    }
    const result = await this.syncService.importIFCToSpeckle(
      constructionProjectId,
      ifcFilePath,
      streamId
    );
    // Include streamId in result for frontend URL updates
    return {
      ...result,
      streamId,
    };
  }

  /**
   * Export elements to Speckle.
   * @param constructionProjectId Project UUID
   * @param elementIds Optional array of element IDs to export
   * @returns SpeckleSyncResult
   */
  async exportElementsToSpeckle(
    constructionProjectId: string,
    elementIds?: string[]
  ): Promise<SpeckleSyncResult> {
    ProjectIdSchema.parse(constructionProjectId);
    const streamId = await this.getProjectStreamId(constructionProjectId);
    if (!streamId) {
      throw new SpeckleIntegrationError(
        `No Speckle stream found for project ${constructionProjectId}`
      );
    }
    return await this.syncService.exportElementsToSpeckle(
      constructionProjectId,
      streamId,
      elementIds
    );
  }

  /**
   * Get all streams for a project.
   * @param constructionProjectId Project UUID
   * @returns Array of stream objects
   */
  async getProjectStreams(constructionProjectId: string): Promise<any[]> {
    ProjectIdSchema.parse(constructionProjectId);
    return this.streamService.getProjectStreams(constructionProjectId);
  }

  /**
   * Get stream information.
   * @param streamId Stream identifier
   * @returns Stream object
   */
  async getStream(streamId: string): Promise<any> {
    return this.streamService.getStream(streamId);
  }

  /**
   * Delete project stream.
   * @param constructionProjectId Project UUID
   * @returns True if deleted or not found
   */
  async deleteProjectStream(constructionProjectId: string): Promise<boolean> {
    ProjectIdSchema.parse(constructionProjectId);
    const streamId = await this.getProjectStreamId(constructionProjectId);
    if (streamId) {
      return this.streamService.deleteStream(streamId);
    }
    return true;
  }

  /**
   * Get stream ID for a construction project.
   * @param constructionProjectId Project UUID
   * @returns Stream ID or null if not found
   */
  private async getProjectStreamId(
    constructionProjectId: string
  ): Promise<string | null> {
    ProjectIdSchema.parse(constructionProjectId);
    const result = await this.db.query(
      'SELECT stream_id FROM speckle_streams WHERE construction_project_id = $1 LIMIT 1',
      [constructionProjectId]
    );
    return result.rows.length > 0 ? result.rows[0].stream_id : null;
  }

  /**
   * Validate that a stream actually exists in Speckle server.
   * Prevents stale database entries from causing 404 errors.
   * @param streamId Stream ID to validate
   * @returns True if stream exists, false otherwise
   */
  private async validateStreamExists(streamId: string): Promise<boolean> {
    try {
      const stream = await this.streamService.getStream(streamId);
      return stream !== null && stream !== undefined && !!stream.id;
    } catch (error) {
      // Stream doesn't exist or GraphQL error
      return false;
    }
  }

  /**
   * Delete stale stream entry from database.
   * Called when stream exists in DB but not in Speckle server.
   * @param constructionProjectId Project UUID
   */
  private async deleteStaleStreamEntry(
    constructionProjectId: string
  ): Promise<void> {
    await this.db.query(
      'DELETE FROM speckle_streams WHERE construction_project_id = $1',
      [constructionProjectId]
    );
    console.warn(
      `[SpeckleIntegration] Deleted stale stream entry for project ${constructionProjectId}`
    );
  }

  /**
   * Set IFC processor for proper geometry parsing during IFC uploads
   * ENTERPRISE INTEGRATION: Enables BIM viewer to display 3D models
   *
   * Without this, IFC files are uploaded as raw documents that won't render.
   * With IFC processor attached, files are parsed and converted to Speckle
   * BuiltElements types (Wall, Beam, Column, etc.) that the viewer can render.
   *
   * @param processor IFC processing service instance with parseIFCFile method
   */
  setIFCProcessor(processor: IFCProcessor): void {
    this.syncService.setIFCProcessor(processor);
    console.info('[SpeckleIntegrationService] IFC processor attached - 3D geometry uploads enabled');
  }

  /**
   * Expose stream service for advanced usage.
   */
  get streams() {
    return this.streamService;
  }
  /**
   * Expose sync service for advanced usage.
   */
  get sync() {
    return this.syncService;
  }
}

// Re-export interfaces for convenience
export * from './interfaces/speckle.types.js';
export { SpeckleStreamService } from './services/speckle-stream.service.js';
export { SpeckleSyncService } from './services/speckle-sync.service.js';
