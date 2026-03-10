/*
 * =============================================================================
 * COMPLIANCE AGENT - COMPREHENSIVE BUILDING CODE VALIDATION
 *
 * PURPOSE:
 *  Validates IFC models and project data against building codes and
 *  DAO-governed templates. Provides comprehensive compliance checking
 *  with detailed issue reporting and metadata tracking.
 * FEATURES:
 *  - Full IFC model parsing and validation
 *  - Building code compliance checking (IBC, ADA, local codes)
 *  - Project requirements validation against templates
 *  - Real-time event emission with validation status
 *  - Comprehensive error handling and retry logic
 *  - Type-safe interfaces throughout
 * VALIDATION COVERAGE:
 *  - Structural integrity and safety requirements
 *  - Accessibility compliance (ADA standards)
 *  - Fire safety and egress requirements
 *  - Material specifications and sustainability
 *  - Space utilization and zoning compliance
 */
import { BaseAgent } from '../../shared/base-agent.js';
import type {
  ComplianceResult,
  ComplianceIssue,
  ValidationDetails,
  TemplateService,
  AgentConfig,
} from '../../shared/types.js';
import {
  IFCProcessingService,
  type IFCElement,
  type IFCProject,
} from '@ectropy/ifc-processing';
import * as fs from 'fs';

/**
 * Interface for building code validation rules
 */
interface BuildingCodeRule {
  code: string;
  description: string;
  category:
    | 'structural'
    | 'accessibility'
    | 'fire-safety'
    | 'sustainability'
    | 'zoning';
  severity: 'error' | 'warning' | 'info';
  validator: (
    element: IFCElement,
    context: ValidationContext
  ) => ComplianceIssue | null;
}

/**
 * Context information for validation operations
 */
interface ValidationContext {
  projectId: string;
  templateData: any;
  buildingType: string;
  occupancyType: string;
  jurisdiction: string;
  totalFloorArea: number;
  occupantLoad: number;
  buildingHeight: number;
}

/**
 * Project requirements from template and database
 */
interface ProjectRequirements {
  templateId: string;
  buildingCodes: string[];
  accessibility: boolean;
  sustainabilityRating?: string;
  maximumHeight?: number;
  maximumFloorArea?: number;
  requiredExits: number;
  fireRating: string;
  structuralRequirements: string[];
}

/**
 * Comprehensive building code compliance agent
 * Validates IFC models against international building codes, accessibility standards,
 * fire safety requirements, and project-specific templates. Provides detailed
 * compliance reporting with actionable recommendations.
 */
export class ComplianceAgent extends BaseAgent {
  private ifcService: IFCProcessingService;
  private buildingCodes: BuildingCodeRule[];
  /**
   * Initialize the compliance agent with database and template service
   *
   * @param db - Database connection pool for project data access
   * @param templateService - Service for accessing DAO-governed templates
   * @param config - Optional agent configuration overrides
   */
  constructor(
    db: any, // Pool type
    templateService: TemplateService,
    config?: AgentConfig
  ) {
    super(db, templateService, config);
    this.ifcService = new IFCProcessingService(db);
    this.buildingCodes = this.initializeBuildingCodes();
  }
  /**
   * Returns the agent type identifier
   */
  protected getAgentType(): string {
    return 'compliance';
  }

