#!/usr/bin/env tsx
/**
 * Docker Compose Guide Documentation Generator
 * Generates DOCKER_COMPOSE_GUIDE.md from docker-compose-guide.json
 * Part of the JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DockerComposeGuide {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: any;
  overview: any;
  composeFiles: any;
  commonPatterns: any;
  bestPractices: any;
  troubleshooting: any;
  relatedDocuments?: any;
}

function generateMarkdown(guide: DockerComposeGuide, sourcePath: string): string {
  let md = `# ${guide.metadata.title}\n\n`;

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

  // Overview
  md += `## Available Compose Files\n\n`;
  md += `After cleanup (${guide.overview.lastCleanup}), we have **${guide.overview.totalComposeFiles} docker-compose files** with clear purposes:\n\n`;

  // Compose Files by Category
  if (guide.composeFiles) {
    // Local Development
    if (guide.composeFiles.localDevelopment) {
      md += `### Local Development\n\n`;
      guide.composeFiles.localDevelopment.forEach((compose: any, idx: number) => {
        md += `#### ${idx + 1}. \`${compose.file}\` - ${compose.name}\n`;
        md += `**Purpose:** ${compose.purpose}\n\n`;

        if (compose.services) {
          md += `**Services:** ${compose.services.join(', ')}\n\n`;
        }

        if (compose.useWhen) {
          md += `**Use When:**\n`;
          compose.useWhen.forEach((use: string) => {
            md += `- ${use}\n`;
          });
          md += `\n`;
        }

        if (compose.usage) {
          md += `**Usage:**\n\`\`\`bash\n`;
          if (compose.usage.start) md += `${compose.usage.start}\n\n`;

          if (compose.usage.runApps && Array.isArray(compose.usage.runApps)) {
            compose.usage.runApps.forEach((cmd: string) => md += `${cmd}\n`);
            md += `\n`;
          }

          if (compose.usage.startBackground) md += `# Or run in background:\n${compose.usage.startBackground}\n\n`;
          if (compose.usage.logs) md += `# View logs:\n${compose.usage.logs}\n\n`;

          if (compose.usage.endpoints) {
            md += `# Access services:\n`;
            Object.entries(compose.usage.endpoints).forEach(([name, url]) => {
              md += `# - ${name.charAt(0).toUpperCase() + name.slice(1)}: ${url}\n`;
            });
            md += `\n`;
          }

          if (compose.usage.shutdown) md += `${compose.usage.shutdown}\n`;
          md += `\`\`\`\n\n`;
        }

        if (compose.environment) {
          md += `**Environment Variables:**\n\`\`\`bash\n`;
          md += `cp ${compose.environment.template} ${compose.environment.file}\n`;
          md += `# ${compose.environment.instructions}\n`;
          md += `\`\`\`\n\n`;
        }

        md += `---\n\n`;
      });
    }

    // Monitoring
    if (guide.composeFiles.monitoring) {
      md += `### Optional: Monitoring\n\n`;
      guide.composeFiles.monitoring.forEach((compose: any, idx: number) => {
        md += `#### ${idx + 1}. \`${compose.file}\` - ${compose.name}\n`;
        md += `**Purpose:** ${compose.purpose}\n\n`;

        if (compose.services) {
          md += `**Services:** ${compose.services.join(', ')}\n\n`;
        }

        if (compose.useWith && Array.isArray(compose.useWith)) {
          md += `**Use With:**\n\`\`\`bash\n`;
          compose.useWith.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }

        if (compose.endpoints) {
          md += `**Endpoints:**\n`;
          Object.entries(compose.endpoints).forEach(([name, url]) => {
            md += `- ${name.charAt(0).toUpperCase() + name.slice(1)}: ${url}\n`;
          });
          md += `\n`;
        }

        if (compose.credentials) {
          md += `**Default Credentials:**\n`;
          Object.entries(compose.credentials).forEach(([service, creds]: [string, any]) => {
            md += `- **${service}:**\n`;
            md += `  - Username: ${creds.username}\n`;
            md += `  - Password: ${creds.password}\n`;
          });
          md += `\n`;
        }

        md += `---\n\n`;
      });
    }

    // Staging
    if (guide.composeFiles.staging) {
      md += `### Staging\n\n`;
      guide.composeFiles.staging.forEach((compose: any, idx: number) => {
        md += `#### ${idx + 1}. \`${compose.file}\` - ${compose.name}\n`;
        md += `**Purpose:** ${compose.purpose}\n\n`;

        if (compose.services) {
          md += `**Services:** ${compose.services.join(', ')}\n\n`;
        }

        if (compose.externalServices) {
          md += `**External Services:** ${compose.externalServices.join(', ')}\n\n`;
        }

        if (compose.useWhen) {
          md += `**Use When:**\n`;
          compose.useWhen.forEach((use: string) => {
            md += `- ${use}\n`;
          });
          md += `\n`;
        }

        if (compose.usage && compose.usage.deploy && Array.isArray(compose.usage.deploy)) {
          md += `**Deployment:**\n\`\`\`bash\n`;
          compose.usage.deploy.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }

        if (compose.usage && compose.usage.healthCheck) {
          md += `**Health Check:**\n\`\`\`bash\n${compose.usage.healthCheck}\n\`\`\`\n\n`;
        }

        if (compose.environment) {
          md += `**Environment:**\n`;
          md += `- File: \`${compose.environment.file}\`\n`;
          md += `- Source: ${compose.environment.source}\n\n`;
        }

        md += `---\n\n`;
      });
    }

    // Production
    if (guide.composeFiles.production) {
      md += `### Production\n\n`;
      guide.composeFiles.production.forEach((compose: any, idx: number) => {
        md += `#### ${idx + 1}. \`${compose.file}\` - ${compose.name}\n`;
        md += `**Purpose:** ${compose.purpose}\n\n`;

        if (compose.services) {
          md += `**Services:** ${compose.services.join(', ')}\n\n`;
        }

        if (compose.externalServices) {
          md += `**External Services:** ${compose.externalServices.join(', ')}\n\n`;
        }

        if (compose.useWhen) {
          md += `**Use When:**\n`;
          compose.useWhen.forEach((use: string) => {
            md += `- ${use}\n`;
          });
          md += `\n`;
        }

        if (compose.usage && compose.usage.deploy && Array.isArray(compose.usage.deploy)) {
          md += `**Deployment:**\n\`\`\`bash\n`;
          compose.usage.deploy.forEach((cmd: string) => md += `${cmd}\n`);
          md += `\`\`\`\n\n`;
        }

        if (compose.usage && compose.usage.healthCheck) {
          md += `**Health Check:**\n\`\`\`bash\n${compose.usage.healthCheck}\n\`\`\`\n\n`;
        }

        if (compose.usage && compose.usage.rollback) {
          md += `**Rollback:**\n${compose.usage.rollback}\n\n`;
        }

        if (compose.environment) {
          md += `**Environment:**\n`;
          md += `- File: \`${compose.environment.file}\`\n`;
          md += `- Source: ${compose.environment.source}\n`;
          if (compose.environment.security) {
            md += `- ⚠️  **Security:** ${compose.environment.security}\n`;
          }
          md += `\n`;
        }

        md += `---\n\n`;
      });
    }

    // Testing
    if (guide.composeFiles.testing) {
      md += `### Testing\n\n`;
      guide.composeFiles.testing.forEach((compose: any, idx: number) => {
        md += `#### ${idx + 1}. \`${compose.file}\` - ${compose.name}\n`;
        md += `**Purpose:** ${compose.purpose}\n\n`;

        if (compose.services) {
          md += `**Services:** ${compose.services.join(', ')}\n\n`;
        }

        if (compose.useWhen) {
          md += `**Use When:**\n`;
          compose.useWhen.forEach((use: string) => {
            md += `- ${use}\n`;
          });
          md += `\n`;
        }

        if (compose.usage) {
          md += `**Usage:**\n\`\`\`bash\n`;
          if (compose.usage.start) md += `${compose.usage.start}\n`;
          if (compose.usage.runTests) md += `${compose.usage.runTests}\n`;
          if (compose.usage.shutdown) md += `${compose.usage.shutdown}\n`;
          md += `\`\`\`\n\n`;
        }

        md += `---\n\n`;
      });
    }
  }

  // Common Patterns
  if (guide.commonPatterns) {
    md += `## Common Patterns\n\n`;

    Object.entries(guide.commonPatterns).forEach(([key, pattern]: [string, any]) => {
      const title = key.replace(/([A-Z])/g, ' $1').trim();
      md += `### ${title.charAt(0).toUpperCase() + title.slice(1)}\n\n`;

      if (pattern.description) {
        md += `${pattern.description}\n\n`;
      }

      if (pattern.command) {
        md += `\`\`\`bash\n${pattern.command}\n\`\`\`\n\n`;
      }

      if (pattern.commands && Array.isArray(pattern.commands)) {
        md += `\`\`\`bash\n`;
        pattern.commands.forEach((cmd: string) => md += `${cmd}\n`);
        md += `\`\`\`\n\n`;
      }

      if (pattern.examples && Array.isArray(pattern.examples)) {
        pattern.examples.forEach((example: any) => {
          if (example.name) md += `**${example.name}:**\n`;
          if (example.command) md += `\`\`\`bash\n${example.command}\n\`\`\`\n`;
          if (example.useCase) md += `*${example.useCase}*\n`;
          md += `\n`;
        });
      }
    });

    md += `---\n\n`;
  }

  // Best Practices
  if (guide.bestPractices) {
    md += `## Best Practices\n\n`;

    Object.entries(guide.bestPractices).forEach(([category, practices]: [string, any]) => {
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      if (Array.isArray(practices)) {
        practices.forEach((practice: string) => {
          md += `- ${practice}\n`;
        });
        md += `\n`;
      }
    });

    md += `---\n\n`;
  }

  // Troubleshooting
  if (guide.troubleshooting && guide.troubleshooting.common) {
    md += `## Troubleshooting\n\n`;

    guide.troubleshooting.common.forEach((issue: any) => {
      md += `### ${issue.issue}\n\n`;
      if (issue.solution) md += `**Solution:** ${issue.solution}\n\n`;

      if (issue.commands && Array.isArray(issue.commands)) {
        md += `\`\`\`bash\n`;
        issue.commands.forEach((cmd: string) => md += `${cmd}\n`);
        md += `\`\`\`\n\n`;
      }
    });

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
  md += `**Generated by:** \`scripts/docs/generate-docker-compose-docs.ts\`\n`;
  md += `**Documentation Standard:** Enterprise JSON-First Pattern\n`;

  return md;
}

async function generateDockerComposeDocs(): Promise<void> {
  const jsonPath = path.resolve(__dirname, '../../apps/mcp-server/data/docker-compose-guide.json');
  const mdPath = path.resolve(__dirname, '../../docs/DOCKER_COMPOSE_GUIDE.md');
  const relativePath = 'apps/mcp-server/data/docker-compose-guide.json';

  console.log('📖 Generating Docker Compose guide documentation...');
  console.log(`   Source: ${jsonPath}`);
  console.log(`   Output: ${mdPath}`);

  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const guide: DockerComposeGuide = JSON.parse(jsonContent);

    const markdown = generateMarkdown(guide, relativePath);

    await fs.writeFile(mdPath, markdown, 'utf-8');

    console.log(`✅ Generated ${mdPath}`);
  } catch (error) {
    console.error('❌ Error generating Docker Compose guide:', error);
    process.exit(1);
  }
}

// Run generation
generateDockerComposeDocs();
