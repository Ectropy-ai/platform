/**
 * Project Service - Database operations for projects and BIM elements
 * Replaces production data with persistent PostgreSQL storage
 */

import { Pool } from 'pg';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export const BLOCKED_PROJECT_NAMES = [
  'My First Project',
  'E2E Test Project',
  'Test Project',
  'Untitled Project',
] as const;

export interface Project {
  id: string;
  name: string;
  description?: string;
  budget?: number;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  created_at: string;
  updated_at?: string;
  stakeholders?: string[];
  progress?: number;
}

export interface ProjectElement {
  id: string;
  project_id: string;
  element_type: string;
  name: string;
  properties: Record<string, any>;
  geometry: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    dimensions?: Record<string, number>;
  };
  status: 'draft' | 'in-review' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
}

export class ProjectService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get all projects with stakeholder information and element count
   * ENTERPRISE SECURITY FIX: Filter projects by user access (owner OR member)
   * @param userId - Optional user ID to filter projects by access
   */
  async getProjects(userId?: string): Promise<Project[]> {
    try {
      // ENTERPRISE SECURITY: Filter by user access if userId provided
      const query = userId
        ? `
        SELECT
          p.id,
          p.name,
          p.description,
          p.total_budget as budget,
          p.status,
          p.created_at,
          p.updated_at,
          COUNT(ce.id) as element_count,
          -- Calculate progress based on completed elements
          COALESCE(
            ROUND(
              (COUNT(ce.id) FILTER (WHERE ce.status = 'completed') * 100.0)
              / NULLIF(COUNT(ce.id), 0)
            ), 0
          ) as progress
        FROM projects p
        LEFT JOIN construction_elements ce ON p.id = ce.project_id
        WHERE p.owner_id = $1
          OR p.id IN (
            SELECT project_id
            FROM project_roles
            WHERE user_id = $1 AND is_active = true
          )
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `
        : `
        SELECT
          p.id,
          p.name,
          p.description,
          p.total_budget as budget,
          p.status,
          p.created_at,
          p.updated_at,
          COUNT(ce.id) as element_count,
          -- Calculate progress based on completed elements
          COALESCE(
            ROUND(
              (COUNT(ce.id) FILTER (WHERE ce.status = 'completed') * 100.0)
              / NULLIF(COUNT(ce.id), 0)
            ), 0
          ) as progress
        FROM projects p
        LEFT JOIN construction_elements ce ON p.id = ce.project_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `;

      const result = userId
        ? await this.pool.query(query, [userId])
        : await this.pool.query(query);

      return result.rows.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        budget: project.budget ? parseFloat(project.budget) : undefined,
        status: project.status,
        created_at: project.created_at,
        updated_at: project.updated_at,
        progress: parseInt(project.progress) || 0,
        element_count: parseInt(project.element_count),
      }));
    } catch (error) {
      logger.error('Failed to fetch projects', {
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve projects');
    }
  }

  /**
   * Create a new project
   */
  async createProject(projectData: {
    name: string;
    description?: string;
    status?: string;
    stakeholders?: string[];
    owner_id?: string;
    tenant_id?: string;
  }): Promise<Project> {
    try {
      if (!projectData.owner_id) {
        throw new Error('Owner ID is required to create a project');
      }

      if (!projectData.tenant_id) {
        throw new Error(
          'Tenant ID is required to create a project (multi-tenant isolation)'
        );
      }

      if (BLOCKED_PROJECT_NAMES.includes(projectData.name as any)) {
        throw new Error(
          `Project name '${projectData.name}' is reserved and cannot be used. ` +
          `Choose a descriptive project name.`
        );
      }

      const result = await this.pool.query(
        `
        INSERT INTO projects (id, name, description, status, owner_id, tenant_id)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        RETURNING id, name, description, status, owner_id, tenant_id, created_at, updated_at
        `,
        [
          projectData.name,
          projectData.description || '',
          projectData.status || 'planning',
          projectData.owner_id,
          projectData.tenant_id,
        ]
      );

      const newProject = result.rows[0];

      // Add owner to project_roles table
      await this.pool.query(
        `
        INSERT INTO project_roles (id, project_id, user_id, role, permissions, is_active)
        VALUES (gen_random_uuid(), $1, $2, 'owner', ARRAY['admin', 'read', 'write', 'delete', 'manage_members']::text[], true)
        ON CONFLICT (user_id, project_id, role) DO NOTHING
        `,
        [newProject.id, projectData.owner_id]
      );

      logger.info('Project created', {
        projectId: newProject.id,
        name: projectData.name,
        owner_id: projectData.owner_id,
      });

      return {
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        status: newProject.status,
        created_at: newProject.created_at,
        updated_at: newProject.updated_at,
        stakeholders: projectData.stakeholders || [],
      };
    } catch (error) {
      logger.error('Failed to create project', {
        projectData,
        error: (error as Error).message,
      });
      throw new Error(`Failed to create project: ${(error as Error).message}`);
    }
  }

  /**
   * Get project by ID
   */
  async getProjectById(projectId: string): Promise<Project | null> {
    try {
      const result = await this.pool.query(
        `
        SELECT 
          p.id,
          p.name,
          p.description,
          p.total_budget as budget,
          p.status,
          p.created_at,
          p.updated_at,
          COUNT(ce.id) as element_count,
          COALESCE(
            ROUND(
              (COUNT(ce.id) FILTER (WHERE ce.status = 'completed') * 100.0) 
              / NULLIF(COUNT(ce.id), 0)
            ), 0
          ) as progress
        FROM projects p
        LEFT JOIN construction_elements ce ON p.id = ce.project_id
        WHERE p.id = $1
        GROUP BY p.id
      `,
        [projectId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const project = result.rows[0];
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        budget: project.budget ? parseFloat(project.budget) : undefined,
        status: project.status,
        created_at: project.created_at,
        updated_at: project.updated_at,
        progress: parseInt(project.progress) || 0,
      };
    } catch (error) {
      logger.error('Failed to fetch project', {
        projectId,
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve project');
    }
  }

  /**
   * Get project elements with proper typing
   */
  async getProjectElements(projectId: string): Promise<{
    elements: ProjectElement[];
    metadata: {
      count: number;
      projectId: string;
      timestamp: string;
    };
  }> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          id,
          project_id,
          element_type,
          element_name as name,
          properties,
          NULL as geometry,
          status,
          created_at,
          updated_at
        FROM construction_elements
        WHERE project_id = $1
        ORDER BY created_at DESC
      `,
        [projectId]
      );

      const elements = result.rows;

      return {
        elements,
        metadata: {
          count: elements.length,
          projectId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to fetch project elements', {
        projectId,
        error: (error as Error).message,
      });
      throw new Error('Failed to retrieve project elements');
    }
  }

  /**
   * Create new BIM element with IFC compliance validation
   */
  async createBIMElement(
    projectId: string,
    elementData: {
      ifc_guid: string;
      element_type: string;
      name: string;
      properties: Record<string, any>;
      geometry?: Record<string, any>;
    }
  ): Promise<ProjectElement> {
    try {
      // Validate IFC compliance
      if (!elementData.ifc_guid || !elementData.element_type) {
        throw new Error('Invalid IFC element - missing GUID or type');
      }

      // IFC element type validation
      const validIFCTypes = [
        'IFCWALL',
        'IFCBEAM',
        'IFCCOLUMN',
        'IFCSLAB',
        'IFCDOOR',
        'IFCWINDOW',
      ];
      if (!validIFCTypes.includes(elementData.element_type.toUpperCase())) {
        throw new Error(
          `Invalid IFC element type: ${elementData.element_type}`
        );
      }

      // ENTERPRISE FIX: Explicitly generate UUID for id column
      // Raw SQL queries bypass Prisma's @default(uuid())
      const result = await this.pool.query(
        `
        INSERT INTO construction_elements (
          id, project_id, element_type, element_name, ifc_id, properties, status
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [
          projectId,
          elementData.element_type.toUpperCase(),
          elementData.name,
          elementData.ifc_guid,
          JSON.stringify(elementData.properties),
          'planned',
        ]
      );

      const newElement = result.rows[0];

      logger.info('BIM element created', {
        elementId: newElement.id,
        projectId,
        type: newElement.element_type,
        ifc_guid: elementData.ifc_guid,
      });

      return {
        id: newElement.id,
        project_id: newElement.project_id,
        element_type: newElement.element_type,
        name: newElement.element_name,
        properties: newElement.properties,
        geometry:
          elementData.geometry &&
          'position' in elementData.geometry &&
          'rotation' in elementData.geometry &&
          'scale' in elementData.geometry
            ? (elementData.geometry as {
                position: { x: number; y: number; z: number };
                rotation: { x: number; y: number; z: number };
                scale: { x: number; y: number; z: number };
                dimensions?: Record<string, number>;
              })
            : {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
        status: newElement.status,
        created_at: newElement.created_at,
        updated_at: newElement.updated_at,
      };
    } catch (error) {
      logger.error('Failed to create BIM element', {
        projectId,
        elementData,
        error: (error as Error).message,
      });
      throw new Error(
        `Failed to create BIM element: ${(error as Error).message}`
      );
    }
  }

  /**
   * Update project element
   */
  async updateElement(
    elementId: string,
    updates: Partial<
      Pick<ProjectElement, 'name' | 'properties' | 'geometry' | 'status'>
    >
  ): Promise<ProjectElement | null> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.name !== undefined) {
        setParts.push(`element_name = $${paramCount++}`);
        values.push(updates.name);
      }
      if (updates.properties !== undefined) {
        setParts.push(`properties = $${paramCount++}`);
        values.push(JSON.stringify(updates.properties));
      }
      if (updates.status !== undefined) {
        setParts.push(`status = $${paramCount++}`);
        values.push(updates.status);
      }

      if (setParts.length === 0) {
        throw new Error('No valid updates provided');
      }

      setParts.push(`updated_at = NOW()`);
      values.push(elementId);

      const result = await this.pool.query(
        `
        UPDATE construction_elements 
        SET ${setParts.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `,
        values
      );

      const updatedElement = result.rows[0] || null;

      if (updatedElement) {
        logger.info('Project element updated', {
          elementId,
          updates: Object.keys(updates),
        });

        return {
          id: updatedElement.id,
          project_id: updatedElement.project_id,
          element_type: updatedElement.element_type,
          name: updatedElement.element_name,
          properties: updatedElement.properties,
          geometry:
            updates.geometry &&
            'position' in updates.geometry &&
            'rotation' in updates.geometry &&
            'scale' in updates.geometry
              ? (updates.geometry as {
                  position: { x: number; y: number; z: number };
                  rotation: { x: number; y: number; z: number };
                  scale: { x: number; y: number; z: number };
                  dimensions?: Record<string, number>;
                })
              : {
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0 },
                  scale: { x: 1, y: 1, z: 1 },
                },
          status: updatedElement.status,
          created_at: updatedElement.created_at,
          updated_at: updatedElement.updated_at,
        };
      }

      return updatedElement;
    } catch (error) {
      logger.error('Failed to update project element', {
        elementId,
        updates,
        error: (error as Error).message,
      });
      throw new Error('Failed to update project element');
    }
  }
}
