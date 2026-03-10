#!/usr/bin/env tsx
/**
 * Runbook to JSON Converter
 *
 * Converts markdown runbooks and bash scripts to enterprise JSON standard
 * for MCP integration and automated execution
 *
 * Usage:
 *   pnpm tsx scripts/runbooks/convert-runbook-to-json.ts \
 *     --input docs/DEPLOYMENT_RUNBOOK_v2.1.1.md \
 *     --type deployment \
 *     --environment staging \
 *     --version 2.1.1 \
 *     --output apps/mcp-server/data/runbooks/deployment/staging-v2.1.1.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';

// ============================================================================
// Types
// ============================================================================

interface RunbookMetadata {
  catalogId: string;
  name: string;
  type: 'deployment' | 'migration' | 'operational' | 'emergency' | 'validation';
  purpose: string;
  maintainer: string;
  author?: string;
  created: string;
  lastUpdated: string;
  estimatedDuration?: string;
  complexity: 'low' | 'medium' | 'high' | 'critical';
  priority: 'low' | 'medium' | 'high' | 'critical';
  relatedDocuments: string[];
  sourceFile: string;
  conversionDate: string;
  schemaVersion: string;
}

interface RunbookPhase {
  phase: number;
  name: string;
  description?: string;
  estimatedDuration?: string;
  parallel?: boolean;
  criticalPath?: boolean;
  steps: RunbookStep[];
}

interface RunbookStep {
  step: string;
  name: string;
  description?: string;
  command?: string;
  commands?: string[];
  purpose?: string;
  required: boolean;
  automatable?: boolean;
  timeout?: string;
  retryable?: boolean;
  maxRetries?: number;
  expectedOutput?: string;
  validation?: {
    type: string;
    criteria: string;
  };
  onFailure?: {
    action: string;
    message?: string;
  };
  relatedFiles?: string[];
}

interface Runbook {
  version: string;
  environment: string;
  runbookType: string;
  deploymentDate?: string;
  deploymentType?: string;
  metadata: RunbookMetadata;
  executiveSummary: any;
  preFlightChecks?: any[];
  phases: RunbookPhase[];
  validation?: any;
  rollback?: any;
  monitoring?: any;
  successCriteria?: any[];
  mcpIntegration?: any;
}

// ============================================================================
// Markdown Parser
// ============================================================================

class MarkdownRunbookParser {
  private content: string;
  private lines: string[];

  constructor(filePath: string) {
    this.content = fs.readFileSync(filePath, 'utf-8');
    this.lines = this.content.split('\n');
  }

  /**
   * Extract runbook title from first h1
   */
  getTitle(): string {
    const titleLine = this.lines.find(line => line.startsWith('# '));
    return titleLine ? titleLine.replace('# ', '').trim() : 'Untitled Runbook';
  }

  /**
   * Extract version from title or metadata
   */
  getVersion(): string {
    const title = this.getTitle();
    const versionMatch = title.match(/v?(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : '1.0.0';
  }

  /**
   * Extract deployment phases from markdown
   */
  getPhases(): RunbookPhase[] {
    const phases: RunbookPhase[] = [];
    let currentPhase: RunbookPhase | null = null;
    let currentStep: RunbookStep | null = null;
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];

      // Track code blocks
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        if (!inCodeBlock && currentStep && codeBlockContent.length > 0) {
          // Code block ended, assign to current step
          const commands = codeBlockContent
            .filter(cmd => cmd.trim() && !cmd.startsWith('#'))
            .map(cmd => cmd.trim());

          if (commands.length === 1) {
            currentStep.command = commands[0];
          } else if (commands.length > 1) {
            currentStep.commands = commands;
          }
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Detect phase headers: "### 1. Phase Name" or "## Deployment Steps"
      const phaseMatch = line.match(/^###?\s+(\d+)\.\s+(.+)/);
      if (phaseMatch) {
        if (currentPhase && currentStep) {
          currentPhase.steps.push(currentStep);
          currentStep = null;
        }
        if (currentPhase) {
          phases.push(currentPhase);
        }

        const [, phaseNum, phaseName] = phaseMatch;
        currentPhase = {
          phase: parseInt(phaseNum),
          name: phaseName.trim(),
          steps: []
        };

        // Extract duration from next few lines
        const durationLine = this.lines.slice(i + 1, i + 5).find(l =>
          l.match(/\((\d+)\s+minutes?\)/i) || l.match(/Duration:\s*(\d+)\s+minutes?/i)
        );
        if (durationLine) {
          const durationMatch = durationLine.match(/(\d+)\s+minutes?/i);
          if (durationMatch) {
            currentPhase.estimatedDuration = `${durationMatch[1]} minutes`;
          }
        }
        continue;
      }

      // Detect step headers: "#### 1.1 Step Name" or "**1.1**"
      const stepMatch = line.match(/^####\s+(\d+\.\d+)\s+(.+)/) ||
                       line.match(/^\*\*(\d+\.\d+)\*\*\s+(.+)/);
      if (stepMatch && currentPhase) {
        if (currentStep) {
          currentPhase.steps.push(currentStep);
        }

        const [, stepNum, stepName] = stepMatch;
        currentStep = {
          step: stepNum,
          name: stepName.trim(),
          required: true,
          automatable: true
        };
        continue;
      }

      // Extract step purpose/description
      if (currentStep && line.startsWith('- **Purpose:**')) {
        currentStep.purpose = line.replace('- **Purpose:**', '').trim();
      }
    }

    // Add last step and phase
    if (currentPhase && currentStep) {
      currentPhase.steps.push(currentStep);
    }
    if (currentPhase) {
      phases.push(currentPhase);
    }

    return phases;
  }

  /**
   * Extract executive summary section
   */
  getExecutiveSummary(): any {
    const summarySection = this.extractSection('## Executive Summary');
    if (!summarySection) return {};

    return {
      description: this.extractFirstParagraph(summarySection),
      status: 'READY',
      confidenceLevel: 'HIGH',
      riskAssessment: 'LOW'
    };
  }

  /**
   * Extract a section by header
   */
  private extractSection(header: string): string {
    const startIndex = this.lines.findIndex(line => line.startsWith(header));
    if (startIndex === -1) return '';

    const endIndex = this.lines.findIndex((line, idx) =>
      idx > startIndex && line.startsWith('##')
    );

    const sectionLines = endIndex === -1
      ? this.lines.slice(startIndex + 1)
      : this.lines.slice(startIndex + 1, endIndex);

    return sectionLines.join('\n').trim();
  }

  /**
   * Extract first paragraph from text
   */
  private extractFirstParagraph(text: string): string {
    const paragraphs = text.split('\n\n');
    return paragraphs[0]?.trim() || '';
  }
}

// ============================================================================
// Bash Script Parser
// ============================================================================

class BashScriptParser {
  private content: string;
  private lines: string[];

  constructor(filePath: string) {
    this.content = fs.readFileSync(filePath, 'utf-8');
    this.lines = this.content.split('\n');
  }

  /**
   * Extract script title from comments
   */
  getTitle(): string {
    const titleLine = this.lines.find(line =>
      line.match(/^#\s*(.+?)(?:\s*-|\s*:|\s*$)/)
    );
    if (titleLine) {
      const match = titleLine.match(/^#\s*(.+?)(?:\s*-|\s*:|\s*$)/);
      return match ? match[1].trim() : 'Untitled Script';
    }
    return 'Untitled Script';
  }

  /**
   * Extract functions as phases
   */
  getPhases(): RunbookPhase[] {
    const phases: RunbookPhase[] = [];
    let currentFunction: string | null = null;
    let functionBody: string[] = [];
    let phaseNum = 1;

    for (const line of this.lines) {
      // Detect function declaration: function_name() {
      const functionMatch = line.match(/^(\w+)\s*\(\)\s*\{/);
      if (functionMatch) {
        if (currentFunction && functionBody.length > 0) {
          phases.push(this.createPhaseFromFunction(phaseNum++, currentFunction, functionBody));
          functionBody = [];
        }
        currentFunction = functionMatch[1];
        continue;
      }

      // Track function body
      if (currentFunction && line.trim() === '}') {
        if (functionBody.length > 0) {
          phases.push(this.createPhaseFromFunction(phaseNum++, currentFunction, functionBody));
          functionBody = [];
        }
        currentFunction = null;
        continue;
      }

      if (currentFunction) {
        functionBody.push(line);
      }
    }

    return phases;
  }

  /**
   * Create phase from function
   */
  private createPhaseFromFunction(phaseNum: number, funcName: string, body: string[]): RunbookPhase {
    const commands = body
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    const steps: RunbookStep[] = commands.map((cmd, idx) => ({
      step: `${phaseNum}.${idx + 1}`,
      name: this.generateStepName(cmd),
      command: cmd,
      required: true,
      automatable: true
    }));

    return {
      phase: phaseNum,
      name: this.formatFunctionName(funcName),
      steps
    };
  }

  /**
   * Format function name to readable phase name
   */
  private formatFunctionName(funcName: string): string {
    return funcName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate step name from command
   */
  private generateStepName(command: string): string {
    const parts = command.split(/\s+/);
    const mainCommand = parts[0];

    if (mainCommand === 'docker') {
      const action = parts[1];
      return `Docker ${action}`;
    }

    if (mainCommand === 'npm' || mainCommand === 'pnpm') {
      return `${mainCommand.toUpperCase()} ${parts.slice(1, 3).join(' ')}`;
    }

    return command.substring(0, 50);
  }
}

// ============================================================================
// Runbook Generator
// ============================================================================

class RunbookGenerator {
  generate(
    parser: MarkdownRunbookParser | BashScriptParser,
    options: {
      type: string;
      environment: string;
      version: string;
      sourceFile: string;
    }
  ): Runbook {
    const title = parser.getTitle();
    const version = options.version || parser.getVersion();
    const catalogId = this.generateCatalogId(title, version);

    const runbook: Runbook = {
      version,
      environment: options.environment,
      runbookType: options.type,
      metadata: {
        catalogId,
        name: title,
        type: options.type as any,
        purpose: `Automated runbook for ${title}`,
        maintainer: 'infrastructure-team',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        complexity: 'medium',
        priority: 'medium',
        relatedDocuments: [],
        sourceFile: options.sourceFile,
        conversionDate: new Date().toISOString(),
        schemaVersion: '1.0.0'
      },
      executiveSummary: parser instanceof MarkdownRunbookParser
        ? parser.getExecutiveSummary()
        : {
            description: `Automated execution of ${title}`,
            status: 'READY',
            confidenceLevel: 'MEDIUM',
            riskAssessment: 'MEDIUM'
          },
      phases: parser.getPhases(),
      mcpIntegration: {
        queryableFields: ['phases', 'validation', 'rollback'],
        supportedQueries: [
          {
            query: 'getDeploymentSteps',
            returns: 'Array of deployment phases',
            purpose: 'MCP retrieves step-by-step instructions'
          }
        ],
        decisionSupport: [
          'Deployment readiness assessment',
          'Step execution validation'
        ]
      }
    };

    return runbook;
  }

  /**
   * Generate catalog ID from title and version
   */
  private generateCatalogId(title: string, version: string): string {
    const baseId = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return `${baseId}-v${version.replace(/\./g, '-')}`;
  }
}

// ============================================================================
// Main CLI
// ============================================================================

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      type: { type: 'string', short: 't' },
      environment: { type: 'string', short: 'e' },
      version: { type: 'string', short: 'v' },
      output: { type: 'string', short: 'o' }
    }
  });

  if (!values.input || !values.type || !values.environment) {
    console.error('Usage: convert-runbook-to-json.ts --input <file> --type <type> --environment <env> [--version <version>] [--output <file>]');
    process.exit(1);
  }

  const inputPath = values.input as string;
  const outputPath = values.output as string | undefined;

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`\n🔄 Converting runbook to JSON...`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Type: ${values.type}`);
  console.log(`   Environment: ${values.environment}\n`);

  // Determine parser based on file extension
  const ext = path.extname(inputPath);
  let parser: MarkdownRunbookParser | BashScriptParser;

  if (ext === '.md') {
    parser = new MarkdownRunbookParser(inputPath);
  } else if (ext === '.sh' || ext === '.ps1') {
    parser = new BashScriptParser(inputPath);
  } else {
    console.error(`Error: Unsupported file type: ${ext}`);
    process.exit(1);
  }

  // Generate runbook JSON
  const generator = new RunbookGenerator();
  const runbook = generator.generate(parser, {
    type: values.type as string,
    environment: values.environment as string,
    version: values.version as string || parser.getVersion(),
    sourceFile: inputPath
  });

  // Write output
  const json = JSON.stringify(runbook, null, 2);

  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, json, 'utf-8');
    console.log(`✅ Runbook converted successfully!`);
    console.log(`   Output: ${outputPath}`);
  } else {
    console.log(json);
  }

  console.log(`\n📊 Conversion Summary:`);
  console.log(`   Phases: ${runbook.phases.length}`);
  console.log(`   Steps: ${runbook.phases.reduce((sum, p) => sum + p.steps.length, 0)}`);
  console.log(`   Catalog ID: ${runbook.metadata.catalogId}\n`);
}

main().catch(console.error);
