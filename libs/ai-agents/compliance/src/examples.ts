/**
 * =============================================================================
 * COMPLIANCE AGENT USAGE EXAMPLES
 *
 * This file demonstrates how to use the enhanced Compliance Agent for
 * comprehensive IFC model and project requirements validation.
 */

import { ComplianceAgent } from './compliance-agent.js';
import type {
  TemplateService,
  AgentConfig,
  ComplianceIssue,
} from '../../shared/types.js';
import { Pool } from 'pg';
// Example template service implementation
const exampleTemplateService: TemplateService = {
  async getActiveTemplate(projectId: string) {
    return {
      templateId: 'commercial-template-v2',
      name: 'Commercial Building Template',
      version: '2.1.0',
      projectId,
      isActive: true,
      metadata: {
        requirements: {
          buildingCodes: ['IBC-2021', 'ADA-2010'],
          accessibility: true,
          sustainabilityRating: 'LEED-Silver',
          maximumHeight: 50,
          maximumFloorArea: 10000,
          requiredExits: 2,
          fireRating: '1-hour',
        },
        reviewIntervalDays: 30,
        requiredApprovals: [
          'architect_approval',
          'structural_engineer_approval',
          'project_manager_approval',
        ],
      },
    };
  },
  async validateProjectAccess(projectId: string) {
    // In real implementation, check user permissions
    return true;
  },
};

// Example usage function
export async function demonstrateComplianceValidation() {
  // Initialize database connection (example)
  const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'ectropy',
    user: process.env.DB_USER || 'ectropy',
    password: process.env.DB_PASSWORD || '',
  });
  // Configure agent with custom settings
  const config: AgentConfig = {
    maxRetries: 5,
    timeout: 60000,
    enableEventEmission: true,
  };
  // Initialize compliance agent
  const agent = new ComplianceAgent(db, exampleTemplateService, config);
  // Set up event listeners for monitoring
  agent.on('validation:completed', (event) => {
  });

  agent.on('requirements:validated', (event) => {
    console.log(
      `✅ Requirements checked: ${event.metadata?.requirementsChecked?.join(', ')}`
    );
  });

  agent.on('error', (event) => {
  });

  try {
    // Example 1: IFC Model Validation
    const ifcResult = await agent.validateIfcModel(
      'project-demo-2024',
      '/path/to/demo-building.ifc'
    );
    if (ifcResult.passed) {
    } else {
      // Group issues by severity
      const errorIssues = ifcResult.issues.filter(
        (i: ComplianceIssue) => i.severity === 'error'
      );
      const warningIssues = ifcResult.issues.filter(
        (i: ComplianceIssue) => i.severity === 'warning'
      );
      const infoIssues = ifcResult.issues.filter(
        (i: ComplianceIssue) => i.severity === 'info'
      );
      if (errorIssues.length > 0) {
        errorIssues.forEach((issue: ComplianceIssue, index: number) => {
        });
      }
      if (warningIssues.length > 0) {
        warningIssues.forEach((issue: ComplianceIssue, index: number) => {
        });
      }
      if (infoIssues.length > 0) {
        infoIssues.forEach((issue: ComplianceIssue, index: number) => {
        });
      }
    }
    // Display validation details
    if (ifcResult.validationDetails) {
      console.log(
        `  📋 Templates: ${ifcResult.validationDetails.templatesChecked.join(', ')}`
      );
      console.log(
        `  📚 Codes: ${ifcResult.validationDetails.codeReferences.slice(0, 3).join(', ')}${ifcResult.validationDetails.codeReferences.length > 3 ? '...' : ''}`
      );
      if (ifcResult.validationDetails.metadata) {
        console.log(
          `  🏗️  Building Type: ${ifcResult.validationDetails.metadata['buildingType']}`
        );
        console.log(
          `  🏛️  Jurisdiction: ${ifcResult.validationDetails.metadata['jurisdiction']}`
        );
        console.log(
          `  🔧 IFC Version: ${ifcResult.validationDetails.metadata['ifcVersion']}`
        );
      }
    }

    // Example 2: Project Requirements Validation
    const reqResult =
      await agent.validateProjectRequirements('project-demo-2024');
    if (reqResult.passed) {
    } else {
      reqResult.issues.forEach((issue, index) => {
        const icon =
          issue.severity === 'error'
            ? '🚨'
            : issue.severity === 'warning'
              ? '⚠️'
              : 'ℹ️';
        if (issue.recommendation) {
        }
      });
    }

  } catch (error) {
    if (error instanceof Error) {
    }
  } finally {
    // Clean up database connection
    await db.end();
  }
}
// Additional utility functions for specific validation scenarios
/**
 * Validate a new construction project
 */
export async function validateNewConstruction(
  projectId: string,
  ifcModelPath: string,
  db: any,
  templateService: TemplateService
) {
  const agent = new ComplianceAgent(db, templateService);
  // Comprehensive validation for new construction
  const [ifcResult, reqResult] = await Promise.all([
    agent.validateIfcModel(projectId, ifcModelPath),
    agent.validateProjectRequirements(projectId),
  ]);
  // Combined result analysis
  const allIssues = [
    ...(ifcResult?.issues || []),
    ...(reqResult?.issues || []),
  ];
  const criticalErrors = allIssues.filter((i) => i.severity === 'error');
  return {
    overallCompliance: criticalErrors.length === 0,
    ifcCompliance: ifcResult?.passed || false,
    requirementsCompliance: reqResult?.passed || false,
    totalIssues: allIssues.length,
    criticalErrors: criticalErrors.length,
    issues: allIssues,
    recommendations: allIssues.map((i) => i.recommendation).filter(Boolean),
  };
}

/**
 * Validate renovation project with different requirements
 */
export async function validateRenovationProject(
  projectId: string,
  ifcModelPath: string,
  db: any,
  templateService: TemplateService,
  config = {
    maxRetries: 3,
    timeout: 45000, // Shorter timeout for renovations
  }
) {
  const agent = new ComplianceAgent(db, templateService, config);
  // Focus on accessibility and safety for renovations
  const ifcResult = await agent.validateIfcModel(projectId, ifcModelPath);
  // Filter for renovation-specific concerns
  const accessibilityIssues = ifcResult.issues.filter(
    (i) =>
      i.code?.includes('ADA') || i.message.toLowerCase().includes('accessible')
  );
  const safetyIssues = ifcResult.issues.filter(
    (i) =>
      i.code?.includes('IBC') &&
      (i.message.toLowerCase().includes('exit') ||
        i.message.toLowerCase().includes('egress') ||
        i.message.toLowerCase().includes('fire'))
  );

  return {
    compliance: ifcResult.passed,
    accessibilityIssues,
    safetyIssues,
    renovationRecommendations: [
      ...accessibilityIssues.map((i) => i.recommendation),
      ...safetyIssues.map((i) => i.recommendation),
    ].filter(Boolean),
  };
}
// Example of running the production (uncomment to execute)
// if (require.main === module) {
// }