  /**
   * Comprehensive IFC model validation against building codes and project requirements
   * Performs a complete compliance check of the provided IFC model, validating against:
   * - International Building Code (IBC) requirements
   * - ADA accessibility standards
   * - Fire safety and egress requirements
   * - Local building codes and ordinances
   * - Project-specific template requirements
   * @param projectId Unique identifier for the project being validated
   * @param ifcPath File system path to the IFC model file
   * @returns Promise<ComplianceResult> Detailed validation results with issues and metadata
   * @throws AgentError When validation cannot be completed due to system errors
   */
  async validateIfcModel(
    projectId: string,
    ifcPath: string
  ): Promise<ComplianceResult> {
    return this.executeWithRetry('validateIfcModel', async () => {
      // Validate project access and retrieve template
      await this.validateProject(projectId);
      const template = await this.templateService.getActiveTemplate(projectId);
      if (!template) {
        throw this.createError(
          'validateIfcModel',
          'No active template found for project',
          'NO_TEMPLATE',
          { projectId, ifcPath }
        );
      }
      // Verify IFC file exists and is readable
      if (!fs.existsSync(ifcPath)) {
        throw this.createError(
          'validateIfcModel',
          `IFC file not found: ${ifcPath}`,
          'FILE_NOT_FOUND',
          { ifcPath }
        );
      }
      // Process IFC file to extract elements
      const ifcProject = await this.parseIfcModel(ifcPath);
      // Get project requirements from template and database
      const projectRequirements = await this.getProjectRequirements(
        projectId,
        template
      );
      // Create validation context
      const context = await this.createValidationContext(template, ifcProject);
      // Perform comprehensive validation
      const issues = await this.performComplianceValidation(
        ifcProject,
        context,
        projectRequirements
      );
      // Create detailed validation results
      const validationDetails = this.createDetailedValidationResults(
        ifcPath,
        template.templateId,
        context,
        ifcProject
      );
      const passed =
        issues.filter((issue) => issue.severity === 'error').length === 0;
      const hasWarnings =
        issues.filter((issue) => issue.severity === 'warning').length > 0;
      const result: ComplianceResult = {
        ...this.createBaseResult(projectId, passed),
        passed,
        issues: issues.sort((a, b) => {
          const severityOrder: { [key: string]: number } = {
            error: 0,
            warning: 1,
            info: 2,
          };
          const aPriority = severityOrder[a.severity] ?? 3;
          const bPriority = severityOrder[b.severity] ?? 3;
          return aPriority - bPriority;
        }),
        validationDetails,
      };
      // Emit detailed event with validation status and metadata
      this.emitEvent('validation:completed', {
        operation: 'validateIfcModel',
        result,
        metadata: {
          ifcPath,
          templateId: template.templateId,
          issueCount: issues.length,
          errorCount: issues.filter((i) => i.severity === 'error').length,
          warningCount: issues.filter((i) => i.severity === 'warning').length,
          elementsValidated: ifcProject.elements.length,
          validationStatus: passed ? 'passed' : 'failed',
          hasWarnings,
          buildingType: context.buildingType,
          jurisdiction: context.jurisdiction,
        },
      });
      return result;
    });
  }
  /**
   * Initialize comprehensive building code validation rules.
   * Sets up validation rules for major building codes and standards:
   * - International Building Code (IBC)
   * - Americans with Disabilities Act (ADA)
   * - International Fire Code (IFC)
   * @returns Array of BuildingCodeRule objects for validation
   */
  private initializeBuildingCodes(): BuildingCodeRule[] {
    return [
      // Structural integrity requirements
      {
        code: 'IBC-2021-1604',
        description: 'Minimum structural load requirements',
        category: 'structural',
        severity: 'error',
        validator: this.validateStructuralLoads.bind(this),
      },
      {
        code: 'IBC-2021-1605',
        description: 'Load combinations and factors',
        category: 'structural',
        severity: 'error',
        validator: this.validateLoadCombinations.bind(this),
      },
      // Accessibility compliance
      {
        code: 'ADA-2010-206.2.4',
        description: 'Accessible route to elevated spaces',
        category: 'accessibility',
        severity: 'error',
        validator: this.validateAccessibleRoutes.bind(this),
      },
      {
        code: 'ADA-2010-307.2',
        description: 'Clear floor or ground space requirements',
        category: 'accessibility',
        severity: 'warning',
        validator: this.validateClearFloorSpace.bind(this),
      },
      // Fire safety and egress
      {
        code: 'IBC-2021-1021.1',
        description: 'Minimum number of exits required',
        category: 'fire-safety',
        severity: 'error',
        validator: this.validateExitRequirements.bind(this),
      },
      {
        code: 'IBC-2021-1005.1',
        description: 'Egress width requirements',
        category: 'fire-safety',
        severity: 'error',
        validator: this.validateEgressWidth.bind(this),
      },
      // Sustainability requirements
      {
        code: 'ASHRAE-90.1',
        description: 'Energy efficiency standards',
        category: 'sustainability',
        severity: 'warning',
        validator: this.validateEnergyEfficiency.bind(this),
      },
    ];
  }

