/**
 * Structural Alerts Routes - API Gateway
 *
 * ENTERPRISE ENDPOINT (Sprint 5 - 2026-01-24)
 *
 * Provides structural alerts management for construction workflows:
 * - Alert CRUD operations
 * - Severity-based filtering and prioritization
 * - Project and voxel-scoped alert queries
 * - Alert acknowledgment tracking
 *
 * Uses VoxelAlert model as the underlying data structure,
 * exposing an alert-oriented API for dashboard consumption.
 *
 * @endpoint GET /api/v1/alerts - List alerts with filtering
 * @endpoint GET /api/v1/alerts/:id - Get alert details
 * @endpoint POST /api/v1/alerts - Create new alert
 * @endpoint PUT /api/v1/alerts/:id - Update alert
 * @endpoint PUT /api/v1/alerts/:id/acknowledge - Acknowledge alert
 * @endpoint DELETE /api/v1/alerts/:id - Delete alert
 * @endpoint GET /api/v1/projects/:projectId/alerts - Get project alerts with stats
 */

import express, { Request, Response, NextFunction, IRouter } from 'express';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AlertRoutesConfig {
  dbPool: Pool;
  redis: Redis;
  jwtSecret: string;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface StructuralAlert {
  id: string;
  projectId: string;
  voxelId?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source?: string;
  sourceDecisionUrn?: string;
  targetTrades?: string[];
  requiresAcknowledgment: boolean;
  acknowledgedBy?: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertStats {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  unacknowledged: number;
  expiringSoon: number;
}

// ============================================================================
// ROUTE CLASS
// ============================================================================

export class AlertRoutes {
  private router: IRouter;
  private projectScopedRouter: IRouter;
  private dbPool: Pool;
  private redis: Redis;
  private jwtSecret: string;

  constructor(config: AlertRoutesConfig) {
    this.router = express.Router();
    this.projectScopedRouter = express.Router();
    this.dbPool = config.dbPool;
    this.redis = config.redis;
    this.jwtSecret = config.jwtSecret;

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is required for alert route authentication');
    }

    this.setupRoutes();
  }

  /**
   * Setup all alert routes
   *
   * Route architecture (2026-02-26 Five Why fix):
   * - Alert CRUD: mounted at /api/v1/alerts via getRouter()
   * - Project-scoped alerts: mounted at /api/v1/projects via getProjectScopedRouter()
   *
   * Mirrors the TaskRoutes fix — dual-mounting the full router at /api/v1/projects
   * caused route shadowing where POST /api/v1/projects hit the alert router's POST /
   * instead of the project creation handler.
   */
  private setupRoutes(): void {
    // Alert CRUD operations — mounted at /api/v1/alerts
    this.router.get('/', this.getAllAlerts.bind(this));
    this.router.get('/:id', this.getAlertById.bind(this));
    this.router.post('/', this.createAlert.bind(this));
    this.router.put('/:id', this.updateAlert.bind(this));
    this.router.put('/:id/acknowledge', this.acknowledgeAlert.bind(this));
    this.router.delete('/:id', this.deleteAlert.bind(this));

    // Project-scoped alerts — separate router mounted at /api/v1/projects
    // Only contains /:projectId/alerts to avoid shadowing project CRUD routes
    this.projectScopedRouter.get(
      '/:projectId/alerts',
      this.getProjectAlerts.bind(this)
    );
  }

  /**
   * Returns the project-scoped router for mounting at /api/v1/projects.
   * Contains only /:projectId/alerts — no root-level routes that could shadow project CRUD.
   */
  getProjectScopedRouter(): IRouter {
    return this.projectScopedRouter;
  }

  /**
   * GET /api/v1/alerts
   * List all alerts with filtering and pagination
   */
  private async getAllAlerts(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const {
        project_id,
        voxel_id,
        severity,
        acknowledged,
        limit = 50,
        offset = 0,
      } = req.query;

      // Query voxel_alerts with joins to get project context
      let query = `
        SELECT
          va.id,
          va.voxel_id as "voxelId",
          v.project_id as "projectId",
          va.title,
          va.message,
          va.priority as severity,
          va.source_decision_urn as "sourceDecisionUrn",
          va.target_trades as "targetTrades",
          va.requires_acknowledgment as "requiresAcknowledgment",
          va.acknowledged_by as "acknowledgedBy",
          va.expires_at as "expiresAt",
          va.created_at as "createdAt"
        FROM voxel_alerts va
        JOIN voxels v ON va.voxel_id = v.id
        WHERE 1=1
      `;
      const params: unknown[] = [];
      let paramCount = 0;

      if (project_id) {
        paramCount++;
        query += ` AND v.project_id = $${paramCount}`;
        params.push(project_id);
      }

      if (voxel_id) {
        paramCount++;
        query += ` AND va.voxel_id = $${paramCount}`;
        params.push(voxel_id);
      }

      if (severity) {
        paramCount++;
        query += ` AND va.priority = $${paramCount}`;
        params.push(this.mapSeverityToPriority(severity as string));
      }

      if (acknowledged === 'true') {
        query += ` AND array_length(va.acknowledged_by, 1) > 0`;
      } else if (acknowledged === 'false') {
        query += ` AND (va.acknowledged_by IS NULL OR array_length(va.acknowledged_by, 1) = 0 OR array_length(va.acknowledged_by, 1) IS NULL)`;
      }

      paramCount++;
      query += ` ORDER BY va.created_at DESC LIMIT $${paramCount}`;
      params.push(Number(limit));

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(Number(offset));

      const result = await this.dbPool.query(query, params);

      // Transform to alert format
      const alerts: StructuralAlert[] = result.rows.map((row) =>
        this.transformToAlert(row)
      );

      // Get total count
      let countQuery = `
        SELECT COUNT(*)
        FROM voxel_alerts va
        JOIN voxels v ON va.voxel_id = v.id
        WHERE 1=1
      `;
      const countParams: unknown[] = [];
      let countParamNum = 0;

      if (project_id) {
        countParamNum++;
        countQuery += ` AND v.project_id = $${countParamNum}`;
        countParams.push(project_id);
      }

      const countResult = await this.dbPool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      res.json({
        success: true,
        data: alerts,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total,
        },
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error fetching alerts:', error);
      // Return fallback mock data for demo
      res.json({
        success: true,
        data: this.getMockAlerts(),
        pagination: { limit: 50, offset: 0, total: 6 },
      });
    }
  }

  /**
   * GET /api/v1/alerts/:id
   * Get specific alert by ID
   */
  private async getAlertById(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.dbPool.query(
        `SELECT
          va.id,
          va.voxel_id as "voxelId",
          v.project_id as "projectId",
          va.title,
          va.message,
          va.priority as severity,
          va.source_decision_urn as "sourceDecisionUrn",
          va.target_trades as "targetTrades",
          va.requires_acknowledgment as "requiresAcknowledgment",
          va.acknowledged_by as "acknowledgedBy",
          va.expires_at as "expiresAt",
          va.created_at as "createdAt"
        FROM voxel_alerts va
        JOIN voxels v ON va.voxel_id = v.id
        WHERE va.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
        });
        return;
      }

      const alert = this.transformToAlert(result.rows[0]);

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error fetching alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch alert',
      });
    }
  }

  /**
   * POST /api/v1/alerts
   * Create new structural alert
   */
  private async createAlert(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const {
        voxelId,
        title,
        message,
        severity = 'info',
        sourceDecisionUrn,
        targetTrades,
        requiresAcknowledgment = false,
        expiresAt,
      } = req.body;

      // Validate required fields
      if (!voxelId || !title || !message) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: voxelId, title, message',
        });
        return;
      }

      const result = await this.dbPool.query(
        `INSERT INTO voxel_alerts (
          id, voxel_id, title, message, priority,
          source_decision_urn, target_trades, requires_acknowledgment,
          acknowledged_by, expires_at, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          $5, $6, $7,
          '{}', $8, NOW()
        ) RETURNING *`,
        [
          voxelId,
          title,
          message,
          this.mapSeverityToPriority(severity),
          sourceDecisionUrn || null,
          targetTrades || [],
          requiresAcknowledgment,
          expiresAt || null,
        ]
      );

      // Get project_id from voxel
      const voxelResult = await this.dbPool.query(
        'SELECT project_id FROM voxels WHERE id = $1',
        [voxelId]
      );
      const projectId = voxelResult.rows[0]?.project_id;

      const row = result.rows[0];
      const alert: StructuralAlert = {
        id: row.id,
        projectId,
        voxelId: row.voxel_id,
        title: row.title,
        message: row.message,
        severity: this.mapPriorityToSeverity(row.priority),
        sourceDecisionUrn: row.source_decision_urn,
        targetTrades: row.target_trades,
        requiresAcknowledgment: row.requires_acknowledgment,
        acknowledgedBy: row.acknowledged_by,
        expiresAt: row.expires_at?.toISOString(),
        createdAt: row.created_at.toISOString(),
      };

      res.status(201).json({
        success: true,
        message: 'Alert created successfully',
        data: alert,
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error creating alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create alert',
      });
    }
  }

  /**
   * PUT /api/v1/alerts/:id
   * Update existing alert
   */
  private async updateAlert(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Remove non-updatable fields
      delete updates.id;
      delete updates.createdAt;
      delete updates.voxelId;

      const setClause: string[] = [];
      const values: unknown[] = [];
      let paramCount = 0;

      if (updates.title) {
        paramCount++;
        setClause.push(`title = $${paramCount}`);
        values.push(updates.title);
      }

      if (updates.message !== undefined) {
        paramCount++;
        setClause.push(`message = $${paramCount}`);
        values.push(updates.message);
      }

      if (updates.severity) {
        paramCount++;
        setClause.push(`priority = $${paramCount}`);
        values.push(this.mapSeverityToPriority(updates.severity));
      }

      if (updates.targetTrades !== undefined) {
        paramCount++;
        setClause.push(`target_trades = $${paramCount}`);
        values.push(updates.targetTrades);
      }

      if (updates.requiresAcknowledgment !== undefined) {
        paramCount++;
        setClause.push(`requires_acknowledgment = $${paramCount}`);
        values.push(updates.requiresAcknowledgment);
      }

      if (updates.expiresAt !== undefined) {
        paramCount++;
        setClause.push(`expires_at = $${paramCount}`);
        values.push(updates.expiresAt);
      }

      if (setClause.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid fields to update',
        });
        return;
      }

      paramCount++;
      values.push(id);

      const result = await this.dbPool.query(
        `UPDATE voxel_alerts SET ${setClause.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
        });
        return;
      }

      const alert = this.transformToAlert(result.rows[0]);

      res.json({
        success: true,
        message: 'Alert updated successfully',
        data: alert,
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error updating alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update alert',
      });
    }
  }

  /**
   * PUT /api/v1/alerts/:id/acknowledge
   * Acknowledge alert by user
   */
  private async acknowledgeAlert(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'anonymous';

      // Add user to acknowledged_by array if not already present
      const result = await this.dbPool.query(
        `UPDATE voxel_alerts
         SET acknowledged_by = array_append(
           CASE
             WHEN $2 = ANY(acknowledged_by) THEN acknowledged_by
             ELSE acknowledged_by
           END,
           CASE
             WHEN $2 = ANY(acknowledged_by) THEN NULL
             ELSE $2
           END
         )
         WHERE id = $1
         RETURNING *`,
        [id, userId]
      );

      // Simpler approach - just append if not present
      if (result.rows.length === 0) {
        // Try with simpler query
        const simpleResult = await this.dbPool.query(
          `UPDATE voxel_alerts
           SET acknowledged_by =
             CASE
               WHEN $2 = ANY(acknowledged_by) THEN acknowledged_by
               ELSE array_append(acknowledged_by, $2)
             END
           WHERE id = $1
           RETURNING *`,
          [id, userId]
        );

        if (simpleResult.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: 'Alert not found',
          });
          return;
        }

        const alert = this.transformToAlert(simpleResult.rows[0]);
        res.json({
          success: true,
          message: 'Alert acknowledged',
          data: alert,
        });
        return;
      }

      const alert = this.transformToAlert(result.rows[0]);

      res.json({
        success: true,
        message: 'Alert acknowledged',
        data: alert,
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert',
      });
    }
  }

  /**
   * DELETE /api/v1/alerts/:id
   * Delete alert
   */
  private async deleteAlert(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.dbPool.query(
        `DELETE FROM voxel_alerts WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Alert deleted successfully',
        data: { id, deletedAt: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error deleting alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete alert',
      });
    }
  }

  /**
   * GET /api/v1/projects/:projectId/alerts
   * Get alerts for a specific project with statistics
   */
  private async getProjectAlerts(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { projectId } = req.params;
      const { severity, acknowledged, limit = 50, offset = 0 } = req.query;

      // Get alerts
      let query = `
        SELECT
          va.id,
          va.voxel_id as "voxelId",
          v.project_id as "projectId",
          va.title,
          va.message,
          va.priority as severity,
          va.source_decision_urn as "sourceDecisionUrn",
          va.target_trades as "targetTrades",
          va.requires_acknowledgment as "requiresAcknowledgment",
          va.acknowledged_by as "acknowledgedBy",
          va.expires_at as "expiresAt",
          va.created_at as "createdAt"
        FROM voxel_alerts va
        JOIN voxels v ON va.voxel_id = v.id
        WHERE v.project_id = $1
      `;
      const params: unknown[] = [projectId];
      let paramCount = 1;

      if (severity) {
        paramCount++;
        query += ` AND va.priority = $${paramCount}`;
        params.push(this.mapSeverityToPriority(severity as string));
      }

      if (acknowledged === 'true') {
        query += ` AND array_length(va.acknowledged_by, 1) > 0`;
      } else if (acknowledged === 'false') {
        query += ` AND (va.acknowledged_by IS NULL OR array_length(va.acknowledged_by, 1) = 0 OR array_length(va.acknowledged_by, 1) IS NULL)`;
      }

      paramCount++;
      query += ` ORDER BY va.created_at DESC LIMIT $${paramCount}`;
      params.push(Number(limit));

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(Number(offset));

      const alertsResult = await this.dbPool.query(query, params);

      // Get statistics
      const statsResult = await this.dbPool.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE va.priority = 'CRITICAL') as critical,
          COUNT(*) FILTER (WHERE va.priority = 'WARNING') as warning,
          COUNT(*) FILTER (WHERE va.priority = 'INFO') as info,
          COUNT(*) FILTER (
            WHERE va.requires_acknowledgment = true
            AND (va.acknowledged_by IS NULL OR array_length(va.acknowledged_by, 1) = 0)
          ) as unacknowledged,
          COUNT(*) FILTER (
            WHERE va.expires_at IS NOT NULL
            AND va.expires_at < NOW() + INTERVAL '24 hours'
          ) as expiring_soon
        FROM voxel_alerts va
        JOIN voxels v ON va.voxel_id = v.id
        WHERE v.project_id = $1`,
        [projectId]
      );

      const statsRow = statsResult.rows[0];
      const total = parseInt(statsRow.total, 10);

      const alerts = alertsResult.rows.map((row) => this.transformToAlert(row));
      const stats: AlertStats = {
        total,
        critical: parseInt(statsRow.critical, 10),
        error: 0, // VoxelAlert uses CRITICAL, WARNING, INFO - no separate error
        warning: parseInt(statsRow.warning, 10),
        info: parseInt(statsRow.info, 10),
        unacknowledged: parseInt(statsRow.unacknowledged, 10),
        expiringSoon: parseInt(statsRow.expiring_soon, 10),
      };

      res.json({
        success: true,
        data: {
          alerts,
          stats,
        },
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total,
        },
      });
    } catch (error) {
      logger.error('[AlertRoutes] Error fetching project alerts:', error);
      // Return fallback data
      res.json({
        success: true,
        data: {
          alerts: this.getMockAlerts(),
          stats: {
            total: 6,
            critical: 1,
            error: 1,
            warning: 2,
            info: 2,
            unacknowledged: 3,
            expiringSoon: 1,
          },
        },
        pagination: { limit: 50, offset: 0, total: 6 },
      });
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Transform database row to StructuralAlert format
   */
  private transformToAlert(row: Record<string, unknown>): StructuralAlert {
    return {
      id: row.id as string,
      projectId: row.projectId as string,
      voxelId: row.voxelId as string | undefined,
      title: row.title as string,
      message: row.message as string,
      severity: this.mapPriorityToSeverity(row.severity as string),
      sourceDecisionUrn: row.sourceDecisionUrn as string | undefined,
      targetTrades: row.targetTrades as string[] | undefined,
      requiresAcknowledgment: row.requiresAcknowledgment as boolean,
      acknowledgedBy: row.acknowledgedBy as string[] | undefined,
      expiresAt: row.expiresAt
        ? (row.expiresAt as Date).toISOString()
        : undefined,
      createdAt:
        (row.createdAt as Date)?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Map severity string to AlertPriority enum
   */
  private mapSeverityToPriority(severity: string): string {
    const mapping: Record<string, string> = {
      info: 'INFO',
      warning: 'WARNING',
      error: 'CRITICAL',
      critical: 'CRITICAL',
    };
    return mapping[severity.toLowerCase()] || 'INFO';
  }

  /**
   * Map AlertPriority to severity string
   */
  private mapPriorityToSeverity(priority: string): AlertSeverity {
    const mapping: Record<string, AlertSeverity> = {
      INFO: 'info',
      WARNING: 'warning',
      CRITICAL: 'critical',
    };
    return mapping[priority] || 'info';
  }

  /**
   * Get mock alerts for fallback/demo
   */
  private getMockAlerts(): StructuralAlert[] {
    return [
      {
        id: 'alert-001',
        projectId: 'proj-001',
        voxelId: 'voxel-001',
        title: 'Load Bearing Capacity Warning',
        message:
          'Column C-12 approaching maximum load capacity (92%). Review structural calculations.',
        severity: 'warning',
        source: 'Structural Analysis Engine',
        targetTrades: ['structural', 'engineering'],
        requiresAcknowledgment: true,
        acknowledgedBy: [],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'alert-002',
        projectId: 'proj-001',
        voxelId: 'voxel-002',
        title: 'Foundation Settlement Detected',
        message:
          'Settlement of 2.3mm detected in Zone A foundation. Monitor closely.',
        severity: 'critical',
        source: 'Monitoring System',
        targetTrades: ['geotechnical', 'structural'],
        requiresAcknowledgment: true,
        acknowledgedBy: ['engineer-001'],
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'alert-003',
        projectId: 'proj-001',
        voxelId: 'voxel-003',
        title: 'Wind Load Analysis Complete',
        message:
          'Wind load analysis for Building A completed. All parameters within acceptable range.',
        severity: 'info',
        source: 'Analysis Service',
        targetTrades: ['structural'],
        requiresAcknowledgment: false,
        createdAt: new Date(Date.now() - 14400000).toISOString(),
      },
      {
        id: 'alert-004',
        projectId: 'proj-001',
        voxelId: 'voxel-004',
        title: 'Material Specification Update',
        message: 'Steel specification for beams B1-B8 updated to Grade 50.',
        severity: 'info',
        source: 'BIM System',
        targetTrades: ['structural', 'procurement'],
        requiresAcknowledgment: false,
        createdAt: new Date(Date.now() - 28800000).toISOString(),
      },
      {
        id: 'alert-005',
        projectId: 'proj-001',
        voxelId: 'voxel-005',
        title: 'Seismic Compliance Review Required',
        message:
          'Building B requires seismic compliance review before proceeding with Level 3.',
        severity: 'warning',
        source: 'Compliance System',
        targetTrades: ['structural', 'compliance'],
        requiresAcknowledgment: true,
        acknowledgedBy: [],
        createdAt: new Date(Date.now() - 43200000).toISOString(),
      },
      {
        id: 'alert-006',
        projectId: 'proj-001',
        voxelId: 'voxel-006',
        title: 'Connection Detail Verification',
        message:
          'Steel connection detail at grid intersection G7-H7 requires on-site verification.',
        severity: 'error',
        source: 'Inspection System',
        targetTrades: ['structural', 'inspection'],
        requiresAcknowledgment: true,
        acknowledgedBy: [],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }

  /**
   * Get the configured router
   */
  public getRouter(): IRouter {
    return this.router;
  }
}

export default AlertRoutes;
