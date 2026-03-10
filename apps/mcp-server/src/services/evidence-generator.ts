/**
 * Evidence Generator Service
 * Automatically generates evidence sessions from deliverable submissions
 * Integrates with existing evidence automation scripts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  DeliverableSubmission,
  EvidenceGenerationResult,
  EvidenceSessionMetadata,
} from '../types/deliverable.js';

const execAsync = promisify(exec);

export class EvidenceGeneratorService {
  private evidenceBasePath: string;
  private scriptsPath: string;

  constructor() {
    // Canonical evidence location: apps/mcp-server/data/evidence
    this.evidenceBasePath = path.resolve(
      process.cwd(),
      'apps/mcp-server/data/evidence'
    );
    this.scriptsPath = path.resolve(process.cwd(), '../../scripts/evidence');
  }

  /**
   * Generate complete evidence session from deliverable submission
   */
  async generateEvidenceSession(
    submission: DeliverableSubmission
  ): Promise<EvidenceGenerationResult> {
    try {
      const sessionId = this.generateSessionId(submission);
      const sessionPath = this.getSessionPath(sessionId);

      console.log(`[Evidence Generator] Generating session: ${sessionId}`);

      // 1. Create session directory structure
      await this.createSessionDirectory(sessionPath);

      // 2. Generate session.json metadata
      const metadata = this.buildSessionMetadata(submission, sessionId);
      await this.writeSessionMetadata(sessionPath, metadata);

      // 3. Generate README.md (human-readable)
      const readme = this.buildReadme(submission, metadata);
      await this.writeReadme(sessionPath, readme);

      // 4. Copy artifacts to session
      const copiedArtifacts = await this.copyArtifacts(
        submission.evidence.artifacts,
        sessionPath
      );

      // 5. Generate evidence.json (machine-readable) using existing script
      const evidenceJsonPath = await this.generateEvidenceJson(sessionPath);

      // 6. Sync to current-truth.json using existing script
      const currentTruthUpdated =
        await this.syncToCurrentTruth(evidenceJsonPath);

      // 7. Update decision-log.json if decisions made
      const decisionLogUpdated =
        submission.decisionsApproved && submission.decisionsApproved.length > 0
          ? await this.updateDecisionLog(submission.decisionsApproved)
          : false;

      // 8. Update roadmap-platform.json deliverable status
      const roadmapUpdated = await this.updateRoadmapStatus(
        submission.deliverableId,
        'completed',
        sessionId
      );

      return {
        success: true,
        sessionId,
        sessionPath,
        filesGenerated: {
          sessionJson: path.join(sessionPath, 'session.json'),
          readme: path.join(sessionPath, 'README.md'),
          evidenceJson: evidenceJsonPath,
          artifacts: copiedArtifacts,
        },
        mcpUpdates: {
          currentTruthUpdated,
          decisionLogUpdated,
          roadmapUpdated,
        },
      };
    } catch (error) {
      console.error('[Evidence Generator] Error:', error);
      return {
        success: false,
        sessionId: '',
        sessionPath: '',
        filesGenerated: {
          sessionJson: '',
          readme: '',
          evidenceJson: '',
          artifacts: [],
        },
        mcpUpdates: {
          currentTruthUpdated: false,
          decisionLogUpdated: false,
          roadmapUpdated: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate session ID from deliverable submission
   */
  private generateSessionId(submission: DeliverableSubmission): string {
    const date = new Date().toISOString().split('T')[0];
    const sanitized = submission.deliverableId
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    return `${sanitized}-${date}`;
  }

  /**
   * Get session path (evidence/YYYY-MM/session-id/)
   */
  private getSessionPath(sessionId: string): string {
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    return path.join(this.evidenceBasePath, yearMonth, sessionId);
  }

  /**
   * Create session directory with artifacts subdirectory
   */
  private async createSessionDirectory(sessionPath: string): Promise<void> {
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'artifacts'), { recursive: true });
  }

  /**
   * Build session metadata
   */
  private buildSessionMetadata(
    submission: DeliverableSubmission,
    sessionId: string
  ): EvidenceSessionMetadata {
    // Extract phase from deliverable ID (e.g., "p5a-monitoring-foundation" → "phase-5a")
    const phaseMatch = submission.deliverableId.match(/^p(\d+[a-z]?)/);
    const phase = phaseMatch ? `phase-${phaseMatch[1]}` : 'unknown';

    return {
      sessionId,
      deliverableId: submission.deliverableId,
      developer: submission.developer,
      timestamp: new Date().toISOString(),
      phase,
      category: 'deliverable',
      nodeType: 'deliverable',
      status: 'completed',
      tags: ['automated', 'mcp-generated', phase, submission.deliverableId],
    };
  }

  /**
   * Write session.json metadata
   */
  private async writeSessionMetadata(
    sessionPath: string,
    metadata: EvidenceSessionMetadata
  ): Promise<void> {
    const sessionJsonPath = path.join(sessionPath, 'session.json');
    await fs.writeFile(
      sessionJsonPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  /**
   * Build README.md content
   */
  private buildReadme(
    submission: DeliverableSubmission,
    metadata: EvidenceSessionMetadata
  ): string {
    const { deliverableId, developer } = submission;
    const { context, approach, outcome, keyFindings, decisions } =
      submission.evidence;
    const {
      filesChanged,
      testsPassed,
      description,
      estimatedEffort,
      commitSha,
    } = submission.workCompleted;

    return `# ${deliverableId}

**Developer:** ${developer}
**Date:** ${new Date().toISOString().split('T')[0]}
**Phase:** ${metadata.phase}
**Status:** ✅ Completed
**Estimated Effort:** ${estimatedEffort}
${commitSha ? `**Commit:** ${commitSha}` : ''}

---

## Context

${context}

## Approach

${approach}

## Outcome

${outcome}

### Work Completed

${description}

**Files Changed:** ${filesChanged.length} files
\`\`\`
${filesChanged.join('\n')}
\`\`\`

**Tests:** ${testsPassed ? '✅ All tests passed' : '❌ Some tests failed'}

${keyFindings && keyFindings.length > 0 ? `\n### Key Findings\n\n${keyFindings.map((f) => `- ${f}`).join('\n')}` : ''}

${decisions && decisions.length > 0 ? `\n### Decisions Made\n\n${decisions.map((d) => `- ${d}`).join('\n')}` : ''}

---

## Artifacts

See \`artifacts/\` directory for:
${submission.evidence.artifacts.map((a) => `- ${path.basename(a)}`).join('\n')}

---

**Auto-generated by MCP Evidence Generator** 🤖
**Session ID:** ${metadata.sessionId}
**Timestamp:** ${metadata.timestamp}
`;
  }

  /**
   * Write README.md
   */
  private async writeReadme(
    sessionPath: string,
    readme: string
  ): Promise<void> {
    const readmePath = path.join(sessionPath, 'README.md');
    await fs.writeFile(readmePath, readme, 'utf-8');
  }

  /**
   * Copy artifacts to session directory
   */
  private async copyArtifacts(
    artifacts: string[],
    sessionPath: string
  ): Promise<string[]> {
    const artifactsDir = path.join(sessionPath, 'artifacts');
    const copiedFiles: string[] = [];

    for (const artifact of artifacts) {
      try {
        const sourcePath = path.resolve(artifact);
        const destPath = path.join(artifactsDir, path.basename(artifact));

        await fs.copyFile(sourcePath, destPath);
        copiedFiles.push(destPath);
      } catch (error) {
        console.warn(
          `[Evidence Generator] Failed to copy artifact: ${artifact}`,
          error
        );
      }
    }

    return copiedFiles;
  }

  /**
   * Generate evidence.json using existing evidence-to-json.js script
   */
  private async generateEvidenceJson(sessionPath: string): Promise<string> {
    const evidenceJsonPath = path.join(sessionPath, 'evidence.json');
    const scriptPath = path.join(this.scriptsPath, 'evidence-to-json.js');

    try {
      // Run existing evidence-to-json.js script
      const { stdout, stderr } = await execAsync(
        `node "${scriptPath}" "${sessionPath}"`,
        { cwd: this.scriptsPath }
      );

      if (stderr) {
        console.warn('[Evidence Generator] evidence-to-json stderr:', stderr);
      }

      console.log('[Evidence Generator] evidence.json generated:', stdout);
      return evidenceJsonPath;
    } catch (error) {
      console.error(
        '[Evidence Generator] Failed to generate evidence.json:',
        error
      );
      throw error;
    }
  }

  /**
   * Sync to current-truth.json using existing sync-to-mcp.js script
   */
  private async syncToCurrentTruth(evidenceJsonPath: string): Promise<boolean> {
    const scriptPath = path.join(this.scriptsPath, 'sync-to-mcp.js');

    try {
      const { stdout, stderr } = await execAsync(
        `node "${scriptPath}" "${evidenceJsonPath}"`,
        { cwd: this.scriptsPath }
      );

      if (stderr) {
        console.warn('[Evidence Generator] sync-to-mcp stderr:', stderr);
      }

      console.log('[Evidence Generator] Synced to current-truth.json:', stdout);
      return true;
    } catch (error) {
      console.error(
        '[Evidence Generator] Failed to sync to current-truth.json:',
        error
      );
      return false;
    }
  }

  /**
   * Update decision-log.json with new decisions
   */
  private async updateDecisionLog(
    decisions: Array<{ decisionId: string; option: string; rationale: string }>
  ): Promise<boolean> {
    try {
      const repoRoot = path.resolve(process.cwd(), '../..');
      const decisionLogPath =
        process.env.DATA_PATH
          ? path.resolve(process.env.DATA_PATH, '../.roadmap/decision-log.json')
          : path.resolve(repoRoot, '.roadmap/decision-log.json');

      const decisionLog = JSON.parse(
        await fs.readFile(decisionLogPath, 'utf-8')
      );

      // Update decisions array
      for (const decision of decisions) {
        const existingIndex = decisionLog.decisions.findIndex(
          (d: any) => d.decisionId === decision.decisionId
        );

        if (existingIndex >= 0) {
          // Update existing decision status
          decisionLog.decisions[existingIndex].status = 'approved';
          decisionLog.decisions[existingIndex].decision = decision.option;
          decisionLog.decisions[existingIndex].rationale = decision.rationale;
          decisionLog.decisions[existingIndex].implementedDate = new Date()
            .toISOString()
            .split('T')[0];
        }
      }

      decisionLog.lastUpdated = new Date().toISOString();

      await fs.writeFile(
        decisionLogPath,
        JSON.stringify(decisionLog, null, 2),
        'utf-8'
      );

      console.log('[Evidence Generator] Updated decision-log.json');
      return true;
    } catch (error) {
      console.error(
        '[Evidence Generator] Failed to update decision-log.json:',
        error
      );
      return false;
    }
  }

  /**
   * Update roadmap-platform.json deliverable status
   */
  private async updateRoadmapStatus(
    deliverableId: string,
    status: string,
    evidenceSessionId: string
  ): Promise<boolean> {
    try {
      const roadmapPath = path.resolve(
        process.env.DATA_PATH || '/app/data',
        'roadmap-platform.json'
      );

      const roadmap = JSON.parse(await fs.readFile(roadmapPath, 'utf-8'));

      // Find and update deliverable across all phases
      let updated = false;
      for (const phase of roadmap.phases) {
        const deliverable = phase.deliverables?.find(
          (d: any) => d.id === deliverableId
        );

        if (deliverable) {
          deliverable.status = status;
          deliverable.evidence = deliverable.evidence || [];
          if (!deliverable.evidence.includes(evidenceSessionId)) {
            deliverable.evidence.push(evidenceSessionId);
          }
          deliverable.completedDate = new Date().toISOString().split('T')[0];
          updated = true;
          break;
        }
      }

      if (updated) {
        roadmap.lastUpdated = new Date().toISOString();
        await fs.writeFile(
          roadmapPath,
          JSON.stringify(roadmap, null, 2),
          'utf-8'
        );
        console.log('[Evidence Generator] Updated roadmap-platform.json');
      }

      return updated;
    } catch (error) {
      console.error('[Evidence Generator] Failed to update roadmap:', error);
      return false;
    }
  }
}
