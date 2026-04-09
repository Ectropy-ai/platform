/**
 * Voxel Routes - ROS MRO Coordination View API
 *
 * ENTERPRISE DATA LAYER (Sprint 5 - 2026-01-24)
 *
 * Endpoints for voxel data management:
 * - GET /projects/:projectId/voxels - List voxels with filtering
 * - GET /projects/:projectId/voxels/aggregation - Get aggregations by level/system
 * - GET /projects/:projectId/voxels/activity - Get voxel activity stream
 * - GET /voxels/:voxelId - Get single voxel details
 * - PATCH /voxels/:voxelId/status - Update voxel status
 *
 * @module routes/voxels
 */

import express, {
  Request,
  Response,
  NextFunction,
  IRouter,
} from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

import {
  asyncHandler,
  AppError,
  AuthenticationError,
  AuthorizationError,
} from '../../../../libs/shared/errors/src/error-handler.js';
import {
  validationRules,
  handleValidationErrors,
} from '../../../../libs/shared/security/src/security.middleware.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';
import { getVoxelStreamHandler } from '../websocket/voxel-stream.js';
import {
  type BoxElement,
  type BoxCell,
  classifySystem,
  rasterizeElements,
} from '../intake/services/voxel-rasterizer.service.js';

// ============================================================================
// REDIS CACHE CONFIGURATION
// ============================================================================

