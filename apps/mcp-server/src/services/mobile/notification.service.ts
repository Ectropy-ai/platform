/**
 * Mobile Notification Service (DL-M5)
 *
 * Handles sending notifications for voxel entry alerts, decision updates,
 * and acknowledgment reminders through push, SMS, and email channels.
 *
 * @module services/mobile/notification.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../../../../libs/shared/utils/src/logger.js';
import {
  DEFAULT_NOTIFICATION_CONFIG,
  buildNotificationUrn,
  type GeofenceEvent,
  type VoxelEntryNotification,
  type VoxelEntryNotificationData,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationStatus,
  type NotificationConfig,
  type MobileDecisionCard,
  type ToleranceOverrideSummary,
} from './types.js';

// ==============================================================================
// Types
// ==============================================================================

interface PrismaClient {
  voxel: {
    findUnique: (args: any) => Promise<any>;
  };
  voxelAlert: {
    findMany: (args: any) => Promise<any[]>;
  };
  preApproval: {
    findMany: (args: any) => Promise<any[]>;
  };
  toleranceOverride: {
    findMany: (args: any) => Promise<any[]>;
  };
  voxelDecisionAttachment: {
    findMany: (args: any) => Promise<any[]>;
  };
  user: {
    findUnique: (args: any) => Promise<any>;
  };
}

interface NotificationServiceConfig {
  prisma?: PrismaClient;
  config?: Partial<NotificationConfig>;
  sendPush?: (notification: PushNotificationPayload) => Promise<boolean>;
  sendSms?: (to: string, message: string) => Promise<boolean>;
  sendEmail?: (to: string, subject: string, body: string) => Promise<boolean>;
}

interface PushNotificationPayload {
  deviceToken?: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'normal' | 'high';
  badge?: number;
  sound?: string;
  channelId?: string;
}

interface NotificationHistoryEntry {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  sentAt: string;
  status: NotificationStatus;
}

// ==============================================================================
// Notification Service Class
// ==============================================================================

export class NotificationService {
  private config: NotificationConfig;
  private prisma?: PrismaClient;
  private sendPushFn?: (notification: PushNotificationPayload) => Promise<boolean>;
  private sendSmsFn?: (to: string, message: string) => Promise<boolean>;
  private sendEmailFn?: (to: string, subject: string, body: string) => Promise<boolean>;
  private notificationHistory: Map<string, NotificationHistoryEntry[]>; // userId -> history
  private rateLimitCounters: Map<string, { count: number; resetAt: number }>;

  constructor(serviceConfig?: NotificationServiceConfig) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...serviceConfig?.config };
    this.prisma = serviceConfig?.prisma;
    this.sendPushFn = serviceConfig?.sendPush;
    this.sendSmsFn = serviceConfig?.sendSms;
    this.sendEmailFn = serviceConfig?.sendEmail;
    this.notificationHistory = new Map();
    this.rateLimitCounters = new Map();
  }

  // ===========================================================================
  // Voxel Entry Notifications
  // ===========================================================================

  /**
   * Send notification for voxel entry event
   */
  async notifyVoxelEntry(event: GeofenceEvent): Promise<VoxelEntryNotification | null> {
    const { voxelId, userId, projectId, tenantId } = event;

    // Check rate limit
    if (!this.checkRateLimit(userId)) {
      logger.warn('Rate limit exceeded for user notifications', { userId });
      return null;
    }

    // Check quiet hours
    if (this.isQuietHours() && event.confidence < 0.9) {
      logger.debug('Skipping notification during quiet hours', { userId, voxelId });
      return null;
    }

    // Get voxel decision surface data
    const surfaceData = await this.getVoxelSurfaceData(voxelId);
    if (!surfaceData) {
      logger.error('Failed to get voxel surface data', { voxelId });
      return null;
    }

    // Determine notification priority
    const priority = this.determinePriority(surfaceData);

    // Skip notification if no relevant data
    if (
      surfaceData.decisionCount === 0 &&
      surfaceData.alertCount === 0 &&
      !surfaceData.hasActivePreApproval
    ) {
      logger.debug('No notification needed - no relevant data', { voxelId });
      return null;
    }

    // Build notification
    const notification = await this.buildVoxelEntryNotification(
      event,
      surfaceData,
      priority
    );

    // Send notification through appropriate channel
    const sent = await this.sendNotification(notification);

    if (sent) {
      notification.status = 'SENT';
      this.recordNotification(notification);
      logger.info('Voxel entry notification sent', {
        notificationId: notification.notificationId,
        userId,
        voxelId,
        channel: notification.channel,
      });
    } else {
      notification.status = 'FAILED';
    }

    return notification;
  }

  /**
   * Get voxel surface data for notification
   */
  private async getVoxelSurfaceData(voxelId: string): Promise<{
    voxelId: string;
    voxelUrn: string;
    voxelName: string;
    decisionCount: number;
    pendingDecisionCount: number;
    alertCount: number;
    hasActivePreApproval: boolean;
    toleranceOverrides: ToleranceOverrideSummary[];
    decisions: MobileDecisionCard[];
  } | null> {
    if (!this.prisma) {
      // Return mock data for testing
      return {
        voxelId,
        voxelUrn: `urn:ectropy:voxel:${voxelId}`,
        voxelName: 'Test Voxel',
        decisionCount: 0,
        pendingDecisionCount: 0,
        alertCount: 0,
        hasActivePreApproval: false,
        toleranceOverrides: [],
        decisions: [],
      };
    }

    try {
      const voxel = await this.prisma.voxel.findUnique({
        where: { id: voxelId },
        include: {
          alerts: { where: { status: 'ACTIVE' } },
          pre_approvals: { where: { valid_until: { gt: new Date() } } },
          tolerance_overrides: true,
        },
      });

      if (!voxel) {return null;}

      // Get decision attachments
      const attachments = await this.prisma.voxelDecisionAttachment.findMany({
        where: { voxel_id: voxelId },
        include: {
          decision: {
            include: { created_by: true, approved_by: true },
          },
        },
      });

      const decisions = attachments.map((a: any) => a.decision);
      const pendingDecisions = decisions.filter((d: any) => d.status === 'PENDING');

      return {
        voxelId: voxel.id,
        voxelUrn: voxel.urn,
        voxelName: voxel.name,
        decisionCount: decisions.length,
        pendingDecisionCount: pendingDecisions.length,
        alertCount: voxel.alerts?.length || 0,
        hasActivePreApproval: (voxel.pre_approvals?.length || 0) > 0,
        toleranceOverrides: (voxel.tolerance_overrides || []).map((o: any) => ({
          overrideId: o.id,
          type: o.type,
          originalValue: o.original_value,
          overrideValue: o.override_value,
          approvedBy: o.approved_by_id,
          approvedAt: o.approved_at,
        })),
        decisions: decisions.map((d: any) => this.toMobileDecisionCard(d)),
      };
    } catch (error) {
      logger.error('Error getting voxel surface data', { error, voxelId });
      return null;
    }
  }

  /**
   * Convert decision to mobile card format
   */
  private toMobileDecisionCard(decision: any): MobileDecisionCard {
    return {
      decisionId: decision.id,
      decisionUrn: decision.urn,
      title: decision.title || decision.summary,
      type: decision.type,
      status: decision.status,
      priority: decision.priority || 'MEDIUM',
      summary: decision.summary || '',
      createdBy: decision.created_by?.name || 'Unknown',
      createdAt: decision.created_at,
      approvedBy: decision.approved_by?.name,
      approvedAt: decision.approved_at,
      costImpact: decision.cost_impact,
      scheduleImpact: decision.schedule_impact,
      requiresAcknowledgment: decision.requires_acknowledgment || false,
      acknowledged: false, // Would check acknowledgment records
      attachmentCount: 0,
      commentCount: 0,
      canApprove: false,
      canEscalate: true,
    };
  }

  /**
   * Determine notification priority based on surface data
   */
  private determinePriority(surfaceData: {
    alertCount: number;
    pendingDecisionCount: number;
    hasActivePreApproval: boolean;
    toleranceOverrides: any[];
  }): NotificationPriority {
    // Critical if there are active alerts
    if (surfaceData.alertCount > 0) {
      return 'URGENT';
    }

    // High if there are pending decisions requiring action
    if (surfaceData.pendingDecisionCount > 0) {
      return 'HIGH';
    }

    // Normal if there are pre-approvals or overrides to be aware of
    if (surfaceData.hasActivePreApproval || surfaceData.toleranceOverrides.length > 0) {
      return 'NORMAL';
    }

    return 'LOW';
  }

  /**
   * Build voxel entry notification
   */
  private async buildVoxelEntryNotification(
    event: GeofenceEvent,
    surfaceData: {
      voxelId: string;
      voxelUrn: string;
      voxelName: string;
      decisionCount: number;
      pendingDecisionCount: number;
      alertCount: number;
      hasActivePreApproval: boolean;
      toleranceOverrides: ToleranceOverrideSummary[];
    },
    priority: NotificationPriority
  ): Promise<VoxelEntryNotification> {
    const { userId, projectId, tenantId, voxelId } = event;

    // Build title and body
    const { title, body } = this.buildNotificationContent(surfaceData, priority);

    // Build deep link
    const deepLink = `ectropy://voxel/${voxelId}/surface`;

    const data: VoxelEntryNotificationData = {
      voxelId: surfaceData.voxelId,
      voxelUrn: surfaceData.voxelUrn,
      decisionCount: surfaceData.decisionCount,
      pendingDecisionCount: surfaceData.pendingDecisionCount,
      alertCount: surfaceData.alertCount,
      hasActivePreApproval: surfaceData.hasActivePreApproval,
      toleranceOverrides: surfaceData.toleranceOverrides,
      deepLink,
      requiresAcknowledgment: event.acknowledgmentRequired,
    };

    return {
      notificationId: uuidv4(),
      userId,
      projectId,
      tenantId,
      voxelId,
      voxelName: surfaceData.voxelName,
      channel: this.selectChannel(priority),
      priority,
      title,
      body,
      data,
      actionRequired: event.acknowledgmentRequired,
      sentAt: new Date().toISOString(),
      status: 'PENDING',
    };
  }

  /**
   * Build notification content
   */
  private buildNotificationContent(
    surfaceData: {
      voxelName: string;
      alertCount: number;
      pendingDecisionCount: number;
      hasActivePreApproval: boolean;
      toleranceOverrides: any[];
    },
    priority: NotificationPriority
  ): { title: string; body: string } {
    const { voxelName, alertCount, pendingDecisionCount, hasActivePreApproval, toleranceOverrides } = surfaceData;

    let title: string;
    let body: string;

    if (alertCount > 0) {
      title = `Alert: ${voxelName}`;
      body = `${alertCount} active alert${alertCount > 1 ? 's' : ''} in this area. Review required.`;
    } else if (pendingDecisionCount > 0) {
      title = `Decisions: ${voxelName}`;
      body = `${pendingDecisionCount} pending decision${pendingDecisionCount > 1 ? 's' : ''} to review.`;
    } else if (toleranceOverrides.length > 0) {
      title = `Tolerance Override: ${voxelName}`;
      body = `${toleranceOverrides.length} tolerance override${toleranceOverrides.length > 1 ? 's' : ''} active.`;
    } else if (hasActivePreApproval) {
      title = `Pre-Approval: ${voxelName}`;
      body = 'Pre-approved decisions available in this area.';
    } else {
      title = `Entering: ${voxelName}`;
      body = 'You have entered a tracked work area.';
    }

    return { title, body };
  }

  /**
   * Select notification channel based on priority
   */
  private selectChannel(priority: NotificationPriority): NotificationChannel {
    // Urgent always uses push + SMS
    if (priority === 'URGENT' && this.config.smsEnabled) {
      return 'SMS';
    }

    // Default to push
    if (this.config.pushEnabled) {
      return 'PUSH';
    }

    // Fallback to in-app
    return 'IN_APP';
  }

  // ===========================================================================
  // Notification Sending
  // ===========================================================================

  /**
   * Send notification through appropriate channel
   */
  private async sendNotification(notification: VoxelEntryNotification): Promise<boolean> {
    switch (notification.channel) {
      case 'PUSH':
        return this.sendPushNotification(notification);
      case 'SMS':
        return this.sendSmsNotification(notification);
      case 'EMAIL':
        return this.sendEmailNotification(notification);
      case 'IN_APP':
        // In-app notifications are stored, not sent externally
        return true;
      default:
        return false;
    }
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(notification: VoxelEntryNotification): Promise<boolean> {
    if (!this.sendPushFn) {
      logger.debug('Push notification function not configured');
      return true; // Consider it successful for testing
    }

    try {
      const payload: PushNotificationPayload = {
        userId: notification.userId,
        title: notification.title,
        body: notification.body,
        data: notification.data as unknown as Record<string, unknown>,
        priority: notification.priority === 'URGENT' ? 'high' : 'normal',
        sound: notification.priority === 'URGENT' ? 'alert.wav' : 'default',
        channelId: 'voxel-alerts',
      };

      return await this.sendPushFn(payload);
    } catch (error) {
      logger.error('Failed to send push notification', { error, notification });
      return false;
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(notification: VoxelEntryNotification): Promise<boolean> {
    if (!this.sendSmsFn || !this.prisma) {
      logger.debug('SMS notification function not configured');
      return true;
    }

    try {
      // Get user phone number
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
        select: { phone: true },
      });

      if (!user?.phone) {
        logger.warn('User has no phone number for SMS', { userId: notification.userId });
        return false;
      }

      // Build SMS message
      const message = `${notification.title}\n${notification.body}\n${notification.data.deepLink}`;

      return await this.sendSmsFn(user.phone, message);
    } catch (error) {
      logger.error('Failed to send SMS notification', { error, notification });
      return false;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: VoxelEntryNotification): Promise<boolean> {
    if (!this.sendEmailFn || !this.prisma) {
      logger.debug('Email notification function not configured');
      return true;
    }

    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
        select: { email: true },
      });

      if (!user?.email) {
        logger.warn('User has no email for notification', { userId: notification.userId });
        return false;
      }

      // Build email
      const subject = notification.title;
      const body = `
        <h2>${notification.title}</h2>
        <p>${notification.body}</p>
        <p>Voxel: ${notification.voxelName}</p>
        <p><a href="${notification.data.deepLink}">View Decision Surface</a></p>
      `;

      return await this.sendEmailFn(user.email, subject, body);
    } catch (error) {
      logger.error('Failed to send email notification', { error, notification });
      return false;
    }
  }

  // ===========================================================================
  // Acknowledgment Reminders
  // ===========================================================================

  /**
   * Send acknowledgment reminder
   */
  async sendAcknowledgmentReminder(
    userId: string,
    decisionId: string,
    decisionTitle: string,
    voxelName: string,
    reminderNumber: number
  ): Promise<boolean> {
    if (!this.checkRateLimit(userId)) {
      return false;
    }

    const title = `Reminder: Acknowledgment Required`;
    const body = reminderNumber === 1
      ? `Please acknowledge "${decisionTitle}" in ${voxelName}`
      : `Reminder ${reminderNumber}: "${decisionTitle}" still requires acknowledgment`;

    const payload: PushNotificationPayload = {
      userId,
      title,
      body,
      data: {
        type: 'acknowledgment_reminder',
        decisionId,
        reminderNumber,
      },
      priority: reminderNumber >= 2 ? 'high' : 'normal',
    };

    if (this.sendPushFn) {
      return this.sendPushFn(payload);
    }

    return true;
  }

  // ===========================================================================
  // Rate Limiting & Quiet Hours
  // ===========================================================================

  /**
   * Check if user is within rate limit
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const counter = this.rateLimitCounters.get(userId);

    if (!counter || counter.resetAt < now) {
      // Reset counter
      this.rateLimitCounters.set(userId, {
        count: 1,
        resetAt: now + 3600000, // 1 hour
      });
      return true;
    }

    if (counter.count >= this.config.rateLimitPerHour) {
      return false;
    }

    counter.count++;
    return true;
  }

  /**
   * Check if currently in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.config.quietHoursEnabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (!this.config.quietHoursStart || !this.config.quietHoursEnd) {
      return false;
    }

    // Handle overnight quiet hours (e.g., 22:00 - 06:00)
    if (this.config.quietHoursStart > this.config.quietHoursEnd) {
      return currentTime >= this.config.quietHoursStart || currentTime < this.config.quietHoursEnd;
    }

    return currentTime >= this.config.quietHoursStart && currentTime < this.config.quietHoursEnd;
  }

  // ===========================================================================
  // History & Statistics
  // ===========================================================================

  /**
   * Record notification in history
   */
  private recordNotification(notification: VoxelEntryNotification): void {
    const entry: NotificationHistoryEntry = {
      notificationId: notification.notificationId,
      userId: notification.userId,
      channel: notification.channel,
      sentAt: notification.sentAt,
      status: notification.status,
    };

    const history = this.notificationHistory.get(notification.userId) || [];
    history.push(entry);

    // Keep only last 100 notifications per user
    if (history.length > 100) {
      history.shift();
    }

    this.notificationHistory.set(notification.userId, history);
  }

  /**
   * Get notification history for user
   */
  getNotificationHistory(userId: string): NotificationHistoryEntry[] {
    return this.notificationHistory.get(userId) || [];
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    totalUsers: number;
    totalNotifications: number;
    config: NotificationConfig;
  } {
    let totalNotifications = 0;
    for (const history of this.notificationHistory.values()) {
      totalNotifications += history.length;
    }

    return {
      totalUsers: this.notificationHistory.size,
      totalNotifications,
      config: this.config,
    };
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create notification service instance
 */
export function createNotificationService(config?: NotificationServiceConfig): NotificationService {
  return new NotificationService(config);
}

export default NotificationService;
