/**
 * ==============================================================================
 * EMAIL TEMPLATE SERVICE (M2.6)
 * ==============================================================================
 * Marketing-controlled email template management with Handlebars rendering
 * Milestone: User Management M2.6 (Backend Services Layer)
 * Purpose: Enables marketing team to control email content without deployments
 * ==============================================================================
 */

import {
  PrismaClient,
  EmailTemplateType,
  EmailTemplateStatus,
} from '@prisma/client';
import Handlebars from 'handlebars';
import { logger } from '@ectropy/shared/utils';
import {
  UserManagementError,
  UserManagementErrorCode,
  CreateTemplateRequest,
  PublishTemplateRequest,
  RenderTemplateRequest,
  TemplateResponse,
  RenderedTemplate,
} from './types.js';

/**
 * Email Template Service - Marketing-controlled email content
 *
 * Features:
 * - Handlebars variable substitution ({{user_name}}, {{verification_link}})
 * - Version tracking for rollback
 * - A/B testing support (variant_name)
 * - Scheduling (active_from, active_until)
 * - Variable validation
 */
export class EmailTemplateService {
  constructor(private prisma: PrismaClient) {
    // Register Handlebars helpers
    this.registerHelpers();

    logger.info('[EmailTemplateService] Initialized');
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Conditional helper - Commented out until needed in templates
    // TODO: Re-enable when templates use if_eq helper (requires proper Handlebars.HelperDelegate typing)
    // Handlebars.registerHelper('if_eq', function (a: any, b: any, opts: any) {
    //   if (a === b) {
    //     return opts.fn(this);
    //   } else {
    //     return opts.inverse(this);
    //   }
    // });
  }

