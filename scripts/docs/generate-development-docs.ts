#!/usr/bin/env tsx
/**
 * Development Guide Documentation Generator
 * Generates DEVELOPMENT.md from development-guide.json
 * Part of the JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DevelopmentGuide {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: {
    title: string;
    description: string;
    maintainer: string;
    humanViewUrl: string;
    status: string;
    tags: string[];
  };
  overview: any;
  localDevelopmentSetup: any;
  developmentWorkflow: any;
  productionDeployment: any;
  configuration: any;
  validation: any;
  rollbackProcedures: any;
  maintenance: any;
  troubleshooting: any;
  relatedDocuments?: any;
}

function generateMarkdown(guide: DevelopmentGuide, sourcePath: string): string {
  const date = new Date(guide.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let md = `# ${guide.metadata.title}\n\n`;
  md += `**Last Updated:** ${date}\n`;
  md += `**Status:** ${guide.metadata.status}\n\n`;
  md += `${guide.overview.purpose}\n\n`;
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
  md += `1. [Local Development Setup](#local-development-setup)\n`;
  md += `2. [Development Workflow](#development-workflow)\n`;
  md += `3. [Production Deployment](#production-deployment)\n`;
  md += `4. [Configuration](#configuration)\n`;
  md += `5. [Validation](#validation)\n`;
  md += `6. [Rollback Procedures](#rollback-procedures)\n`;
  md += `7. [Maintenance](#maintenance)\n`;
  md += `8. [Troubleshooting](#troubleshooting)\n\n`;
  md += `---\n\n`;

  // Local Development Setup
  if (guide.localDevelopmentSetup) {
    md += `## Local Development Setup\n\n`;

    if (guide.localDevelopmentSetup.prerequisites) {
      md += `### Prerequisites\n\n`;
      guide.localDevelopmentSetup.prerequisites.forEach((prereq: any) => {
        md += `- **${prereq.name}** ${prereq.version}\n`;
        if (prereq.installation) md += `  - Installation: ${prereq.installation}\n`;
      });
      md += `\n`;
    }

    if (guide.localDevelopmentSetup.initialSetup) {
      md += `### Initial Setup\n\n`;
      guide.localDevelopmentSetup.initialSetup.forEach((step: any) => {
        md += `${step.step}. **${step.name}**\n\n`;
        if (step.commands && Array.isArray(step.commands)) {
          md += `   \`\`\`bash\n`;
          step.commands.forEach((cmd: string) => {
            md += `   ${cmd}\n`;
          });
          md += `   \`\`\`\n\n`;
        }
        if (step.note) {
          md += `   > ${step.note}\n\n`;
        }
      });
    }

    if (guide.localDevelopmentSetup.optionalSetup) {
      md += `### Optional Setup\n\n`;
      Object.entries(guide.localDevelopmentSetup.optionalSetup).forEach(([key, config]: [string, any]) => {
        md += `#### ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n`;
        if (config.purpose) md += `**Purpose:** ${config.purpose}\n\n`;

        if (config.installation && Array.isArray(config.installation)) {
          md += `**Installation:**\n\n\`\`\`bash\n`;
          config.installation.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }

        if (config.configuration && Array.isArray(config.configuration)) {
          md += `**Configuration:**\n\n\`\`\`bash\n`;
          config.configuration.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }
      });
    }

    md += `---\n\n`;
  }

  // Development Workflow
  if (guide.developmentWorkflow) {
    md += `## Development Workflow\n\n`;

    if (guide.developmentWorkflow.makingChanges) {
      md += `### Making Changes\n\n`;
      const mc = guide.developmentWorkflow.makingChanges;
      if (mc.branchStrategy) md += `**Branch Strategy:** ${mc.branchStrategy}\n\n`;
      if (mc.steps && Array.isArray(mc.steps)) {
        mc.steps.forEach((step: string, idx: number) => {
          md += `${idx + 1}. ${step}\n`;
        });
        md += `\n`;
      }
    }

    if (guide.developmentWorkflow.testing) {
      md += `### Testing\n\n`;
      Object.entries(guide.developmentWorkflow.testing).forEach(([type, test]: [string, any]) => {
        md += `**${type.charAt(0).toUpperCase() + type.slice(1)} Tests:**\n`;
        md += `- Command: \`${test.command}\`\n`;
        md += `- ${test.description}\n`;
        if (test.environments) {
          md += `- Environments: ${test.environments.join(', ')}\n`;
        }
        md += `\n`;
      });
    }

    if (guide.developmentWorkflow.codeQuality) {
      md += `### Code Quality\n\n`;
      Object.entries(guide.developmentWorkflow.codeQuality).forEach(([key, command]: [string, any]) => {
        const label = key.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** \`${command}\`\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Production Deployment
  if (guide.productionDeployment) {
    md += `## Production Deployment\n\n`;

    if (guide.productionDeployment.prerequisites) {
      md += `### Prerequisites\n\n`;

      if (guide.productionDeployment.prerequisites.requiredAccess) {
        md += `#### Required Access\n\n`;
        guide.productionDeployment.prerequisites.requiredAccess.forEach((access: string) => {
          md += `- ${access}\n`;
        });
        md += `\n`;
      }

      if (guide.productionDeployment.prerequisites.requiredTools) {
        md += `#### Required Tools\n\n`;
        guide.productionDeployment.prerequisites.requiredTools.forEach((tool: string) => {
          md += `- ${tool}\n`;
        });
        md += `\n`;
      }
    }

    if (guide.productionDeployment.infrastructureSetup) {
      md += `### Infrastructure Setup\n\n`;
      guide.productionDeployment.infrastructureSetup.steps.forEach((step: any, idx: number) => {
        md += `#### ${idx + 1}. ${step.name}\n\n`;
        if (step.description) md += `${step.description}\n\n`;
        if (step.terraform) md += `**Uses Terraform**\n\n`;
        if (step.commands && Array.isArray(step.commands)) {
          md += `\`\`\`bash\n`;
          step.commands.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }
      });
    }

    if (guide.productionDeployment.nginxValidation) {
      md += `### Nginx Configuration Validation\n\n`;
      guide.productionDeployment.nginxValidation.steps.forEach((step: any, idx: number) => {
        md += `#### ${idx + 1}. ${step.name}\n\n`;
        if (step.command) md += `\`\`\`bash\n${step.command}\n\`\`\`\n\n`;
        if (step.checks) {
          md += `**Checks:**\n`;
          step.checks.forEach((check: string) => md += `- ${check}\n`);
          md += `\n`;
        }
        if (step.description) md += `${step.description}\n\n`;
      });
    }

    if (guide.productionDeployment.initialDeployment) {
      md += `### Initial Deployment\n\n`;
      guide.productionDeployment.initialDeployment.steps.forEach((step: any) => {
        md += `#### Step ${step.step}: ${step.name}\n\n`;
        if (step.command) {
          md += `\`\`\`bash\n${step.command}\n\`\`\`\n\n`;
        }
        if (step.commands && Array.isArray(step.commands)) {
          md += `\`\`\`bash\n`;
          step.commands.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }
      });
    }

    if (guide.productionDeployment.blueGreenDeployment) {
      md += `### Blue-Green Deployment\n\n`;
      md += `${guide.productionDeployment.blueGreenDeployment.description}\n\n`;
      if (guide.productionDeployment.blueGreenDeployment.steps && Array.isArray(guide.productionDeployment.blueGreenDeployment.steps)) {
        guide.productionDeployment.blueGreenDeployment.steps.forEach((step: string, idx: number) => {
          md += `${idx + 1}. ${step}\n`;
        });
        md += `\n`;
      }
    }

    md += `---\n\n`;
  }

  // Configuration
  if (guide.configuration) {
    md += `## Configuration\n\n`;

    if (guide.configuration.environmentVariables) {
      md += `### Environment Variables\n\n`;

      if (guide.configuration.environmentVariables.required) {
        md += `**Required:**\n`;
        guide.configuration.environmentVariables.required.forEach((env: string) => {
          md += `- \`${env}\`\n`;
        });
        md += `\n`;
      }

      if (guide.configuration.environmentVariables.optional) {
        md += `**Optional:**\n`;
        guide.configuration.environmentVariables.optional.forEach((env: string) => {
          md += `- \`${env}\`\n`;
        });
        md += `\n`;
      }
    }

    if (guide.configuration.secrets) {
      md += `### Secrets Management\n\n`;
      md += `- **Storage:** ${guide.configuration.secrets.storage}\n`;
      md += `- **Rotation:** ${guide.configuration.secrets.rotation}\n`;
      md += `- **Access:** ${guide.configuration.secrets.access}\n\n`;
    }

    md += `---\n\n`;
  }

  // Validation
  if (guide.validation) {
    md += `## Validation\n\n`;

    if (guide.validation.healthChecks) {
      md += `### Health Checks\n\n`;
      guide.validation.healthChecks.forEach((check: any) => {
        md += `**${check.service}:**\n`;
        md += `- Endpoint: \`${check.endpoint}\`\n`;
        md += `- Expected: \`${JSON.stringify(check.expected)}\`\n\n`;
      });
    }

    if (guide.validation.smokeTests) {
      md += `### Smoke Tests\n\n`;
      guide.validation.smokeTests.forEach((test: string) => {
        md += `- ${test}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Rollback Procedures
  if (guide.rollbackProcedures) {
    md += `## Rollback Procedures\n\n`;

    if (guide.rollbackProcedures.automated) {
      md += `### Automated Rollback\n\n`;
      md += `- **Trigger:** ${guide.rollbackProcedures.automated.trigger}\n`;
      md += `- **Action:** ${guide.rollbackProcedures.automated.action}\n\n`;
    }

    if (guide.rollbackProcedures.manual) {
      md += `### Manual Rollback\n\n`;
      guide.rollbackProcedures.manual.steps.forEach((step: string, idx: number) => {
        md += `${idx + 1}. ${step}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Maintenance
  if (guide.maintenance) {
    md += `## Maintenance\n\n`;

    if (guide.maintenance.regular) {
      md += `### Regular Tasks\n\n`;
      guide.maintenance.regular.forEach((task: any) => {
        md += `**${task.task}**\n`;
        md += `- Frequency: ${task.frequency}\n`;
        md += `- Retention: ${task.retention || 'N/A'}\n`;
        if (task.process) md += `- Process: ${task.process}\n`;
        md += `\n`;
      });
    }

    if (guide.maintenance.monitoring) {
      md += `### Monitoring\n\n`;

      if (guide.maintenance.monitoring.metrics) {
        md += `**Metrics:**\n`;
        guide.maintenance.monitoring.metrics.forEach((metric: string) => {
          md += `- ${metric}\n`;
        });
        md += `\n`;
      }

      if (guide.maintenance.monitoring.alerts) {
        md += `**Alerts:**\n`;
        guide.maintenance.monitoring.alerts.forEach((alert: string) => {
          md += `- ${alert}\n`;
        });
        md += `\n`;
      }

      if (guide.maintenance.monitoring.tools) {
        md += `**Tools:**\n`;
        guide.maintenance.monitoring.tools.forEach((tool: string) => {
          md += `- ${tool}\n`;
        });
        md += `\n`;
      }
    }

    md += `---\n\n`;
  }

  // Troubleshooting
  if (guide.troubleshooting) {
    md += `## Troubleshooting\n\n`;

    if (guide.troubleshooting.common) {
      md += `### Common Issues\n\n`;
      guide.troubleshooting.common.forEach((issue: any) => {
        md += `#### ${issue.issue}\n\n`;
        if (issue.checks && Array.isArray(issue.checks)) {
          issue.checks.forEach((check: string) => {
            md += `- ${check}\n`;
          });
          md += `\n`;
        }
      });
    }

    if (guide.troubleshooting.debugging) {
      md += `### Debugging Commands\n\n`;
      Object.entries(guide.troubleshooting.debugging).forEach(([type, command]: [string, any]) => {
        md += `- **${type.charAt(0).toUpperCase() + type.slice(1)}:** \`${command}\`\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Related Documents
  if (guide.relatedDocuments) {
    md += `## Related Documents\n\n`;
    Object.entries(guide.relatedDocuments).forEach(([name, path]: [string, any]) => {
      const label = name.replace(/([A-Z])/g, ' $1').trim();
      md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** \`${path}\`\n`;
    });
    md += `\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `**Maintainer:** ${guide.metadata.maintainer}\n`;
  md += `**Version:** ${guide.version}\n`;
  md += `**Last Updated:** ${guide.lastUpdated}\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Generated by:** \`scripts/docs/generate-development-docs.ts\`\n`;
  md += `**Documentation Standard:** Enterprise JSON-First Pattern\n`;

  return md;
}

async function generateDevelopmentDocs(): Promise<void> {
  const jsonPath = path.resolve(__dirname, '../../apps/mcp-server/data/development-guide.json');
  const mdPath = path.resolve(__dirname, '../../docs/DEVELOPMENT.md');
  const relativePath = 'apps/mcp-server/data/development-guide.json';

  console.log('📖 Generating development guide documentation...');
  console.log(`   Source: ${jsonPath}`);
  console.log(`   Output: ${mdPath}`);

  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const guide: DevelopmentGuide = JSON.parse(jsonContent);

    const markdown = generateMarkdown(guide, relativePath);

    await fs.writeFile(mdPath, markdown, 'utf-8');

    console.log(`✅ Generated ${mdPath}`);
  } catch (error) {
    console.error('❌ Error generating development guide:', error);
    process.exit(1);
  }
}

// Run generation
generateDevelopmentDocs();
