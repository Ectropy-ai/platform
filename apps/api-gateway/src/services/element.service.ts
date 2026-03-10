/**
 * Element Service - BIM Element Management
 * Handles CRUD operations for construction elements with IFC compliance
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

export interface ElementData {
  ifc_guid?: string;
  element_type: string;
  name?: string;
  properties?: Record<string, any>;
  geometry?: Record<string, any>;
  status?: string;
}

export interface ProjectElement {
  id: string;
  project_id: string;
  ifc_guid: string;
  element_type: string;
  name: string;
  properties: Record<string, any>;
  geometry: Record<string, any>;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class ElementService {
  private pool: Pool;
  private redis: Redis;

  constructor(pool: Pool, redis: Redis) {
    this.pool = pool;
    this.redis = redis;
  }

  /**
   * Get all elements for a project with caching
   */
  async getElementsByProject(projectId: string): Promise<ProjectElement[]> {
    // Check cache first
    const cacheKey = `elements:project:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.pool.query(
      `SELECT ce.*, u.full_name as created_by_name
       FROM construction_elements ce
       LEFT JOIN users u ON ce.created_by = u.id
       WHERE ce.project_id = $1
       ORDER BY ce.created_at DESC`,
      [projectId]
    );
    
    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(result.rows));
    return result.rows;
  }

  /**
   * Create new BIM element with IFC validation
   */
  async createElement(projectId: string, data: ElementData): Promise<ProjectElement> {
    // Validate IFC compliance
    const validTypes = ['IFCWALL', 'IFCBEAM', 'IFCCOLUMN', 'IFCSLAB', 'IFCDOOR', 'IFCWINDOW'];
    if (!validTypes.includes(data.element_type.toUpperCase())) {
      throw new Error(`Invalid IFC type: ${data.element_type}`);
    }

    // ENTERPRISE FIX: Explicitly generate UUID for id column
    // Raw SQL queries bypass Prisma's @default(uuid())
    const result = await this.pool.query(
      `INSERT INTO construction_elements
       (id, project_id, ifc_id, element_type, element_name, properties, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        projectId,
        data.ifc_guid || `IFC_${Date.now()}`,
        data.element_type.toUpperCase(),
        data.name || `${data.element_type} Element`,
        JSON.stringify(data.properties || {}),
        data.status || 'planned'
      ]
    );

    // Invalidate cache
    await this.redis.del(`elements:project:${projectId}`);
    
    return result.rows[0];
  }

  /**
   * Update existing element
   */
  async updateElement(elementId: string, data: Partial<ElementData>): Promise<ProjectElement> {
    const setParts: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.properties !== undefined) {
      setParts.push(`properties = $${paramCount++}`);
      values.push(JSON.stringify(data.properties));
    }
    if (data.status !== undefined) {
      setParts.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.name !== undefined) {
      setParts.push(`element_name = $${paramCount++}`);
      values.push(data.name);
    }

    if (setParts.length === 0) {
      throw new Error('No valid fields to update');
    }

    setParts.push(`updated_at = NOW()`);
    values.push(elementId);

    const result = await this.pool.query(
      `UPDATE construction_elements 
       SET ${setParts.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (!result.rows[0]) {
      throw new Error('Element not found');
    }

    // Invalidate cache
    await this.redis.del(`elements:project:${result.rows[0].project_id}`);
    
    return result.rows[0];
  }

  /**
   * Soft delete element
   */
  async deleteElement(elementId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE construction_elements 
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
       RETURNING project_id`,
      [elementId]
    );

    if (result.rows.length === 0) {
      throw new Error('Element not found');
    }

    // Invalidate cache
    if (result.rows[0]) {
      await this.redis.del(`elements:project:${result.rows[0].project_id}`);
    }
  }

  /**
   * Get element history from audit logs
   */
  async getElementHistory(elementId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT audit_id, change_type, changed_by, changed_at, old_values, new_values
       FROM audit_logs
       WHERE entity_type = 'project_element' AND entity_id = $1
       ORDER BY changed_at DESC`,
      [elementId]
    );
    
    return result.rows;
  }
}

export default ElementService;