  /**
   * Get active template for a given type
   *
   * Retrieves the currently active template for sending emails.
   * If multiple active templates exist (A/B testing), returns the primary (no variant_name).
   *
   * @param templateType - Type of template (VERIFICATION_EMAIL, WELCOME_TRIAL, etc.)
   * @returns Active template or throws if not found
   */
  async getActiveTemplate(
    templateType: EmailTemplateType
  ): Promise<TemplateResponse> {
    const now = new Date();

    // Find active template within date range
    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        template_type: templateType,
        status: EmailTemplateStatus.ACTIVE,
        OR: [
          {
            active_from: { lte: now },
            active_until: { gte: now },
          },
          {
            active_from: { lte: now },
            active_until: null,
          },
          {
            active_from: null,
            active_until: { gte: now },
          },
          {
            active_from: null,
            active_until: null,
          },
        ],
        variant_name: null, // Primary template (not A/B variant)
      },
      orderBy: {
        version: 'desc',
      },
    });

    if (!template) {
      throw new UserManagementError(
        `No active template found for type: ${templateType}`,
        UserManagementErrorCode.TEMPLATE_NOT_FOUND,
        { templateType }
      );
    }

    logger.debug('[EmailTemplateService] Retrieved active template', {
      templateType,
      templateId: template.id,
      version: template.version,
    });

    return this.mapToResponse(template);
  }

  /**
   * Render template with variables
   *
   * Validates required variables and renders using Handlebars.
   * Returns fully rendered email content ready for sending.
   *
   * @param request - Template type and variables
   * @returns Rendered email content
   */
  async renderTemplate(
    request: RenderTemplateRequest
  ): Promise<RenderedTemplate> {
    const template = await this.getActiveTemplate(request.templateType);

    // Get full template data
    const fullTemplate = await this.prisma.emailTemplate.findUnique({
      where: { id: template.id },
    });

    if (!fullTemplate) {
      throw new UserManagementError(
        'Template not found',
        UserManagementErrorCode.TEMPLATE_NOT_FOUND,
        { templateId: template.id }
      );
    }

    // Validate required variables
    this.validateVariables(fullTemplate.required_variables, request.variables);

    try {
      // Compile and render templates
      const subjectTemplate = Handlebars.compile(fullTemplate.subject);
      const bodyTextTemplate = Handlebars.compile(fullTemplate.body_text);
      const bodyHtmlTemplate = Handlebars.compile(fullTemplate.body_html);
      const previewTextTemplate = fullTemplate.preview_text
        ? Handlebars.compile(fullTemplate.preview_text)
        : null;

      const rendered: RenderedTemplate = {
        subject: subjectTemplate(request.variables),
        bodyText: bodyTextTemplate(request.variables),
        bodyHtml: bodyHtmlTemplate(request.variables),
        previewText: previewTextTemplate
          ? previewTextTemplate(request.variables)
          : undefined,
      };

      logger.info('[EmailTemplateService] Template rendered successfully', {
        templateType: request.templateType,
        templateId: template.id,
        variableCount: Object.keys(request.variables).length,
      });

      return rendered;
    } catch (error) {
      logger.error('[EmailTemplateService] Template rendering failed', {
        templateType: request.templateType,
        templateId: template.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new UserManagementError(
        'Failed to render template',
        UserManagementErrorCode.TEMPLATE_RENDERING_FAILED,
        {
          templateType: request.templateType,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
  }

  /**
   * Create new email template
   *
   * Creates a draft template for marketing team to edit.
   * Template must be published to become active.
   *
   * @param request - Template creation request
   * @returns Created template
   */
  async createTemplate(
    request: CreateTemplateRequest
  ): Promise<TemplateResponse> {
    // Validate Handlebars syntax
    this.validateHandlebars(request.subject);
    this.validateHandlebars(request.bodyText);
    this.validateHandlebars(request.bodyHtml);

    // Get next version number
    const latestVersion = await this.prisma.emailTemplate.findFirst({
      where: { template_type: request.templateType },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = (latestVersion?.version || 0) + 1;

    const template = await this.prisma.emailTemplate.create({
      data: {
        template_type: request.templateType,
        status: EmailTemplateStatus.DRAFT,
        subject: request.subject,
        body_text: request.bodyText,
        body_html: request.bodyHtml,
        preview_text: request.previewText,
        required_variables: request.requiredVariables,
        version,
        notes: request.notes,
      },
    });

    logger.info('[EmailTemplateService] Template created', {
      templateId: template.id,
      templateType: request.templateType,
      version,
      createdBy: request.createdBy,
    });

    return this.mapToResponse(template);
  }

  /**
   * Publish template (make active)
   *
   * Archives current active template and activates the new one.
   * Supports scheduled activation via activeFrom/activeUntil.
   *
   * @param request - Publish request with scheduling options
   * @returns Published template
   */
  async publishTemplate(
    request: PublishTemplateRequest
  ): Promise<TemplateResponse> {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id: request.templateId },
    });

    if (!template) {
      throw new UserManagementError(
        'Template not found',
        UserManagementErrorCode.TEMPLATE_NOT_FOUND,
        { templateId: request.templateId }
      );
    }

    // Archive current active template
    await this.prisma.emailTemplate.updateMany({
      where: {
        template_type: template.template_type,
        status: EmailTemplateStatus.ACTIVE,
        variant_name: null,
      },
      data: {
        status: EmailTemplateStatus.ARCHIVED,
      },
    });

    // Activate new template
    const published = await this.prisma.emailTemplate.update({
      where: { id: request.templateId },
      data: {
        status: EmailTemplateStatus.ACTIVE,
        active_from: request.activeFrom || new Date(),
        active_until: request.activeUntil,
      },
    });

    logger.info('[EmailTemplateService] Template published', {
      templateId: request.templateId,
      templateType: template.template_type,
      version: template.version,
      publishedBy: request.publishedBy,
      activeFrom: request.activeFrom,
      activeUntil: request.activeUntil,
    });

    return this.mapToResponse(published);
  }

  /**
   * Create A/B test variant
   *
   * Creates a variant of an existing template for A/B testing.
   * Both primary and variant can be active simultaneously.
   *
   * @param parentId - Parent template ID
   * @param variantName - Name for the variant (e.g., "variant-a")
   * @param changes - Template changes for the variant
   * @returns Created variant template
   */
  async createVariant(
    parentId: string,
    variantName: string,
    changes: Partial<{
      subject: string;
      bodyText: string;
      bodyHtml: string;
      previewText: string;
    }>
  ): Promise<TemplateResponse> {
    const parent = await this.prisma.emailTemplate.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new UserManagementError(
        'Parent template not found',
        UserManagementErrorCode.TEMPLATE_NOT_FOUND,
        { parentId }
      );
    }

    const variant = await this.prisma.emailTemplate.create({
      data: {
        template_type: parent.template_type,
        status: EmailTemplateStatus.DRAFT,
        subject: changes.subject || parent.subject,
        body_text: changes.bodyText || parent.body_text,
        body_html: changes.bodyHtml || parent.body_html,
        preview_text: changes.previewText || parent.preview_text,
        required_variables: parent.required_variables,
        version: parent.version,
        parent_id: parentId,
        variant_name: variantName,
      },
    });

    logger.info('[EmailTemplateService] A/B variant created', {
      variantId: variant.id,
      parentId,
      variantName,
      templateType: parent.template_type,
    });

    return this.mapToResponse(variant);
  }

  /**
   * Validate required variables are present
   *
   * @param required - Required variable names
   * @param provided - Provided variables
   * @throws If any required variables are missing
   */
  private validateVariables(
    required: string[],
    provided: Record<string, string>
  ): void {
    const missing = required.filter((varName) => !(varName in provided));

    if (missing.length > 0) {
      throw new UserManagementError(
        `Missing required template variables: ${missing.join(', ')}`,
        UserManagementErrorCode.MISSING_REQUIRED_VARIABLES,
        { missing, required }
      );
    }
  }

  /**
   * Validate Handlebars syntax
   *
   * @param template - Template string to validate
   * @throws If syntax is invalid
   */
  private validateHandlebars(template: string): void {
    try {
      Handlebars.compile(template);
    } catch (error) {
      throw new UserManagementError(
        'Invalid Handlebars template syntax',
        UserManagementErrorCode.TEMPLATE_RENDERING_FAILED,
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }
  }

  /**
   * Map Prisma model to response
   */
  private mapToResponse(template: any): TemplateResponse {
    return {
      id: template.id,
      templateType: template.template_type,
      status: template.status,
      subject: template.subject,
      version: template.version,
      requiredVariables: template.required_variables,
      activeFrom: template.active_from,
      activeUntil: template.active_until,
      createdAt: template.created_at,
    };
  }
}