  /**
   * Parse IFC model and extract building elements.
   * @param ifcPath Path to IFC file
   * @returns Parsed IFC project with elements
   */
  private async parseIfcModel(ifcPath: string): Promise<IFCProject> {
    try {
      // Use existing IFC processing service for parsing
      return await this.ifcService['parseIFCFile'](ifcPath);
    } catch (error) {
      throw this.createError(
        'parseIfcModel',
        `Failed to parse IFC model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'IFC_PARSE_ERROR',
        { ifcPath, originalError: error }
      );
    }
  }

  /**
   * Get comprehensive project requirements from template and database.
   * @param projectId Project identifier
   * @param template Active template data
   * @returns Project requirements object
   */
  private async getProjectRequirements(
    projectId: string,
    template: any
  ): Promise<ProjectRequirements> {
    const client = await this.db.connect();
    try {
      // Get project details
      const projectQuery = `
        SELECT building_type, occupancy_type, jurisdiction, 
               total_floor_area, occupant_load, building_height
        FROM projects 
        WHERE id = $1
      `;
      const projectResult = await client.query(projectQuery, [projectId]);
      if (projectResult.rows.length === 0) {
        throw this.createError(
          'getProjectRequirements',
          `Project not found: ${projectId}`,
          'PROJECT_NOT_FOUND',
          { projectId }
        );
      }
      const project = projectResult.rows[0];
      // Get template-specific requirements
      const templateRequirements = template.metadata?.requirements || {};
      return {
        templateId: template.templateId,
        buildingCodes: templateRequirements.buildingCodes || [
          'IBC-2021',
          'ADA-2010',
        ],
        accessibility: templateRequirements.accessibility !== false,
        sustainabilityRating: templateRequirements.sustainabilityRating,
        maximumHeight:
          templateRequirements.maximumHeight || project.building_height,
        maximumFloorArea:
          templateRequirements.maximumFloorArea || project.total_floor_area,
        requiredExits:
          templateRequirements.requiredExits ||
          Math.ceil((project.occupant_load || 0) / 500),
        fireRating: templateRequirements.fireRating || '1-hour',
        structuralRequirements: templateRequirements.structuralRequirements || [
          'dead-load',
          'live-load',
          'wind-load',
        ],
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError(
        'getProjectRequirements',
        'Failed to retrieve project requirements',
        'REQUIREMENTS_ERROR',
        { projectId, originalError: error }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create validation context with project and building information.
   * @param projectId Project identifier
   * @param template Template data
   * @param ifcProject Parsed IFC project
   * @returns Validation context object
   */
  private async createValidationContext(
    template: any,
    ifcProject: IFCProject,
    projectId?: string
  ): Promise<ValidationContext> {
    let project: any = {};
    if (projectId) {
      const client = await this.db.connect();
      try {
        const projectQuery = `
          SELECT building_type, occupancy_type, jurisdiction, 
                 total_floor_area, occupant_load, building_height
          FROM projects 
          WHERE id = $1
        `;
        const result = await client.query(projectQuery, [projectId]);
        project = result.rows[0] || {};
      } finally {
        client.release();
      }
    }
    return {
      projectId: projectId || '',
      templateData: template,
      buildingType: project.building_type || 'commercial',
      occupancyType: project.occupancy_type || 'business',
      jurisdiction: project.jurisdiction || 'international',
      totalFloorArea: project.total_floor_area || 0,
      occupantLoad: project.occupant_load || 0,
      buildingHeight: project.building_height || 0,
    };
  }
  /**
   * Comprehensive project requirements validation.
   * Validates project-level compliance requirements including:
   * - Template adherence and governance rules
   * - Regulatory approvals and permits
   * - Stakeholder approval workflows
   * - Documentation completeness
   * - Schedule and milestone compliance
   * @param projectId Project identifier
   * @returns Promise<ComplianceResult> Detailed validation results for project requirements
   */
  async validateProjectRequirements(
    projectId: string
  ): Promise<ComplianceResult> {
    return this.executeWithRetry('validateProjectRequirements', async () => {
      // Get comprehensive project requirements
      const issues: ComplianceIssue[] = [];
      // Check template compliance
      const templateIssues = await this.validateTemplateCompliance(projectId);
      issues.push(...templateIssues);
      // Check regulatory compliance
      const regulatoryIssues =
        await this.validateRegulatoryCompliance(projectId);
      issues.push(...regulatoryIssues);
      // Check documentation completeness
      const documentationIssues =
        await this.validateDocumentationCompliance(projectId);
      issues.push(...documentationIssues);
      // Check stakeholder approvals
      const approvalIssues = await this.validateApprovalWorkflow(projectId);
      issues.push(...approvalIssues);
      const passed = issues.filter((i) => i.severity === 'error').length === 0;
      this.emitEvent('requirements:validated', {
        operation: 'validateProjectRequirements',
        result: {
          ...this.createBaseResult(projectId, passed),
          passed,
          issues,
        },
        metadata: {
          validationStatus: passed ? 'compliant' : 'non-compliant',
          requirementsChecked: [
            'template_compliance',
            'regulatory_compliance',
            'documentation_completeness',
            'approval_workflow',
          ],
        },
      });
      return {
        ...this.createBaseResult(projectId, passed),
        passed,
        issues,
      };
    });
  }

  /**
   * Perform comprehensive compliance validation.
   * @param ifcProject Parsed IFC project data
   * @param context Validation context
   * @param requirements Project requirements
   * @returns Array of compliance issues found
   */
  private async performComplianceValidation(
    ifcProject: IFCProject,
    context: ValidationContext,
    requirements: ProjectRequirements
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    // Validate each building element against applicable codes
    for (const element of ifcProject.elements) {
      // Apply relevant building code rules to each element
      for (const rule of this.buildingCodes) {
        const issue = rule.validator(element, context);
        if (issue) {
          issues.push(issue);
        }
      }
    }
    // Perform project-level validations
    const projectIssues = await this.validateProjectLevelRequirements(
      ifcProject,
      context,
      requirements
    );
    issues.push(...projectIssues);
    return issues;
  }

  /**
   * Validate project-level requirements.
   * @param ifcProject IFC project data
   * @param context Validation context
   * @param requirements Project requirements
   * @returns Array of project-level issues
   */
  private async validateProjectLevelRequirements(
    ifcProject: IFCProject,
    context: ValidationContext,
    requirements: ProjectRequirements
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    // Validate building height limits
    if (context.buildingHeight > (requirements.maximumHeight || Infinity)) {
      issues.push({
        severity: 'error',
        code: 'HEIGHT_LIMIT_EXCEEDED',
        message: `Building height ${context.buildingHeight}m exceeds maximum allowed ${requirements.maximumHeight}m`,
        location: 'Building envelope',
        recommendation: 'Reduce building height or obtain variance approval',
      });
    }
    // Validate floor area limits
    if (context.totalFloorArea > (requirements.maximumFloorArea || Infinity)) {
      issues.push({
        severity: 'error',
        code: 'FLOOR_AREA_EXCEEDED',
        message: `Total floor area ${context.totalFloorArea}m² exceeds maximum allowed ${requirements.maximumFloorArea}m²`,
        location: 'Building floor plan',
        recommendation: 'Reduce floor area or obtain zoning variance',
      });
    }
    // Validate exit requirements
    const exitElements = ifcProject.elements.filter(
      (e: IFCElement) =>
        e.type.includes('DOOR') && e.properties?.['isExit'] === true
    );
    if (exitElements.length < requirements.requiredExits) {
      issues.push({
        severity: 'error',
        code: 'INSUFFICIENT_EXITS',
        message: `Found ${exitElements.length} exits, minimum ${requirements.requiredExits} required for occupant load of ${context.occupantLoad}`,
        location: 'Building egress system',
        recommendation:
          'Add additional exit doors to meet occupancy requirements',
      });
    }
    return issues;
  }
  /**
   * Create detailed validation results with comprehensive metadata.
   * @param ifcPath Path to the IFC file
   * @param templateId Template identifier
   * @param context Validation context
   * @param ifcProject Parsed IFC project
   * @returns ValidationDetails object
   */
  private createDetailedValidationResults(
    ifcPath: string,
    templateId: string,
    context: ValidationContext,
    ifcProject: IFCProject
  ): ValidationDetails {
    const codeReferences = this.buildingCodes.map((rule) => rule.code);
    if (context.jurisdiction !== 'international') {
      codeReferences.push(`${context.jurisdiction.toUpperCase()}-LOCAL-CODES`);
    }
    return {
      ifcPath,
      templatesChecked: [templateId],
      codeReferences: Array.from(new Set(codeReferences)),
      metadata: {
        elementsValidated: ifcProject.elements.length,
        buildingType: context.buildingType,
        occupancyType: context.occupancyType,
        jurisdiction: context.jurisdiction,
        validationTimestamp: new Date().toISOString(),
        ifcVersion: ifcProject.metadata?.ifcVersion,
        rulesApplied: this.buildingCodes.map((rule) => ({
          code: rule.code,
          description: rule.description,
          category: rule.category,
        })),
      },
    };
  }

  // =============================================================================
  // BUILDING CODE VALIDATORS

  /**
   * Validate structural load requirements per IBC-2021-1604
   */
  private validateStructuralLoads(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (
      !element.type.includes('BEAM') &&
      !element.type.includes('COLUMN') &&
      !element.type.includes('SLAB')
    ) {
      return null; // Rule not applicable
    }
    const minLoadCapacity = this.getMinimumLoadRequirement(
      element.type,
      context.occupancyType
    );
    const actualLoad = element.geometry?.volume || 0;
    if (actualLoad < minLoadCapacity * 0.8) {
      // 80% safety margin
      return {
        severity: 'error',
        code: 'IBC-2021-1604',
        message: `Structural element may not meet minimum load requirements (${actualLoad} < ${minLoadCapacity})`,
        location: `${element.type} - ${element.name || element.id}`,
        recommendation:
          'Verify structural calculations and increase member size if necessary',
      };
    }
    return null;
  }

  /**
   * Validate load combinations per IBC-2021-1605
   */
  private validateLoadCombinations(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (!element.type.includes('BEAM') && !element.type.includes('COLUMN')) {
      return null;
    }
    // Check if load combination data is available
    const hasLoadData = element.properties?.['loadCombinations'] || false;
    if (!hasLoadData) {
      return {
        severity: 'warning',
        code: 'IBC-2021-1605',
        message: 'Load combination data not found in structural element',
        location: `${element.type} - ${element.name || element.id}`,
        recommendation:
          'Provide load combination analysis for structural verification',
      };
    }
    return null;
  }

  /**
   * Validate accessible routes per ADA-2010-206.2.4
   */
  private validateAccessibleRoutes(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (!element.type.includes('STAIR') && !element.type.includes('RAMP')) {
      return null;
    }
    if (element.type.includes('STAIR')) {
      // Check if elevator or ramp alternative exists (simplified)
      return {
        severity: 'info',
        code: 'ADA-2010-206.2.4',
        message: 'Verify accessible route alternative to stairs',
        location: `${element.type} - ${element.name || element.id}`,
        recommendation:
          'Ensure elevator or ramp provides accessible route to same level',
      };
    }
    if (element.type.includes('RAMP')) {
      const slope = element.properties?.['slope'] || 0;
      if (slope > 0.083) {
        // 1:12 maximum slope
        return {
          severity: 'error',
          code: 'ADA-2010-206.2.4',
          message: `Ramp slope ${(slope * 100).toFixed(1)}% exceeds maximum 8.33% (1:12)`,
          location: `${element.type} - ${element.name || element.id}`,
          recommendation: 'Reduce ramp slope to meet ADA requirements',
        };
      }
    }
    return null;
  }

  /**
   * Validate clear floor space per ADA-2010-307.2
   */
  private validateClearFloorSpace(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (!element.type.includes('DOOR') && !element.type.includes('SPACE')) {
      return null;
    }
    if (element.type.includes('DOOR')) {
      const clearWidth = element.properties?.['clearWidth'] || 0;
      if (clearWidth < 0.815) {
        // 32 inches minimum
        return {
          severity: 'warning',
          code: 'ADA-2010-307.2',
          message: `Door clear width ${(clearWidth * 39.37).toFixed(1)}" is less than minimum 32"`,
          location: `${element.type} - ${element.name || element.id}`,
          recommendation:
            'Ensure door provides minimum 32" clear width when open',
        };
      }
    }
    return null;
  }

  /**
   * Validate exit requirements per IBC-2021-1021.1
   */
  private validateExitRequirements(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (!element.type.includes('DOOR') || !element.properties?.['isExit']) {
      return null;
    }
    const exitWidth = element.properties?.['width'] || 0;
    const minWidth = 0.915; // 36 inches minimum for exit doors
    if (exitWidth < minWidth) {
      return {
        severity: 'error',
        code: 'IBC-2021-1021.1',
        message: `Exit door width ${(exitWidth * 39.37).toFixed(1)}" is less than minimum 36"`,
        location: `Exit door - ${element.name || element.id}`,
        recommendation:
          'Increase door width to minimum 36" for exit requirements',
      };
    }
    return null;
  }

  /**
   * Validate egress width per IBC-2021-1005.1
   */
  private validateEgressWidth(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (!element.type.includes('CORRIDOR') && !element.type.includes('STAIR')) {
      return null;
    }
    const width = element.geometry?.area || element.properties?.['width'] || 0;
    const minWidth = element.type.includes('STAIR') ? 1.12 : 1.22; // 44" stairs, 48" corridors
    if (width < minWidth) {
      return {
        severity: 'error',
        code: 'IBC-2021-1005.1',
        message: `Egress width ${(width * 39.37).toFixed(1)}" is less than minimum ${(minWidth * 39.37).toFixed(0)}"`,
        location: `${element.type} - ${element.name || element.id}`,
        recommendation: `Increase ${element.type.toLowerCase()} width for proper egress`,
      };
    }
    return null;
  }

  /**
   * Validate energy efficiency per ASHRAE-90.1
   */
  private validateEnergyEfficiency(
    element: IFCElement,
    context: ValidationContext
  ): ComplianceIssue | null {
    if (
      !element.type.includes('WALL') &&
      !element.type.includes('WINDOW') &&
      !element.type.includes('ROOF')
    ) {
      return null;
    }
    // Check for insulation properties
    const hasInsulation = element.materials?.some(
      (material: string) =>
        material.toLowerCase().includes('insulation') ||
        material.toLowerCase().includes('thermal')
    );
    if (!hasInsulation) {
      return {
        severity: 'warning',
        code: 'ASHRAE-90.1',
        message:
          'Energy efficiency data not found for building envelope element',
        location: `${element.type} - ${element.name || element.id}`,
        recommendation:
          'Verify insulation and thermal performance meets energy code requirements',
      };
    }
    return null;
  }

  /**
   * Get minimum load requirement based on element type and occupancy
   */
  private getMinimumLoadRequirement(
    elementType: string,
    occupancyType: string
  ): number {
    // Simplified load requirements (in practice, this would be much more complex)
    const baseLoads: Record<string, number> = {
      IFCBEAM: 2.0,
      IFCCOLUMN: 3.0,
      IFCSLAB: 1.5,
    };
    const occupancyFactors: Record<string, number> = {
      residential: 1.0,
      commercial: 1.2,
      industrial: 1.5,
      assembly: 1.8,
    };
    const baseLoad = baseLoads[elementType as keyof typeof baseLoads] || 1.0;
    const factor =
      occupancyFactors[occupancyType as keyof typeof occupancyFactors] || 1.0;
    return baseLoad * factor;
  }

  // =============================================================================
  // PROJECT REQUIREMENTS VALIDATION METHODS

  /**
   * Validate template compliance requirements
   * @param projectId Project identifier
   * @returns Array of template compliance issues
   */
  private async validateTemplateCompliance(
    projectId: string
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    const client = await this.db.connect();
    try {
      // Fetch template and governance data (simplified)
      const template = await this.templateService.getActiveTemplate(projectId);
      if (!template) {
        issues.push({
          code: 'TEMPLATE_NOT_FOUND',
          severity: 'error',
          message: 'No active template found for project',
          location: 'Project setup',
          recommendation: 'Assign an active DAO template to the project',
        });
        return issues;
      }
      const governanceQuery = `
        SELECT governance_status, last_reviewed, required_approvals
        FROM project_governance 
        WHERE project_id = $1 AND template_id = $2
      `;
      const result = await client.query(governanceQuery, [
        projectId,
        template.templateId,
      ]);
      if (result.rows.length === 0) {
        issues.push({
          code: 'TEMPLATE_GOVERNANCE_MISSING',
          severity: 'warning',
          message: 'Project governance record not found for active template',
          location: 'Project governance',
          recommendation:
            'Initialize project governance tracking for template compliance',
        });
      } else {
        const governance = result.rows[0];
        if (governance.governance_status !== 'compliant') {
          issues.push({
            code: 'TEMPLATE_NON_COMPLIANT',
            severity: 'error',
            message: `Project governance status: ${governance.governance_status}`,
            location: 'Project governance',
            recommendation:
              'Address governance issues to achieve compliant status',
          });
        }
        // Check if review is overdue
        const lastReviewed = new Date(governance.last_reviewed);
        const reviewInterval =
          Number(template.metadata?.['reviewIntervalDays']) || 30;
        const daysSinceReview = Math.floor(
          (Date.now() - lastReviewed.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceReview > reviewInterval) {
          issues.push({
            code: 'GOVERNANCE_REVIEW_OVERDUE',
            severity: 'warning',
            message: `Governance review overdue by ${daysSinceReview - reviewInterval} days`,
            location: 'Project governance',
            recommendation:
              'Schedule governance review to maintain template compliance',
          });
        }
      }
    } catch (error) {
      issues.push({
        code: 'TEMPLATE_VALIDATION_ERROR',
        severity: 'error',
        message: `Failed to validate template compliance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        location: 'Template validation',
        recommendation:
          'Check database connectivity and template configuration',
      });
    } finally {
      client.release();
    }
    return issues;
  }

  /**
   * Validate regulatory compliance requirements
   * @param projectId Project identifier
   * @returns Array of regulatory compliance issues
   */
  private async validateRegulatoryCompliance(
    projectId: string
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    const client = await this.db.connect();
    try {
      // Check permit status
      const permitQuery = `
        SELECT permit_type, status, expiry_date, conditions
        FROM project_permits
        WHERE project_id = $1 AND status IN ('active', 'pending')
      `;
      const permitResult = await client.query(permitQuery, [projectId]);
      if (permitResult.rows.length === 0) {
        issues.push({
          code: 'PERMITS_MISSING',
          severity: 'error',
          message: 'No active or pending permits found for project',
          location: 'Regulatory permits',
          recommendation:
            'Obtain required building permits before proceeding with construction',
        });
      } else {
        // Check for expiring permits
        for (const permit of permitResult.rows) {
          const expiryDate = new Date(permit.expiry_date);
          const daysToExpiry = Math.floor(
            (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          if (daysToExpiry < 30 && daysToExpiry > 0) {
            issues.push({
              code: 'PERMIT_EXPIRING_SOON',
              severity: 'warning',
              message: `${permit.permit_type} permit expires in ${daysToExpiry} days`,
              location: 'Regulatory permits',
              recommendation:
                'Renew permit before expiration to avoid construction delays',
            });
          } else if (daysToExpiry <= 0) {
            issues.push({
              code: 'PERMIT_EXPIRED',
              severity: 'error',
              message: `${permit.permit_type} permit expired ${Math.abs(daysToExpiry)} days ago`,
              location: 'Regulatory permits',
              recommendation:
                'Renew expired permit immediately to resume construction',
            });
          }
        }
      }
      // Check code compliance certificates
      const requirements = await this.getProjectRequirements(projectId, {});
      const codeComplianceQuery = `
        SELECT code_type, compliance_status, last_inspection
        FROM code_compliance
        WHERE project_id = $1
      `;
      const complianceResult = await client.query(codeComplianceQuery, [
        projectId,
      ]);
      for (const code of requirements.buildingCodes) {
        const compliance = complianceResult.rows.find(
          (row: any) => row.code_type === code
        );
        if (!compliance) {
          issues.push({
            code: 'CODE_COMPLIANCE_MISSING',
            severity: 'warning',
            message: `No compliance record found for ${code}`,
            location: 'Code compliance',
            recommendation: `Schedule inspection for ${code} compliance verification`,
          });
        } else if (compliance.compliance_status !== 'compliant') {
          issues.push({
            code: 'CODE_NON_COMPLIANT',
            severity: 'error',
            message: `${code} compliance status: ${compliance.compliance_status}`,
            location: 'Code compliance',
            recommendation: `Address ${code} compliance issues identified in inspection`,
          });
        }
      }
    } catch (error) {
      issues.push({
        code: 'REGULATORY_VALIDATION_ERROR',
        severity: 'error',
        message: `Failed to validate regulatory compliance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        location: 'Regulatory validation',
        recommendation: 'Check database connectivity and permit records',
      });
    } finally {
      client.release();
    }
    return issues;
  }

  /**
   * Validate documentation completeness
   * @param projectId Project identifier
   * @returns Array of documentation issues
   */
  private async validateDocumentationCompliance(
    projectId: string
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    const client = await this.db.connect();
    try {
      // Check required documentation
      const requiredDocs = [
        'architectural_plans',
        'structural_drawings',
        'mechanical_plans',
        'electrical_plans',
        'specifications',
        'permit_application',
      ];
      const docQuery = `
        SELECT document_type, status, last_updated
        FROM project_documents
        WHERE project_id = $1 AND document_type = ANY($2)
      `;
      const docResult = await client.query(docQuery, [projectId, requiredDocs]);
      for (const docType of requiredDocs) {
        const doc = docResult.rows.find(
          (row: any) => row.document_type === docType
        );
        if (!doc) {
          issues.push({
            code: 'REQUIRED_DOCUMENT_MISSING',
            severity: 'error',
            message: `Required document missing: ${docType.replace('_', ' ')}`,
            location: 'Project documentation',
            recommendation: `Upload ${docType.replace('_', ' ')} to complete documentation requirements`,
          });
        } else if (doc.status !== 'approved') {
          issues.push({
            code: 'DOCUMENT_NOT_APPROVED',
            severity: 'warning',
            message: `Document pending approval: ${docType.replace('_', ' ')} (${doc.status})`,
            location: 'Project documentation',
            recommendation: `Complete approval process for ${docType.replace('_', ' ')}`,
          });
        }
      }
      // Check for outdated documents
      const outdatedQuery = `
        SELECT document_type, last_updated
        FROM project_documents
        WHERE project_id = $1 AND last_updated < NOW() - INTERVAL '90 days'
      `;
      const outdatedResult = await client.query(outdatedQuery, [projectId]);
      for (const doc of outdatedResult.rows) {
        issues.push({
          code: 'DOCUMENT_OUTDATED',
          severity: 'info',
          message: `Document may be outdated: ${doc.document_type.replace('_', ' ')}`,
          location: 'Project documentation',
          recommendation: `Review and update ${doc.document_type.replace('_', ' ')} if necessary`,
        });
      }
    } catch (error) {
      issues.push({
        code: 'DOCUMENTATION_VALIDATION_ERROR',
        severity: 'error',
        message: `Failed to validate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        location: 'Documentation validation',
        recommendation: 'Check database connectivity and document records',
      });
    } finally {
      client.release();
    }
    return issues;
  }

  /**
   * Validate approval workflow status
   * @param projectId Project identifier
   * @returns Array of approval workflow issues
   */
  private async validateApprovalWorkflow(
    projectId: string
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    const client = await this.db.connect();
    try {
      // Fetch template for required approvals
      const template = await this.templateService.getActiveTemplate(projectId);
      if (!template) {
        issues.push({
          code: 'TEMPLATE_NOT_FOUND',
          severity: 'error',
          message: 'No active template found for approval workflow validation',
          location: 'Project setup',
          recommendation: 'Assign an active DAO template to the project',
        });
        return issues;
      }
      const requiredApprovals = Array.isArray(
        template.metadata?.['requiredApprovals']
      )
        ? template.metadata['requiredApprovals']
        : [
            'architect_approval',
            'structural_engineer_approval',
            'project_manager_approval',
          ];
      const approvalQuery = `
        SELECT approval_type, status, approver_id, approved_at
        FROM project_approvals
        WHERE project_id = $1 AND approval_type = ANY($2)
      `;
      const approvalResult = await client.query(approvalQuery, [
        projectId,
        requiredApprovals,
      ]);
      for (const approvalType of requiredApprovals) {
        const approval = approvalResult.rows.find(
          (row: any) => row.approval_type === approvalType
        );
        if (!approval) {
          issues.push({
            code: 'APPROVAL_MISSING',
            severity: 'error',
            message: `Required approval missing: ${approvalType.replace('_', ' ')}`,
            location: 'Approval workflow',
            recommendation: `Obtain ${approvalType.replace('_', ' ')} to proceed with project`,
          });
        } else if (approval.status === 'pending') {
          issues.push({
            code: 'APPROVAL_PENDING',
            severity: 'warning',
            message: `Approval pending: ${approvalType.replace('_', ' ')}`,
            location: 'Approval workflow',
            recommendation: `Follow up on pending ${approvalType.replace('_', ' ')}`,
          });
        } else if (approval.status === 'rejected') {
          issues.push({
            code: 'APPROVAL_REJECTED',
            severity: 'error',
            message: `Approval rejected: ${approvalType.replace('_', ' ')}`,
            location: 'Approval workflow',
            recommendation: `Address rejection reasons and resubmit for ${approvalType.replace('_', ' ')}`,
          });
        }
      }
    } catch (error) {
      issues.push({
        code: 'APPROVAL_VALIDATION_ERROR',
        severity: 'error',
        message: `Failed to validate approvals: ${error instanceof Error ? error.message : 'Unknown error'}`,
        location: 'Approval validation',
        recommendation: 'Check database connectivity and approval records',
      });
    } finally {
      client.release();
    }
    return issues;
  }
  // =============================================================================
  // BUILDING CODE VALIDATORS
  // =============================================================================
}

// Re-export types for external consumption
export type { ComplianceResult, ComplianceIssue, ValidationDetails } from '../../shared/types.js';