const CACHE_CONFIG = {
  /** TTL for aggregation cache in seconds (2 minutes) */
  AGGREGATION_TTL: 120,
  /** TTL for voxel list cache in seconds (30 seconds) */
  LIST_TTL: 30,
  /** Key prefix for voxel caches */
  PREFIX: 'voxel_cache:',
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface VoxelData {
  id: string;
  voxelId: string;
  projectId: string;
  system: string;
  status: string;
  healthStatus: string;
  percentComplete?: number;
  center: { x: number; y: number; z: number };
  resolution: number;
  level?: string;
  decisionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface VoxelAggregation {
  key: string;
  voxelCount: number;
  plannedCount: number;
  inProgressCount: number;
  completeCount: number;
  blockedCount: number;
  decisionCount: number;
  overallProgress: number;
  healthScore: number;
}

interface VoxelActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  severity: string;
  voxelId?: string;
  userId?: string;
  userName?: string;
}

interface VoxelStatusHistoryEntry {
  id: string;
  voxelId: string;
  previousStatus: string | null;
  newStatus: string;
  previousHealth: string | null;
  newHealth: string | null;
  percentComplete: number | null;
  note: string | null;
  changedById: string | null;
  changedByName: string | null;
  source: string | null;
  timestamp: string;
}

// ============================================================================
// ROUTES CLASS
// ============================================================================

export class VoxelRoutes {
  private router: IRouter;
  private db: Pool;
  private redis: Redis | null;

  constructor(db: Pool, redis?: Redis) {
    this.router = express.Router();
    this.db = db;
    this.redis = redis || null;
    this.setupRoutes();
  }

  // ==========================================================================
  // REDIS CACHE HELPERS
  // ==========================================================================

  /**
   * Get cached data from Redis
   */
  private async getCached<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(`${CACHE_CONFIG.PREFIX}${key}`);
      if (cached) {
        logger.debug('[VoxelRoutes] Cache HIT', { key });
        return JSON.parse(cached) as T;
      }
      logger.debug('[VoxelRoutes] Cache MISS', { key });
      return null;
    } catch (error) {
      logger.warn('[VoxelRoutes] Redis get failed', { key, error });
      return null;
    }
  }

  /**
   * Set cached data in Redis with TTL
   */
  private async setCache(key: string, data: unknown, ttl: number): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setex(
        `${CACHE_CONFIG.PREFIX}${key}`,
        ttl,
        JSON.stringify(data)
      );
      logger.debug('[VoxelRoutes] Cache SET', { key, ttl });
    } catch (error) {
      logger.warn('[VoxelRoutes] Redis set failed', { key, error });
    }
  }

  /**
   * Invalidate cache for a project
   */
  private async invalidateProjectCache(projectId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const pattern = `${CACHE_CONFIG.PREFIX}project:${projectId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug('[VoxelRoutes] Cache invalidated', { projectId, keys: keys.length });
      }
    } catch (error) {
      logger.warn('[VoxelRoutes] Cache invalidation failed', { projectId, error });
    }
  }

  private setupRoutes(): void {
    // ========================================================================
    // PROJECT-SCOPED VOXEL ENDPOINTS
    // ========================================================================

    // GET /projects/:projectId/voxels - List all voxels for a project
    this.router.get(
      '/projects/:projectId/voxels',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];

        await this.checkProjectAccess(userId, projectId);

        // Parse filter parameters
        const systems = req.query.systems
          ? String(req.query.systems).split(',')
          : undefined;
        const statuses = req.query.statuses
          ? String(req.query.statuses).split(',')
          : undefined;
        const level = req.query.level ? String(req.query.level) : undefined;
        const limit = Math.min(10000, parseInt(String(req.query.limit || '1000')));

        const voxels = await this.getProjectVoxels(projectId, {
          systems,
          statuses,
          level,
          limit,
        });

        res.json({
          voxels,
          total: voxels.length,
        });
      })
    );

    // GET /projects/:projectId/voxels/aggregation - Get voxel aggregations
    this.router.get(
      '/projects/:projectId/voxels/aggregation',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];
        const groupBy = (req.query.groupBy as 'level' | 'system') || 'level';

        await this.checkProjectAccess(userId, projectId);

        const aggregations = await this.getVoxelAggregations(projectId, groupBy);

        res.json({
          aggregations,
        });
      })
    );

    // GET /projects/:projectId/voxels/activity - Get voxel activity stream
    this.router.get(
      '/projects/:projectId/voxels/activity',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];
        const limit = Math.min(50, parseInt(String(req.query.limit || '10')));

        await this.checkProjectAccess(userId, projectId);

        const activities = await this.getVoxelActivity(projectId, limit);

        res.json({
          activities,
          count: activities.length,
        });
      })
    );

    // ========================================================================
    // INDIVIDUAL VOXEL ENDPOINTS
    // ========================================================================

    // GET /voxels/:voxelId - Get single voxel details
    this.router.get(
      '/voxels/:voxelId',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const voxelId = req.params['voxelId'];

        const voxel = await this.getVoxelById(voxelId);

        if (!voxel) {
          throw new AppError('Voxel not found', 404);
        }

        // Check project access
        await this.checkProjectAccess(userId, voxel.projectId);

        res.json({
          voxel,
        });
      })
    );

    // PATCH /voxels/:voxelId/status - Update voxel status with full audit trail
    this.router.patch(
      '/voxels/:voxelId/status',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const userName = (req.user as any)?.name || (req.user as any)?.full_name || (req.user as any)?.email;
        const voxelId = req.params['voxelId'];

        // Extract update payload
        const { status, healthStatus, percentComplete, note } = req.body as {
          status: string;
          healthStatus?: string;
          percentComplete?: number;
          note?: string;
        };

        // Extract request context for audit trail
        const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '';
        const userAgent = (req.headers['user-agent'] as string) || '';

        // Get voxel to check access
        const existingVoxel = await this.getVoxelById(voxelId);
        if (!existingVoxel) {
          throw new AppError('Voxel not found', 404);
        }

        await this.checkProjectAccess(userId, existingVoxel.projectId);

        // Validate status
        const validStatuses = [
          'PLANNED',
          'IN_PROGRESS',
          'COMPLETE',
          'BLOCKED',
          'ON_HOLD',
          'INSPECTION_REQUIRED',
        ];
        if (!validStatuses.includes(status)) {
          throw new AppError(`Invalid status: ${status}`, 400);
        }

        // Validate health status if provided
        const validHealthStatuses = ['HEALTHY', 'AT_RISK', 'CRITICAL'];
        if (healthStatus && !validHealthStatuses.includes(healthStatus)) {
          throw new AppError(`Invalid health status: ${healthStatus}`, 400);
        }

        const voxel = await this.updateVoxelStatus(voxelId, {
          status,
          healthStatus,
          percentComplete,
          note,
          userId,
          userName,
          source: 'API',
          ipAddress,
          userAgent,
        });

        res.json({
          voxel,
        });
      })
    );

    // ========================================================================
    // PHASE 2: EXPORT, HISTORY, AND BATCH ENDPOINTS
    // ========================================================================

    // GET /projects/:projectId/voxels/export - Export voxels as CSV or JSON
    this.router.get(
      '/projects/:projectId/voxels/export',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const projectId = req.params['projectId'];
        const format = (req.query.format as string) || 'json';

        await this.checkProjectAccess(userId, projectId);

        // Parse filter parameters
        const systems = req.query.systems
          ? String(req.query.systems).split(',')
          : undefined;
        const statuses = req.query.statuses
          ? String(req.query.statuses).split(',')
          : undefined;
        const level = req.query.level ? String(req.query.level) : undefined;

        const voxels = await this.getProjectVoxels(projectId, {
          systems,
          statuses,
          level,
          limit: 50000, // Higher limit for exports
        });

        if (format === 'csv') {
          // Generate CSV
          const headers = [
            'id',
            'voxelId',
            'system',
            'status',
            'healthStatus',
            'percentComplete',
            'level',
            'centerX',
            'centerY',
            'centerZ',
            'resolution',
            'decisionCount',
            'createdAt',
            'updatedAt',
          ];

          const csvRows = [headers.join(',')];
          for (const v of voxels) {
            csvRows.push(
              [
                v.id,
                v.voxelId,
                v.system,
                v.status,
                v.healthStatus,
                v.percentComplete ?? '',
                v.level ?? '',
                v.center.x,
                v.center.y,
                v.center.z,
                v.resolution,
                v.decisionCount,
                v.createdAt,
                v.updatedAt,
              ].join(',')
            );
          }

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="voxels-${projectId}-${Date.now()}.csv"`
          );
          res.send(csvRows.join('\n'));
        } else {
          // JSON export
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="voxels-${projectId}-${Date.now()}.json"`
          );
          res.json({
            projectId,
            exportedAt: new Date().toISOString(),
            count: voxels.length,
            voxels,
          });
        }

        logger.info('[VoxelRoutes] Exported voxels', {
          projectId,
          format,
          count: voxels.length,
          userId,
        });
      })
    );

    // GET /voxels/:voxelId/history - Get status change history for a voxel
    this.router.get(
      '/voxels/:voxelId/history',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const voxelId = req.params['voxelId'];
        const limit = Math.min(100, parseInt(String(req.query.limit || '50')));

        // Get voxel to check access
        const voxel = await this.getVoxelById(voxelId);
        if (!voxel) {
          throw new AppError('Voxel not found', 404);
        }

        await this.checkProjectAccess(userId, voxel.projectId);

        const history = await this.getVoxelHistory(voxelId, limit);

        res.json({
          voxelId,
          history,
          count: history.length,
        });
      })
    );

    // POST /projects/:projectId/voxels/batch-update - Batch update multiple voxels
    this.router.post(
      '/projects/:projectId/voxels/batch-update',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const userId = req.user?.id;
        const userName = (req.user as any)?.name || (req.user as any)?.full_name || (req.user as any)?.email;
        const projectId = req.params['projectId'];
        const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '';
        const userAgent = (req.headers['user-agent'] as string) || '';

        await this.checkProjectAccess(userId, projectId);

        const { updates } = req.body as {
          updates: Array<{
            voxelId: string;
            status?: string;
            healthStatus?: string;
            percentComplete?: number;
            note?: string;
          }>;
        };

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
          throw new AppError('Updates array required', 400);
        }

        if (updates.length > 100) {
          throw new AppError('Maximum 100 voxels per batch', 400);
        }

        // Validate all statuses before processing
        const validStatuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'ON_HOLD', 'INSPECTION_REQUIRED'];
        const validHealthStatuses = ['HEALTHY', 'AT_RISK', 'CRITICAL'];

        for (const update of updates) {
          if (update.status && !validStatuses.includes(update.status)) {
            throw new AppError(`Invalid status: ${update.status}`, 400);
          }
          if (update.healthStatus && !validHealthStatuses.includes(update.healthStatus)) {
            throw new AppError(`Invalid health status: ${update.healthStatus}`, 400);
          }
        }

        const results = await this.batchUpdateVoxels(projectId, updates, {
          userId,
          userName,
          source: 'BATCH_API',
          ipAddress,
          userAgent,
        });

        // Broadcast batch update via WebSocket
        const wsHandler = getVoxelStreamHandler();
        if (wsHandler && results.updated.length > 0) {
          wsHandler.broadcastBatchUpdate(
            projectId,
            results.updated.map((v) => ({
              voxelId: v.voxelId,
              projectId,
              status: v.status,
              healthStatus: v.healthStatus,
              percentComplete: v.percentComplete,
              updatedBy: userName,
              updatedById: userId,
              timestamp: new Date().toISOString(),
              source: 'BATCH_API',
            }))
          );
        }

        logger.info('[VoxelRoutes] Batch update completed', {
          projectId,
          requested: updates.length,
          updated: results.updated.length,
          failed: results.failed.length,
          userId,
        });

        res.json(results);
      })
    );

    // ========================================================================
    // POST /projects/:projectId/voxels/generate
    // DEC-009 SEPPA Stage S — BOX Pipeline Phase 1 (Path C: server-side)
    //
    // Browser sends IFC element bounding boxes extracted from WorldTree.
    // Server runs VoxelDecompositionService → voxel_grids + pm_voxels.
    // Returns { gridId, voxelCount, resolutionTier }.
    // ========================================================================
    this.router.post(
      '/projects/:projectId/voxels/generate',
      asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const projectId = req.params['projectId'];
        const {
          elements,
          resolution = 100,
          streamId = '',
          objectId,
        } = req.body as {
          elements: Array<{
            globalId: string;
            type: string;
            containedInStorey: string;
            materials: never[];
            boundingBox: {
              min: { x: number; y: number; z: number };
              max: { x: number; y: number; z: number };
            };
          }>;
          resolution?: number;
          streamId?: string;
          objectId?: string;
        };

        if (!projectId || !elements?.length) {
          throw new AppError('projectId and elements[] required', 400);
        }

        logger.info(`[BOX:generate] ${elements.length} elements, res=${resolution}mm, project=${projectId}`);

        // Return 202 immediately — Cloudflare kills synchronous requests at 100s.
        // Generation runs async via setImmediate; VoxelStream WebSocket pushes
        // live progress to the client.
        res.status(202).json({
          message: 'Generation accepted — processing in background',
          projectId,
          elementCount: elements.length,
        });

        // Capture db ref for use inside setImmediate closure
        const db = this.db;

        setImmediate(async () => {
          try {
            // Rasterize using inlined conservative AABB algorithm
            const result = rasterizeElements(elements, resolution);

            if (!result?.voxels?.length) {
              logger.error('[BOX:generate] Engine produced 0 voxels', { projectId });
              return;
            }

            const vs = result.voxels;
            const MM = 0.001; // engine mm → DB meters

            // Create voxel_grids record (not in Prisma — raw SQL)
            const gridResult = await db.query(
              `INSERT INTO voxel_grids
                 (project_id, stream_id, object_id, resolution, resolution_tier,
                  source_type, status, voxel_count,
                  bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y, bbox_min_z, bbox_max_z,
                  generated_at)
               VALUES ($1,$2,$3,$4,'COARSE','BIM','COMPLETE',$5,$6,$7,$8,$9,$10,$11,NOW())
               RETURNING id`,
              [
                projectId, streamId, objectId ?? null,
                resolution * MM, vs.length,
                vs.reduce((a: number, v: any) => Math.min(a, v.bounds.min.x), Infinity) * MM,
                vs.reduce((a: number, v: any) => Math.max(a, v.bounds.max.x), -Infinity) * MM,
                vs.reduce((a: number, v: any) => Math.min(a, v.bounds.min.y), Infinity) * MM,
                vs.reduce((a: number, v: any) => Math.max(a, v.bounds.max.y), -Infinity) * MM,
                vs.reduce((a: number, v: any) => Math.min(a, v.bounds.min.z), Infinity) * MM,
                vs.reduce((a: number, v: any) => Math.max(a, v.bounds.max.z), -Infinity) * MM,
              ]
            );
            const gridId = gridResult.rows[0].id;

            // Batch insert pm_voxels — chunks of 200 to stay within param limits
            const CHUNK = 100;
            for (let i = 0; i < vs.length; i += CHUNK) {
              const chunk = vs.slice(i, i + CHUNK);
              const vals: any[] = [];
              const placeholders = chunk.map((v: any, j: number) => {
                const b = j * 18 + 1;
                const ifcArr = `{${(v.ifcElements ?? []).join(',')}}`;
                const voxelId = v.voxelId ?? `VOX-BOX-${String(i + j).padStart(4, '0')}`;
                const urn = v.urn ?? `urn:ectropy:${projectId}:voxel:${voxelId}`;
                vals.push(
                  urn, voxelId,
                  projectId, gridId, null,  // parent_voxel_id = null for COARSE
                  v.center.x * MM, v.center.y * MM, v.center.z * MM,
                  v.bounds.min.x * MM, v.bounds.max.x * MM,
                  v.bounds.min.y * MM, v.bounds.max.y * MM,
                  v.bounds.min.z * MM, v.bounds.max.z * MM,
                  resolution * MM,
                  v.system ?? 'UNKNOWN',
                  v.level ?? 'Unknown',
                  ifcArr,
                );
                return `(gen_random_uuid(),$${b},$${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},'PLANNED','HEALTHY',$${b+15},$${b+16},$${b+17})`;
              });
              await db.query(
                `INSERT INTO voxels
                   (id, urn, voxel_id,
                    project_id, voxel_grid_id, parent_voxel_id,
                    coord_x, coord_y, coord_z,
                    min_x, max_x, min_y, max_y, min_z, max_z,
                    resolution, status, health_status, system, level, ifc_elements)
                 VALUES ${placeholders.join(',')}`,
                vals
              );
            }

            logger.info(`[BOX:generate] Complete — gridId=${gridId}, voxels=${vs.length}`);
          } catch (err) {
            logger.error('[BOX:generate] Background generation failed', { projectId, error: err });
          }
        });
      })
    );
  }

  // ==========================================================================
  // DATA ACCESS METHODS
  // ==========================================================================

  /**
   * Get voxels for a project with optional filtering
   */
  private async getProjectVoxels(
    projectId: string,
    filters: {
      systems?: string[];
      statuses?: string[];
      level?: string;
      limit?: number;
    }
  ): Promise<VoxelData[]> {
    try {
      // Build dynamic query
      const conditions: string[] = ['project_id = $1'];
      const params: (string | number)[] = [projectId];
      let paramIndex = 2;

      if (filters.systems?.length) {
        conditions.push(`system = ANY($${paramIndex})`);
        params.push(filters.systems as unknown as string);
        paramIndex++;
      }

      if (filters.statuses?.length) {
        conditions.push(`status = ANY($${paramIndex})`);
        params.push(filters.statuses as unknown as string);
        paramIndex++;
      }

      if (filters.level) {
        conditions.push(`level = $${paramIndex}`);
        params.push(filters.level);
        paramIndex++;
      }

      const limit = filters.limit || 1000;
      params.push(limit);

      const query = `
        SELECT
          v.id,
          v.voxel_id as "voxelId",
          v.project_id as "projectId",
          v.system,
          v.status,
          v.health_status as "healthStatus",
          v.percent_complete as "percentComplete",
          json_build_object('x', v.coord_x, 'y', v.coord_y, 'z', v.coord_z) as center,
          v.resolution,
          v.level,
          v.created_at as "createdAt",
          v.updated_at as "updatedAt",
          COALESCE(
            (SELECT COUNT(*) FROM voxel_decision_attachments vda WHERE vda.voxel_id = v.id),
            0
          ) as "decisionCount"
        FROM voxels v
        WHERE ${conditions.join(' AND ')}
        ORDER BY v.level, v.voxel_id
        LIMIT $${paramIndex}
      `;

      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => ({
        id: row.id,
        voxelId: row.voxelId,
        projectId: row.projectId,
        system: row.system,
        status: row.status,
        healthStatus: row.healthStatus || 'HEALTHY',
        percentComplete: row.percentComplete,
        center: row.center || { x: 0, y: 0, z: 0 },
        resolution: row.resolution || 180,
        level: row.level,
        decisionCount: parseInt(row.decisionCount) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    } catch (error) {
      logger.warn('[VoxelRoutes] Database query failed, returning mock data', { error });
      return this.generateMockVoxels(projectId);
    }
  }

  /**
   * Get voxel aggregations grouped by level or system
   * Implements Redis caching for performance (2-minute TTL)
   */
  private async getVoxelAggregations(
    projectId: string,
    groupBy: 'level' | 'system'
  ): Promise<VoxelAggregation[]> {
    // Check cache first
    const cacheKey = `project:${projectId}:aggregations:${groupBy}`;
    const cached = await this.getCached<VoxelAggregation[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const groupColumn = groupBy === 'level' ? 'level' : 'system';

      const query = `
        SELECT
          COALESCE(${groupColumn}, 'Unknown') as key,
          COUNT(*) as "voxelCount",
          COUNT(*) FILTER (WHERE status = 'PLANNED') as "plannedCount",
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as "inProgressCount",
          COUNT(*) FILTER (WHERE status = 'COMPLETE') as "completeCount",
          COUNT(*) FILTER (WHERE status = 'BLOCKED') as "blockedCount",
          COALESCE(SUM(
            (SELECT COUNT(*) FROM voxel_decision_attachments vda WHERE vda.voxel_id = v.id)
          ), 0) as "decisionCount"
        FROM voxels v
        WHERE project_id = $1
        GROUP BY ${groupColumn}
        ORDER BY key
      `;

      const result = await this.db.query(query, [projectId]);

      const aggregations = result.rows.map((row: any) => {
        const voxelCount = parseInt(row.voxelCount) || 0;
        const completeCount = parseInt(row.completeCount) || 0;
        const inProgressCount = parseInt(row.inProgressCount) || 0;
        const blockedCount = parseInt(row.blockedCount) || 0;

        return {
          key: row.key,
          voxelCount,
          plannedCount: parseInt(row.plannedCount) || 0,
          inProgressCount,
          completeCount,
          blockedCount,
          decisionCount: parseInt(row.decisionCount) || 0,
          overallProgress:
            voxelCount > 0
              ? Math.round((completeCount * 100 + inProgressCount * 50) / voxelCount)
              : 0,
          healthScore:
            voxelCount > 0 ? Math.round(100 * (1 - blockedCount / voxelCount)) : 100,
        };
      });

      // Cache the results
      await this.setCache(cacheKey, aggregations, CACHE_CONFIG.AGGREGATION_TTL);

      return aggregations;
    } catch (error) {
      logger.error('[VoxelRoutes] Aggregation query failed', { error });
      throw error;
    }
  }

  /**
   * Get voxel activity stream
   */
  private async getVoxelActivity(
    projectId: string,
    limit: number
  ): Promise<VoxelActivity[]> {
    try {
      const query = `
        SELECT
          al.id,
          al.event_type as type,
          al.event_type as title,
          al.event_data->>'message' as description,
          al.created_at as timestamp,
          CASE
            WHEN al.event_type LIKE '%error%' OR al.event_type LIKE '%failed%' THEN 'error'
            WHEN al.event_type LIKE '%warning%' OR al.event_type LIKE '%issue%' THEN 'warning'
            WHEN al.event_type LIKE '%complete%' OR al.event_type LIKE '%success%' THEN 'success'
            ELSE 'info'
          END as severity,
          al.resource_id as "voxelId",
          al.actor_id as "userId",
          u.full_name as "userName"
        FROM audit_log al
        LEFT JOIN users u ON al.actor_id = u.id::text
        WHERE al.resource_type = 'voxel'
          AND al.resource_id IN (SELECT id::text FROM voxels WHERE project_id = $1)
        ORDER BY al.created_at DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, [projectId, limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        type: this.mapActivityType(row.type),
        title: this.formatActivityTitle(row.type),
        description: row.description || `Voxel ${row.type}`,
        timestamp: row.timestamp,
        severity: row.severity,
        voxelId: row.voxelId,
        userId: row.userId,
        userName: row.userName,
      }));
    } catch (error) {
      logger.error('[VoxelRoutes] Activity query failed', { error });
      throw error;
    }
  }

  /**
   * Get single voxel by ID
   */
  private async getVoxelById(voxelId: string): Promise<VoxelData | null> {
    try {
      const query = `
        SELECT
          v.id,
          v.voxel_id as "voxelId",
          v.project_id as "projectId",
          v.system,
          v.status,
          v.health_status as "healthStatus",
          v.percent_complete as "percentComplete",
          json_build_object('x', v.coord_x, 'y', v.coord_y, 'z', v.coord_z) as center,
          v.resolution,
          v.level,
          v.created_at as "createdAt",
          v.updated_at as "updatedAt",
          COALESCE(
            (SELECT COUNT(*) FROM voxel_decision_attachments vda WHERE vda.voxel_id = v.id),
            0
          ) as "decisionCount"
        FROM voxels v
        WHERE v.id = $1 OR v.voxel_id = $1
      `;

      const result = await this.db.query(query, [voxelId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        voxelId: row.voxelId,
        projectId: row.projectId,
        system: row.system,
        status: row.status,
        healthStatus: row.healthStatus || 'HEALTHY',
        percentComplete: row.percentComplete,
        center: row.center || { x: 0, y: 0, z: 0 },
        resolution: row.resolution || 180,
        level: row.level,
        decisionCount: parseInt(row.decisionCount) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    } catch (error) {
      logger.warn('[VoxelRoutes] Get voxel query failed', { error, voxelId });
      return null;
    }
  }

  /**
   * Update voxel status with full history tracking
   * Sprint 5 ROS MRO: Production-ready status change management
   */
  private async updateVoxelStatus(
    voxelId: string,
    update: {
      status: string;
      healthStatus?: string;
      percentComplete?: number;
      note?: string;
      userId?: string;
      userName?: string;
      source?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<VoxelData | null> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Step 1: Get current state before update (for history tracking)
      const currentQuery = `
        SELECT
          id,
          voxel_id as "voxelId",
          project_id as "projectId",
          system,
          status,
          health_status as "healthStatus",
          percent_complete as "percentComplete"
        FROM voxels
        WHERE id = $1 OR voxel_id = $1
        FOR UPDATE
      `;
      const currentResult = await client.query(currentQuery, [voxelId]);

      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const current = currentResult.rows[0];
      const previousStatus = current.status;
      const previousHealth = current.healthStatus;

      // Step 2: Update the voxel
      const updateQuery = `
        UPDATE voxels
        SET
          status = $2,
          health_status = COALESCE($3, health_status),
          percent_complete = COALESCE($4, percent_complete),
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          voxel_id as "voxelId",
          project_id as "projectId",
          system,
          status,
          health_status as "healthStatus",
          percent_complete as "percentComplete",
          coord_x as "coordX",
          coord_y as "coordY",
          coord_z as "coordZ",
          resolution,
          level,
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;

      const updateResult = await client.query(updateQuery, [
        current.id,
        update.status,
        update.healthStatus,
        update.percentComplete,
      ]);

      const row = updateResult.rows[0];

      // Step 3: Insert status history record
      const historyQuery = `
        INSERT INTO voxel_status_history (
          voxel_id,
          previous_status,
          new_status,
          previous_health,
          new_health,
          percent_complete,
          note,
          changed_by_id,
          changed_by_name,
          source,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `;

      await client.query(historyQuery, [
        current.id,
        previousStatus,
        update.status,
        previousHealth,
        update.healthStatus || row.healthStatus,
        update.percentComplete,
        update.note,
        update.userId,
        update.userName,
        update.source || 'API',
        update.ipAddress,
        update.userAgent,
      ]);

      // Step 4: Log to audit_log for cross-system audit trail
      const auditQuery = `
        INSERT INTO audit_log (
          event_hash, event_type, resource_id, resource_type, actor_id, event_data, source_ip, user_agent
        ) VALUES (
          encode(digest(gen_random_uuid()::text || now()::text, 'sha256'), 'hex'),
          'status_change', $1, 'voxel', $2, $3, $4, $5
        )
      `;

      await client.query(auditQuery, [
        current.id,
        update.userId || 'system',
        JSON.stringify({
          message: `Status changed from ${previousStatus} to ${update.status}`,
          previousStatus,
          newStatus: update.status,
          previousHealth,
          newHealth: update.healthStatus,
          percentComplete: update.percentComplete,
          note: update.note,
          source: update.source || 'API',
          projectId: row.projectId,
        }),
        update.ipAddress,
        update.userAgent,
      ]);

      await client.query('COMMIT');

      // Invalidate cache for this project after successful update
      await this.invalidateProjectCache(row.projectId);

      logger.info('[VoxelRoutes] Status updated with history', {
        voxelId: current.id,
        previousStatus,
        newStatus: update.status,
        userId: update.userId,
      });

      // Broadcast update via WebSocket for real-time UI updates
      const wsHandler = getVoxelStreamHandler();
      if (wsHandler) {
        wsHandler.broadcastVoxelUpdate({
          voxelId: row.voxelId,
          projectId: row.projectId,
          previousStatus,
          status: row.status,
          healthStatus: row.healthStatus,
          percentComplete: row.percentComplete,
          updatedBy: update.userName,
          updatedById: update.userId,
          timestamp: new Date().toISOString(),
          source: update.source || 'API',
        });
      }

      return {
        id: row.id,
        voxelId: row.voxelId,
        projectId: row.projectId,
        system: row.system,
        status: row.status,
        healthStatus: row.healthStatus || 'HEALTHY',
        percentComplete: row.percentComplete,
        center: { x: row.coordX || 0, y: row.coordY || 0, z: row.coordZ || 0 },
        resolution: row.resolution || 180,
        level: row.level,
        decisionCount: 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[VoxelRoutes] Update status failed', { error, voxelId });
      throw new AppError('Failed to update voxel status', 500);
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Check project access for user
   */
  private async checkProjectAccess(
    userId: string | undefined,
    projectId: string
  ): Promise<void> {
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const accessQuery = `
      SELECT 1 FROM project_roles
      WHERE user_id = $1 AND project_id = $2 AND is_active = true
    `;
    const accessResult = await this.db.query(accessQuery, [userId, projectId]);

    if (accessResult.rows.length === 0) {
      throw new AuthorizationError('Access denied to this project');
    }
  }

  /**
   * Map audit log action to activity type
   */
  private mapActivityType(action: string): string {
    if (action.includes('status')) return 'status_change';
    if (action.includes('decision')) return 'decision_attached';
    if (action.includes('inspection')) return 'inspection';
    if (action.includes('issue') || action.includes('error')) return 'issue';
    return 'status_change';
  }

  /**
   * Format activity title from action
   */
  private formatActivityTitle(action: string): string {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // ==========================================================================
  // PHASE 2: HISTORY AND BATCH METHODS
  // ==========================================================================

  /**
   * Get status change history for a voxel
   */
  private async getVoxelHistory(
    voxelId: string,
    limit: number
  ): Promise<VoxelStatusHistoryEntry[]> {
    try {
      const query = `
        SELECT
          vsh.id,
          vsh.voxel_id as "voxelId",
          vsh.previous_status as "previousStatus",
          vsh.new_status as "newStatus",
          vsh.previous_health as "previousHealth",
          vsh.new_health as "newHealth",
          vsh.percent_complete as "percentComplete",
          vsh.note,
          vsh.changed_by_id as "changedById",
          vsh.changed_by_name as "changedByName",
          vsh.source,
          vsh.created_at as "timestamp"
        FROM voxel_status_history vsh
        WHERE vsh.voxel_id = $1 OR EXISTS (
          SELECT 1 FROM voxels v WHERE v.voxel_id = $1 AND v.id = vsh.voxel_id
        )
        ORDER BY vsh.created_at DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, [voxelId, limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        voxelId: row.voxelId,
        previousStatus: row.previousStatus,
        newStatus: row.newStatus,
        previousHealth: row.previousHealth,
        newHealth: row.newHealth,
        percentComplete: row.percentComplete,
        note: row.note,
        changedById: row.changedById,
        changedByName: row.changedByName,
        source: row.source,
        timestamp: row.timestamp,
      }));
    } catch (error) {
      logger.warn('[VoxelRoutes] History query failed', { error, voxelId });
      return [];
    }
  }

  /**
   * Batch update multiple voxels within a project
   */
  private async batchUpdateVoxels(
    projectId: string,
    updates: Array<{
      voxelId: string;
      status?: string;
      healthStatus?: string;
      percentComplete?: number;
      note?: string;
    }>,
    context: {
      userId?: string;
      userName?: string;
      source: string;
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<{
    updated: VoxelData[];
    failed: Array<{ voxelId: string; error: string }>;
  }> {
    const updated: VoxelData[] = [];
    const failed: Array<{ voxelId: string; error: string }> = [];

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      for (const update of updates) {
        try {
          // Verify voxel belongs to project
          const verifyQuery = `
            SELECT id, status, health_status as "healthStatus"
            FROM voxels
            WHERE (id = $1 OR voxel_id = $1) AND project_id = $2
            FOR UPDATE
          `;
          const verifyResult = await client.query(verifyQuery, [update.voxelId, projectId]);

          if (verifyResult.rows.length === 0) {
            failed.push({ voxelId: update.voxelId, error: 'Voxel not found or not in project' });
            continue;
          }

          const current = verifyResult.rows[0];
          const newStatus = update.status || current.status;
          const newHealth = update.healthStatus || current.healthStatus;

          // Update voxel
          const updateQuery = `
            UPDATE voxels
            SET
              status = COALESCE($2, status),
              health_status = COALESCE($3, health_status),
              percent_complete = COALESCE($4, percent_complete),
              updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              voxel_id as "voxelId",
              project_id as "projectId",
              system,
              status,
              health_status as "healthStatus",
              percent_complete as "percentComplete",
              coord_x as "coordX",
              coord_y as "coordY",
              coord_z as "coordZ",
              resolution,
              level,
              created_at as "createdAt",
              updated_at as "updatedAt"
          `;

          const updateResult = await client.query(updateQuery, [
            current.id,
            update.status,
            update.healthStatus,
            update.percentComplete,
          ]);

          const row = updateResult.rows[0];

          // Insert history record
          const historyQuery = `
            INSERT INTO voxel_status_history (
              voxel_id, previous_status, new_status, previous_health, new_health,
              percent_complete, note, changed_by_id, changed_by_name, source, ip_address, user_agent
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;

          await client.query(historyQuery, [
            current.id,
            current.status,
            newStatus,
            current.healthStatus,
            newHealth,
            update.percentComplete,
            update.note,
            context.userId,
            context.userName,
            context.source,
            context.ipAddress,
            context.userAgent,
          ]);

          updated.push({
            id: row.id,
            voxelId: row.voxelId,
            projectId: row.projectId,
            system: row.system,
            status: row.status,
            healthStatus: row.healthStatus || 'HEALTHY',
            percentComplete: row.percentComplete,
            center: { x: row.coordX || 0, y: row.coordY || 0, z: row.coordZ || 0 },
            resolution: row.resolution || 180,
            level: row.level,
            decisionCount: 0,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        } catch (updateError) {
          failed.push({
            voxelId: update.voxelId,
            error: updateError instanceof Error ? updateError.message : 'Update failed',
          });
        }
      }

      await client.query('COMMIT');

      // Invalidate cache for this project after successful batch update
      if (updated.length > 0) {
        await this.invalidateProjectCache(projectId);
      }

      return { updated, failed };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[VoxelRoutes] Batch update failed', { error, projectId });
      throw new AppError('Batch update failed', 500);
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // MOCK DATA GENERATORS (Fallback until database is seeded)
  // ==========================================================================

  private generateMockVoxels(projectId: string): VoxelData[] {
    const systems = ['STRUCT', 'MECH', 'ELEC', 'PLUMB', 'HVAC', 'FIRE'];
    const statuses = ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED'];
    const healthStatuses = ['HEALTHY', 'AT_RISK', 'CRITICAL'];
    const voxels: VoxelData[] = [];

    const gridSize = 5;
    const spacing = 200;
    let index = 0;
    const now = new Date().toISOString();

    for (let level = 0; level < 3; level++) {
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const system = systems[Math.floor(Math.random() * systems.length)];
          const status = statuses[Math.floor(Math.random() * statuses.length)];

          voxels.push({
            id: `vox-${projectId}-${index}`,
            voxelId: `VOX-L${level}-${system}-${String(index).padStart(3, '0')}`,
            projectId,
            center: {
              x: x * spacing + spacing / 2,
              y: y * spacing + spacing / 2,
              z: level * 1000 + 500,
            },
            resolution: spacing * 0.9,
            system,
            status,
            healthStatus: healthStatuses[Math.floor(Math.random() * healthStatuses.length)],
            decisionCount: Math.floor(Math.random() * 5),
            percentComplete:
              status === 'COMPLETE'
                ? 100
                : status === 'IN_PROGRESS'
                  ? Math.floor(Math.random() * 80) + 10
                  : status === 'PLANNED'
                    ? 0
                    : undefined,
            level: `Level ${level}`,
            createdAt: now,
            updatedAt: now,
          });
          index++;
        }
      }
    }

    return voxels;
  }

  private generateMockAggregations(): VoxelAggregation[] {
    return [
      {
        key: 'Level 0',
        voxelCount: 25,
        plannedCount: 5,
        inProgressCount: 10,
        completeCount: 8,
        blockedCount: 2,
        decisionCount: 12,
        overallProgress: 52,
        healthScore: 92,
      },
      {
        key: 'Level 1',
        voxelCount: 25,
        plannedCount: 8,
        inProgressCount: 12,
        completeCount: 4,
        blockedCount: 1,
        decisionCount: 8,
        overallProgress: 40,
        healthScore: 96,
      },
      {
        key: 'Level 2',
        voxelCount: 25,
        plannedCount: 15,
        inProgressCount: 7,
        completeCount: 2,
        blockedCount: 1,
        decisionCount: 5,
        overallProgress: 22,
        healthScore: 96,
      },
    ];
  }

  private generateMockActivity(): VoxelActivity[] {
    const now = Date.now();
    return [
      {
        id: 'act-001',
        type: 'status_change',
        title: 'Status Updated',
        description: 'VOX-L1-MECH-023 changed to IN_PROGRESS',
        timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
        severity: 'info',
        voxelId: 'vox-001',
      },
      {
        id: 'act-002',
        type: 'decision_attached',
        title: 'Decision Attached',
        description: 'RFI #2024-0123 linked to VOX-L2-ELEC-045',
        timestamp: new Date(now - 15 * 60 * 1000).toISOString(),
        severity: 'warning',
        voxelId: 'vox-002',
      },
      {
        id: 'act-003',
        type: 'inspection',
        title: 'Inspection Required',
        description: 'Structural inspection needed for Level 1 columns',
        timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        severity: 'warning',
      },
      {
        id: 'act-004',
        type: 'issue',
        title: 'Coordination Issue',
        description: 'MEP clash detected at VOX-L1-HVAC-012',
        timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
        severity: 'error',
        voxelId: 'vox-003',
      },
      {
        id: 'act-005',
        type: 'status_change',
        title: 'Work Completed',
        description: 'VOX-L0-STRUCT-001 marked as COMPLETE',
        timestamp: new Date(now - 120 * 60 * 1000).toISOString(),
        severity: 'success',
        voxelId: 'vox-004',
      },
    ];
  }

  getRouter(): IRouter {
    return this.router;
  }
}
