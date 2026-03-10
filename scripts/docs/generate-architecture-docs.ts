#!/usr/bin/env tsx
/**
 * Architecture Documentation Generator
 * Generates ARCHITECTURE.md from architecture-specification.json
 * Part of the JSON-first documentation pattern
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ArchitectureSpec {
  documentId: string;
  version: string;
  lastUpdated: string;
  metadata: {
    title: string;
    description?: string;
    maintainer?: string;
    humanViewUrl?: string;
    status?: string;
    mcpScore?: number;
  };
  executiveOverview?: Record<string, any>;
  layers?: Record<string, any>;
  technologyStack?: Record<string, any>;
  security?: Record<string, any>;
  deployment?: Record<string, any>;
  integrations?: Record<string, any>;
  dataArchitecture?: Record<string, any>;
  repositoryStructure?: Record<string, any>;
}

function generateMarkdown(spec: ArchitectureSpec, sourcePath: string): string {
  const date = new Date(spec.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let md = `# ${spec.metadata.title}\n\n`;
  md += `**Version:** ${spec.version}  \n`;
  md += `**Last Updated:** ${date}  \n`;
  if (spec.metadata.status) {
    md += `**Status:** ${spec.metadata.status}`;
    if (spec.metadata.mcpScore) {
      md += ` (MCP Score: ${spec.metadata.mcpScore}/100)`;
    }
    md += `\n`;
  }
  md += `\n---\n\n`;

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
  md += `1. [Executive Overview](#executive-overview)\n`;
  md += `2. [System Architecture](#system-architecture)\n`;
  md += `3. [Technology Stack](#technology-stack)\n`;
  md += `4. [Repository Structure](#repository-structure)\n`;
  md += `5. [Security Architecture](#security-architecture)\n`;
  md += `6. [Data Architecture](#data-architecture)\n`;
  md += `7. [Deployment Architecture](#deployment-architecture)\n`;
  md += `8. [Integration Architecture](#integration-architecture)\n\n`;
  md += `---\n\n`;

  // Executive Overview
  if (spec.executiveOverview) {
    md += `## Executive Overview\n\n`;
    const overview = spec.executiveOverview;

    if (overview.platformType) {
      md += `Ectropy is a **${overview.platformType}** targeting the ${overview.marketSize} global ${overview.industry} industry. `;
      md += `It operates as an open-source foundation model (${overview.license}) designed to bring digital infrastructure to construction through AI orchestration and BIM collaboration.\n\n`;
    }

    if (overview.valueProposition) {
      md += `### Core Value Proposition\n\n`;
      md += `- **Problem:** ${overview.valueProposition.problem}\n`;
      md += `- **Solution:** ${overview.valueProposition.solution}\n`;
      md += `- **Impact:** ${overview.valueProposition.impact}\n\n`;
    }

    if (overview.keyCapabilities && Array.isArray(overview.keyCapabilities)) {
      md += `### Key Capabilities\n\n`;
      overview.keyCapabilities.forEach((capability: string) => {
        md += `- **${capability}**\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // System Architecture
  if (spec.layers) {
    md += `## System Architecture\n\n`;
    md += `### Architectural Layers\n\n`;

    Object.entries(spec.layers).forEach(([key, layer]: [string, any]) => {
      md += `#### ${layer.name}\n\n`;
      if (layer.components && Array.isArray(layer.components)) {
        layer.components.forEach((component: any) => {
          md += `**${component.name}**\n`;
          if (component.technology) md += `- Technology: ${component.technology}\n`;
          if (component.port) md += `- Port: ${component.port}\n`;
          if (component.ports) md += `- Ports: stdio:${component.ports.stdio}, express:${component.ports.express}\n`;
          if (component.status) md += `- Status: ${component.status}\n`;
          if (component.responsibilities && Array.isArray(component.responsibilities)) {
            md += `- Responsibilities:\n`;
            component.responsibilities.forEach((resp: string) => {
              md += `  - ${resp}\n`;
            });
          }
          md += `\n`;
        });
      }
    });

    md += `---\n\n`;
  }

  // Technology Stack
  if (spec.technologyStack) {
    md += `## Technology Stack\n\n`;

    Object.entries(spec.technologyStack).forEach(([category, stack]: [string, any]) => {
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      Object.entries(stack).forEach(([key, value]: [string, any]) => {
        const label = key.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** ${value}\n`;
      });
      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Repository Structure
  if (spec.repositoryStructure) {
    md += `## Repository Structure\n\n`;
    const repo = spec.repositoryStructure;
    md += `**Type:** ${repo.type}\n\n`;

    if (repo.apps) {
      md += `### Applications\n\n`;
      repo.apps.forEach((app: string) => {
        md += `- ${app}\n`;
      });
      md += `\n`;
    }

    if (repo.libs) {
      md += `### Libraries\n\n`;
      repo.libs.forEach((lib: string) => {
        md += `- ${lib}\n`;
      });
      md += `\n`;
    }

    if (repo.tools) {
      md += `### Tools\n\n`;
      repo.tools.forEach((tool: string) => {
        md += `- ${tool}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Security Architecture
  if (spec.security) {
    md += `## Security Architecture\n\n`;

    if (spec.security.authentication) {
      md += `### Authentication\n\n`;
      const auth = spec.security.authentication;
      if (auth.methods) md += `- **Methods:** ${auth.methods.join(', ')}\n`;
      if (auth.providers) md += `- **Providers:** ${auth.providers.join(', ')}\n`;
      if (auth.sessionManagement) md += `- **Session Management:** ${auth.sessionManagement}\n`;
      md += `\n`;
    }

    if (spec.security.authorization) {
      md += `### Authorization\n\n`;
      const authz = spec.security.authorization;
      if (authz.method) md += `- **Method:** ${authz.method}\n`;
      if (authz.tier) md += `- **Tier:** ${authz.tier}\n`;
      if (authz.multiTenancy) md += `- **Multi-Tenancy:** ${authz.multiTenancy}\n`;
      md += `\n`;
    }

    if (spec.security.compliance) {
      md += `### Compliance\n\n`;
      const compliance = spec.security.compliance;
      if (compliance.standards) md += `- **Standards:** ${compliance.standards.join(', ')}\n`;
      if (compliance.headers) md += `- **Security Headers:** ${compliance.headers.join(', ')}\n`;
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Data Architecture
  if (spec.dataArchitecture) {
    md += `## Data Architecture\n\n`;

    Object.entries(spec.dataArchitecture).forEach(([category, config]: [string, any]) => {
      const title = category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1').trim();
      md += `### ${title}\n\n`;
      Object.entries(config).forEach(([key, value]: [string, any]) => {
        const label = key.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** ${value}\n`;
      });
      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Deployment Architecture
  if (spec.deployment) {
    md += `## Deployment Architecture\n\n`;

    if (spec.deployment.environments) {
      md += `### Environments\n\n`;
      spec.deployment.environments.forEach((env: string) => {
        md += `- ${env}\n`;
      });
      md += `\n`;
    }

    if (spec.deployment.ports) {
      md += `### Port Allocation\n\n`;
      Object.entries(spec.deployment.ports).forEach(([service, port]: [string, any]) => {
        const label = service.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** ${port}\n`;
      });
      md += `\n`;
    }

    if (spec.deployment.healthChecks) {
      md += `### Health Checks\n\n`;
      Object.entries(spec.deployment.healthChecks).forEach(([service, endpoint]: [string, any]) => {
        const label = service.replace(/([A-Z])/g, ' $1').trim();
        md += `- **${label.charAt(0).toUpperCase() + label.slice(1)}:** ${endpoint}\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // Integration Architecture
  if (spec.integrations) {
    md += `## Integration Architecture\n\n`;

    Object.entries(spec.integrations).forEach(([name, integration]: [string, any]) => {
      md += `### ${name.charAt(0).toUpperCase() + name.slice(1)}\n\n`;
      if (integration.purpose) md += `**Purpose:** ${integration.purpose}\n\n`;
      if (integration.features && Array.isArray(integration.features)) {
        md += `**Features:**\n`;
        integration.features.forEach((feature: string) => {
          md += `- ${feature}\n`;
        });
      }
      if (integration.models && Array.isArray(integration.models)) {
        md += `**Models:** ${integration.models.join(', ')}\n`;
      }
      if (integration.status) md += `\n**Status:** ${integration.status}\n`;
      md += `\n`;
    });

    md += `---\n\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `**Maintained by:** ${spec.metadata.maintainer}\n\n`;
  md += `**Last Generated:** ${new Date().toISOString()}\n`;

  return md;
}

async function generateArchitectureDocs(): Promise<void> {
  const jsonPath = path.resolve(__dirname, '../../apps/mcp-server/data/architecture-specification.json');
  const mdPath = path.resolve(__dirname, '../../docs/ARCHITECTURE.md');
  const relativePath = 'apps/mcp-server/data/architecture-specification.json';

  console.log('📖 Generating architecture documentation...');
  console.log(`   Source: ${jsonPath}`);
  console.log(`   Output: ${mdPath}`);

  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const spec: ArchitectureSpec = JSON.parse(jsonContent);

    const markdown = generateMarkdown(spec, relativePath);

    await fs.writeFile(mdPath, markdown, 'utf-8');

    console.log(`✅ Generated ${mdPath}`);
  } catch (error) {
    console.error('❌ Error generating architecture documentation:', error);
    process.exit(1);
  }
}

// Run generation
generateArchitectureDocs();
