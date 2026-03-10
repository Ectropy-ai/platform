#!/usr/bin/env tsx
/**
 * Deployment Runbook Documentation Generator
 * Generates DEPLOYMENT_RUNBOOK_*.md from deployment-runbook-*.json
 * Part of the JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DeploymentRunbook {
  version: string;
  environment: string;
  deploymentDate: string;
  deploymentType: string;
  metadata: {
    catalogId: string;
    purpose: string;
    maintainer: string;
    lastUpdated: string;
    relatedDocuments?: string[];
  };
  executiveSummary: {
    description: string;
    deploymentStatus: string;
    confidenceLevel: string;
    riskAssessment: string;
    keyChanges: string[];
  };
  preDeploymentValidation?: any;
  deploymentSteps?: any;
  postDeploymentValidation?: any;
  rollbackProcedure?: any;
  successCriteria?: any;
  knownIssues?: any[];
  technicalChanges?: any;
  environmentVariables?: any[];
  riskAssessment?: any;
  architectureAlignment?: any;
  mcpIntegration?: any;
  monitoringAndAlerts?: any;
  supportAndEscalation?: any;
  signOff?: any;
  evidenceAndDocumentation?: any;
  relatedDocuments?: any;
}

function generateMarkdown(runbook: DeploymentRunbook, sourcePath: string): string {
  let md = `# Deployment Runbook v${runbook.version}\n\n`;

  md += `**Environment:** ${runbook.environment}\n`;
  md += `**Deployment Date:** ${runbook.deploymentDate}\n`;
  md += `**Type:** ${runbook.deploymentType}\n\n`;

  md += `---\n\n`;

  // Auto-generation warning
  md += `⚠️ **IMPORTANT: This file is auto-generated**\n\n`;
  md += `This markdown file is automatically generated from \`${sourcePath}\`.\n\n`;
  md += `**To make changes:**\n`;
  md += `1. Edit \`${sourcePath}\` directly\n`;
  md += `2. Validate: \`pnpm docs:validate\`\n`;
  md += `3. Regenerate markdown: \`pnpm docs:generate\`\n`;
  md += `4. Commit only the JSON file\n\n`;
  md += `**Never edit this file directly** - your changes will be overwritten.\n\n`;
  md += `---\n\n`;

  // Table of Contents
  md += `## Table of Contents\n\n`;
  md += `1. [Executive Summary](#executive-summary)\n`;
  md += `2. [Pre-Deployment Validation](#pre-deployment-validation)\n`;
  md += `3. [Deployment Steps](#deployment-steps)\n`;
  md += `4. [Post-Deployment Validation](#post-deployment-validation)\n`;
  md += `5. [Rollback Procedure](#rollback-procedure)\n`;
  md += `6. [Success Criteria](#success-criteria)\n`;
  md += `7. [Known Issues](#known-issues)\n`;
  md += `8. [Technical Changes](#technical-changes)\n\n`;
  md += `---\n\n`;

  // Executive Summary
  md += `## Executive Summary\n\n`;
  md += `${runbook.executiveSummary.description}\n\n`;
  md += `**Deployment Status:** ${runbook.executiveSummary.deploymentStatus}\n`;
  md += `**Confidence Level:** ${runbook.executiveSummary.confidenceLevel}\n`;
  md += `**Risk Assessment:** ${runbook.executiveSummary.riskAssessment}\n\n`;

  if (runbook.executiveSummary.keyChanges && runbook.executiveSummary.keyChanges.length > 0) {
    md += `### Key Changes\n\n`;
    runbook.executiveSummary.keyChanges.forEach(change => {
      md += `- ${change}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // Pre-Deployment Validation
  if (runbook.preDeploymentValidation) {
    md += `## Pre-Deployment Validation\n\n`;
    md += `**Status:** ${runbook.preDeploymentValidation.status || 'N/A'}\n\n`;

    if (runbook.preDeploymentValidation.build) {
      md += `### Build Validation\n\n`;
      Object.entries(runbook.preDeploymentValidation.build).forEach(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** ${value}\n`;
      });
      md += `\n`;
    }

    if (runbook.preDeploymentValidation.infrastructureHealth) {
      md += `### Infrastructure Health\n\n`;
      Object.entries(runbook.preDeploymentValidation.infrastructureHealth).forEach(([service, health]: [string, any]) => {
        md += `**${service}:**\n`;
        Object.entries(health).forEach(([key, value]) => {
          md += `- ${key}: ${value}\n`;
        });
        md += `\n`;
      });
    }

    md += `---\n\n`;
  }

  // Deployment Steps
  if (runbook.deploymentSteps) {
    md += `## Deployment Steps\n\n`;

    if (Array.isArray(runbook.deploymentSteps)) {
      runbook.deploymentSteps.forEach((step: any, index: number) => {
        md += `### Step ${index + 1}: ${step.name || step.description}\n\n`;

        if (step.commands && Array.isArray(step.commands)) {
          md += `**Commands:**\n\`\`\`bash\n`;
          step.commands.forEach((cmd: string) => {
            md += `${cmd}\n`;
          });
          md += `\`\`\`\n\n`;
        }

        if (step.validation) {
          md += `**Validation:** ${step.validation}\n\n`;
        }

        if (step.expectedResult) {
          md += `**Expected Result:** ${step.expectedResult}\n\n`;
        }
      });
    } else {
      // Handle object-based deployment steps
      Object.entries(runbook.deploymentSteps).forEach(([phase, steps]: [string, any]) => {
        md += `### ${phase.charAt(0).toUpperCase() + phase.slice(1)}\n\n`;

        if (Array.isArray(steps)) {
          steps.forEach((step: any) => {
            md += `**${step.name || step.description}**\n`;
            if (step.commands) {
              md += `\`\`\`bash\n${Array.isArray(step.commands) ? step.commands.join('\n') : step.commands}\n\`\`\`\n`;
            }
            md += `\n`;
          });
        }
      });
    }

    md += `---\n\n`;
  }

  // Post-Deployment Validation
  if (runbook.postDeploymentValidation) {
    md += `## Post-Deployment Validation\n\n`;

    if (runbook.postDeploymentValidation.functionalTests) {
      md += `### Functional Tests\n\n`;
      runbook.postDeploymentValidation.functionalTests.forEach((test: any) => {
        md += `**${test.name}**\n`;
        md += `- Priority: ${test.priority}\n`;
        if (test.endpoint) md += `- Endpoint: ${test.endpoint}\n`;
        if (test.expectedResult) md += `- Expected: ${test.expectedResult}\n`;
        md += `\n`;
      });
    }

    if (runbook.postDeploymentValidation.healthChecks) {
      md += `### Health Checks\n\n`;
      Object.entries(runbook.postDeploymentValidation.healthChecks).forEach(([service, check]: [string, any]) => {
        md += `**${service}:** ${check}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Rollback Procedure
  if (runbook.rollbackProcedure) {
    md += `## Rollback Procedure\n\n`;

    if (runbook.rollbackProcedure.triggers && Array.isArray(runbook.rollbackProcedure.triggers)) {
      md += `### Rollback Triggers\n\n`;
      runbook.rollbackProcedure.triggers.forEach((trigger: string) => {
        md += `- ${trigger}\n`;
      });
      md += `\n`;
    }

    if (runbook.rollbackProcedure.steps && Array.isArray(runbook.rollbackProcedure.steps)) {
      md += `### Rollback Steps\n\n`;
      runbook.rollbackProcedure.steps.forEach((step: any, index: number) => {
        md += `${index + 1}. **${step.name}**\n`;
        if (step.commands) {
          md += `   \`\`\`bash\n`;
          if (Array.isArray(step.commands)) {
            step.commands.forEach((cmd: string) => md += `   ${cmd}\n`);
          } else {
            md += `   ${step.commands}\n`;
          }
          md += `   \`\`\`\n`;
        }
        md += `\n`;
      });
    }

    md += `---\n\n`;
  }

  // Success Criteria
  if (runbook.successCriteria) {
    md += `## Success Criteria\n\n`;

    if (Array.isArray(runbook.successCriteria)) {
      runbook.successCriteria.forEach((criterion: string) => {
        md += `- ${criterion}\n`;
      });
    } else {
      Object.entries(runbook.successCriteria).forEach(([category, criteria]: [string, any]) => {
        md += `### ${category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1')}\n\n`;
        if (Array.isArray(criteria)) {
          criteria.forEach((item: string) => {
            md += `- ${item}\n`;
          });
        }
        md += `\n`;
      });
    }

    md += `---\n\n`;
  }

  // Known Issues
  if (runbook.knownIssues && Array.isArray(runbook.knownIssues) && runbook.knownIssues.length > 0) {
    md += `## Known Issues\n\n`;

    runbook.knownIssues.forEach((issue: any) => {
      md += `### ${issue.title || issue.description}\n\n`;
      md += `- **Priority:** ${issue.priority}\n`;
      if (issue.impact) md += `- **Impact:** ${issue.impact}\n`;
      if (issue.workaround) md += `- **Workaround:** ${issue.workaround}\n`;
      if (issue.resolution) md += `- **Resolution:** ${issue.resolution}\n`;
      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Technical Changes
  if (runbook.technicalChanges) {
    md += `## Technical Changes\n\n`;

    Object.entries(runbook.technicalChanges).forEach(([category, changes]: [string, any]) => {
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1')}\n\n`;

      if (Array.isArray(changes)) {
        changes.forEach((change: any) => {
          if (typeof change === 'string') {
            md += `- ${change}\n`;
          } else {
            md += `**${change.file || change.name || 'Change'}**\n`;
            if (change.description) md += `- ${change.description}\n`;
            if (change.reason) md += `- Reason: ${change.reason}\n`;
          }
        });
      } else if (typeof changes === 'object') {
        Object.entries(changes).forEach(([key, value]) => {
          md += `- **${key}:** ${value}\n`;
        });
      }

      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Environment Variables
  if (runbook.environmentVariables && Array.isArray(runbook.environmentVariables) && runbook.environmentVariables.length > 0) {
    md += `## Environment Variables\n\n`;

    runbook.environmentVariables.forEach((env: any) => {
      md += `### ${env.name}\n\n`;
      if (env.description) md += `${env.description}\n\n`;
      if (env.required !== undefined) md += `- **Required:** ${env.required}\n`;
      if (env.default) md += `- **Default:** ${env.default}\n`;
      if (env.example) md += `- **Example:** \`${env.example}\`\n`;
      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `**Maintainer:** ${runbook.metadata.maintainer}\n`;
  md += `**Last Updated:** ${runbook.metadata.lastUpdated}\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Generated by:** \`scripts/docs/generate-deployment-runbook.ts\`\n`;
  md += `**Documentation Standard:** Enterprise JSON-First Pattern\n`;

  return md;
}

async function generateDeploymentRunbook(): Promise<void> {
  const jsonPath = path.resolve(__dirname, '../../apps/mcp-server/data/deployment-runbook-v2.1.1.json');
  const mdPath = path.resolve(__dirname, '../../docs/DEPLOYMENT_RUNBOOK_v2.1.1.md');
  const relativePath = 'apps/mcp-server/data/deployment-runbook-v2.1.1.json';

  console.log('📖 Generating deployment runbook documentation...');
  console.log(`   Source: ${jsonPath}`);
  console.log(`   Output: ${mdPath}`);

  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const runbook: DeploymentRunbook = JSON.parse(jsonContent);

    const markdown = generateMarkdown(runbook, relativePath);

    await fs.writeFile(mdPath, markdown, 'utf-8');

    console.log(`✅ Generated ${mdPath}`);
  } catch (error) {
    console.error('❌ Error generating deployment runbook:', error);
    process.exit(1);
  }
}

// Run generation
generateDeploymentRunbook();
