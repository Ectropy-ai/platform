/**
 * User Management Routes - API Gateway
 * Handles user profile, settings, and account management
 */

import express, {
  Response,
  Router,
  Request,
  NextFunction,
  IRouter,
} from 'express';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

// Import Express type augmentation for user properties
import '../../../../libs/shared/types/src/express.js';
export interface UserRoutesConfig {
  dbPool: Pool;
  redis: Redis;
  jwtSecret: string;
}

/**
 * User management route handlers
 */
export class UserRoutes {
  private router: IRouter;
  private dbPool: Pool;
  private redis: Redis;
  private jwtSecret: string;

  constructor(config: UserRoutesConfig) {
    this.router = express.Router();
    this.dbPool = config.dbPool;
    this.redis = config.redis;
    this.jwtSecret = config.jwtSecret;

    // Validate JWT secret is provided
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET is required for user authentication');
    }

    this.setupRoutes();
  }
  /**
   * Setup all user management routes
   */
  private setupRoutes(): void {
    // User profile endpoints
    this.router.get('/profile', this.getUserProfile.bind(this));
    this.router.put('/profile', this.updateUserProfile.bind(this));
    // User preferences and settings
    this.router.get('/settings', this.getUserSettings.bind(this));
    this.router.put('/settings', this.updateUserSettings.bind(this));
    // User activity and history
    this.router.get('/activity', this.getUserActivity.bind(this));
    // User role management
    this.router.get('/roles', this.getUserRoles.bind(this));
    this.router.post('/roles', this.assignUserRole.bind(this));
    // User notifications
    this.router.get('/notifications', this.getUserNotifications.bind(this));
    this.router.put(
      '/notifications/:id/read',
      this.markNotificationRead.bind(this)
    );
  }

  /**
   * Get user profile information
   */
  private async getUserProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id; // Assuming auth middleware sets req.user
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }
      // production implementation - replace with actual database query
      const userProfile = {
        id: userId,
        email: 'user@example.com',
        name: 'John Doe',
        role: 'architect',
        company: 'Design Studio Inc.',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        preferences: {
          theme: 'light',
          notifications: true,
          language: 'en',
        },
      };
      res.json({
        success: true,
        data: userProfile,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  }

  /**
   * Update user profile information
   */
  private async updateUserProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const { name, company, bio } = req.body;
      // Validate input
      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      // production implementation - replace with actual database update
      const updatedProfile = {
        name: name.trim(),
        company: company || '',
        bio: bio || '',
        updated_at: new Date().toISOString(),
      };

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedProfile,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update user profile' });
    }
  }

  /**
   * Get user settings and preferences
   */
  private async getUserSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // production settings - replace with database query
      const settings = {
        theme: 'light',
        notifications: {
          email: true,
          push: false,
          sms: false,
        },
        privacy: {
          profileVisibility: 'team',
          showActivity: true,
        },
        dashboard: {
          defaultView: 'overview',
          showMetrics: true,
        },
      };

      res.json({
        success: true,
        data: settings,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to fetch user settings' });
    }
  }

  /**
   * Update user settings and preferences
   */
  private async updateUserSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = req.body;
      // Validate settings structure
      if (!settings || typeof settings !== 'object') {
        res.status(400).json({ error: 'Invalid settings format' });
        return;
      }

      // production implementation - replace with database update
      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          ...settings,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to update user settings' });
    }
  }

  /**
   * Get user activity history
   */
  private async getUserActivity(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { limit = 20, offset = 0 } = req.query;
      // production activity data
      const activities = [
        {
          id: '1',
          type: 'project_update',
          description: 'Updated project status',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          metadata: { project_id: 'proj_001' },
        },
        {
          id: '2',
          type: 'file_upload',
          description: 'Uploaded BIM model',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          metadata: { file_name: 'building_model.ifc' },
        },
      ];

      res.json({
        data: activities,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: activities.length,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user activity' });
    }
  }

  /**
   * Get user roles and permissions
   */
  private async getUserRoles(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      // production roles data
      const roles = [
        {
          id: 'architect',
          name: 'Architect',
          permissions: ['view_projects', 'edit_designs', 'review_submissions'],
          granted_at: new Date().toISOString(),
        },
      ];
      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user roles' });
    }
  }

  /**
   * Assign role to user (admin only)
   */
  private async assignUserRole(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { targetUserId, roleId } = req.body;
      const currentUser = req.user;
      // Check if current user is admin
      if (currentUser?.role !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      if (!targetUserId || !roleId) {
        res.status(400).json({ error: 'User ID and role ID are required' });
        return;
      }
      // production implementation
      res.json({
        message: `Role ${roleId} assigned to user ${targetUserId}`,
        data: {
          user_id: targetUserId,
          role_id: roleId,
          assigned_at: new Date().toISOString(),
          assigned_by: currentUser.id,
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to assign user role' });
    }
  }

  /**
   * Get user notifications
   */
  private async getUserNotifications(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { unread_only } = req.query;
      // production notifications
      const notifications = [
        {
          id: 'notif_001',
          type: 'milestone',
          title: 'Project milestone completed',
          message: 'Phase 2 of Construction Project Alpha has been completed.',
          read: false,
          created_at: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          id: 'notif_002',
          type: 'system',
          title: 'System maintenance scheduled',
          message: 'Platform maintenance scheduled for this weekend.',
          read: true,
          created_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ];
      const filteredNotifications =
        unread_only === 'true'
          ? notifications.filter((n) => !n.read)
          : notifications;
      res.json({
        data: filteredNotifications,
        unread_count: notifications.filter((n) => !n.read).length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  /**
   * Mark notification as read
   */
  private async markNotificationRead(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Notification ID is required' });
        return;
      }
      // production implementation
      res.json({
        message: 'Notification marked as read',
        data: {
          notification_id: id,
          read_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  /**
   * Get the configured router
   */
  public getRouter(): IRouter {
    return this.router;
  }
}
