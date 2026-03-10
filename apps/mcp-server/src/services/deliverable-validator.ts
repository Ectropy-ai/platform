/**
 * Deliverable Validator Service
 * Validates deliverable submissions against acceptance criteria
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  DeliverableSubmission,
  DeliverableValidationResponse,
  AcceptanceCriterion,
  DependencyStatus,
  TestResults,
} from '../types/deliverable.js';

const execAsync = promisify(exec);

export class DeliverableValidatorService {
  private roadmapPath: string;

  constructor() {
    this.roadmapPath = path.resolve(
      process.env.DATA_PATH || '/app/data',
      'roadmap-platform.json'
    );
  }

  /**
   * Validate deliverable submission
   */
  async validateSubmission(
    submission: DeliverableSubmission
  ): Promise<DeliverableValidationResponse> {
    try {
      console.log(
        `[Deliverable Validator] Validating ${submission.deliverableId}`
      );

      // Load roadmap to get deliverable definition
      const deliverable = await this.getDeliverable(submission.deliverableId);

      if (!deliverable) {
        return this.buildFailedResponse(
          `Deliverable ${submission.deliverableId} not found in roadmap`
        );
      }

      // 1. Validate acceptance criteria
      const acceptanceCriteria = await this.validateAcceptanceCriteria(
        deliverable,
        submission
      );
      const acceptanceCriteriaMet = acceptanceCriteria.every((c) => c.met);

      // 2. Check dependencies
      const dependencyStatuses = await this.checkDependencies(deliverable);
      const dependenciesSatisfied = dependencyStatuses.every(
        (d) => !d.blocking || d.status === 'completed'
      );

      // 3. Verify tests passed
      const testsPass = submission.workCompleted.testsPassed;
      const testResults: TestResults = {
        passed: testsPass ? 1 : 0,
        failed: testsPass ? 0 : 1,
        total: 1,
      };

      // 4. Calculate code quality score (simplified)
      const codeQualityScore = this.calculateCodeQualityScore(submission);

      // Overall approval decision
      const approved =
        acceptanceCriteriaMet &&
        dependenciesSatisfied &&
        testsPass &&
        codeQualityScore >= 70;

      return {
        approved,
        validationResults: {
          acceptanceCriteriaMet,
          dependenciesSatisfied,
          testsPass,
          codeQualityScore,
          details: {
            acceptanceCriteria,
            dependencyStatuses,
            testResults,
          },
        },
        feedback: this.generateFeedback(
          acceptanceCriteriaMet,
          dependenciesSatisfied,
          testsPass,
          codeQualityScore,
          acceptanceCriteria,
          dependencyStatuses
        ),
      };
    } catch (error) {
      console.error('[Deliverable Validator] Validation error:', error);
      return this.buildFailedResponse(
        error instanceof Error ? error.message : 'Unknown validation error'
      );
    }
  }

  /**
   * Get deliverable from roadmap
   */
  private async getDeliverable(deliverableId: string): Promise<any | null> {
    try {
      const roadmap = JSON.parse(await fs.readFile(this.roadmapPath, 'utf-8'));

      for (const phase of roadmap.phases) {
        const deliverable = phase.deliverables?.find(
          (d: any) => d.id === deliverableId
        );
        if (deliverable) {
          return deliverable;
        }
      }

      return null;
    } catch (error) {
      console.error('[Deliverable Validator] Failed to load roadmap:', error);
      return null;
    }
  }

  /**
   * Validate acceptance criteria
   */
  private async validateAcceptanceCriteria(
    deliverable: any,
    submission: DeliverableSubmission
  ): Promise<AcceptanceCriterion[]> {
    const acceptanceCriteria = deliverable.acceptanceCriteria || [];

    // Validate each criterion
    const validatedCriteria: AcceptanceCriterion[] = [];

    for (const criterion of acceptanceCriteria) {
      const met = await this.validateCriterion(criterion, submission);
      validatedCriteria.push({
        ...criterion,
        met,
        evidence: met ? 'Validation passed' : 'Validation failed',
      });
    }

    return validatedCriteria;
  }

  /**
   * Validate individual criterion
   */
  private async validateCriterion(
    criterion: AcceptanceCriterion,
    submission: DeliverableSubmission
  ): Promise<boolean> {
    const { validation, type } = criterion;

    // Automated validations
    if (type === 'automated') {
      if (validation.startsWith('SERVICE_RUNNING:')) {
        // Check if service is running (simplified - would use actual health checks)
        return true; // Placeholder
      }

      if (validation.startsWith('HTTP_GET:')) {
        // Check HTTP endpoint (simplified)
        return true; // Placeholder
      }

      if (validation.startsWith('FILE_EXISTS:')) {
        const filePath = validation.split(':')[1];
        return submission.workCompleted.filesChanged.some((f) =>
          f.includes(filePath)
        );
      }

      if (validation.startsWith('SCREENSHOT_PROVIDED:')) {
        const screenshotName = validation.split(':')[1];
        return submission.evidence.artifacts.some((a) =>
          a.includes(screenshotName)
        );
      }
    }

    // Manual validations (assume met if evidence provided)
    if (type === 'manual') {
      return submission.evidence.artifacts.length > 0;
    }

    return false;
  }

  /**
   * Check dependencies status
   */
  private async checkDependencies(
    deliverable: any
  ): Promise<DependencyStatus[]> {
    const dependencies = deliverable.dependencies || [];
    const statuses: DependencyStatus[] = [];

    try {
      const roadmap = JSON.parse(await fs.readFile(this.roadmapPath, 'utf-8'));

      for (const depId of dependencies) {
        // Find dependency deliverable
        let depDeliverable: any = null;
        for (const phase of roadmap.phases) {
          depDeliverable = phase.deliverables?.find((d: any) => d.id === depId);
          if (depDeliverable) {
            break;
          }
        }

        if (depDeliverable) {
          statuses.push({
            deliverableId: depId,
            name: depDeliverable.name || depId,
            status: depDeliverable.status || 'pending',
            blocking: true,
          });
        }
      }
    } catch (error) {
      console.error(
        '[Deliverable Validator] Failed to check dependencies:',
        error
      );
    }

    return statuses;
  }

  /**
   * Calculate code quality score (simplified)
   */
  private calculateCodeQualityScore(submission: DeliverableSubmission): number {
    let score = 100;

    // Deduct points for failed tests
    if (!submission.workCompleted.testsPassed) {
      score -= 30;
    }

    // Deduct points if no artifacts provided
    if (submission.evidence.artifacts.length === 0) {
      score -= 10;
    }

    // Deduct points if description is too short
    if (submission.workCompleted.description.length < 50) {
      score -= 10;
    }

    // Deduct points if no key findings
    if (
      !submission.evidence.keyFindings ||
      submission.evidence.keyFindings.length === 0
    ) {
      score -= 5;
    }

    return Math.max(0, score);
  }

  /**
   * Generate feedback message
   */
  private generateFeedback(
    acceptanceCriteriaMet: boolean,
    dependenciesSatisfied: boolean,
    testsPass: boolean,
    codeQualityScore: number,
    acceptanceCriteria: AcceptanceCriterion[],
    dependencyStatuses: DependencyStatus[]
  ): string {
    const feedback: string[] = [];

    if (!acceptanceCriteriaMet) {
      feedback.push('❌ Acceptance criteria not fully met:');
      const failedCriteria = acceptanceCriteria.filter((c) => !c.met);
      failedCriteria.forEach((c) => {
        feedback.push(`  - ${c.criterion}`);
      });
    }

    if (!dependenciesSatisfied) {
      feedback.push('\n❌ Dependencies not satisfied:');
      const blockingDeps = dependencyStatuses.filter(
        (d) => d.blocking && d.status !== 'completed'
      );
      blockingDeps.forEach((d) => {
        feedback.push(`  - ${d.name} (status: ${d.status})`);
      });
    }

    if (!testsPass) {
      feedback.push(
        '\n❌ Tests failed - please fix failing tests before resubmitting'
      );
    }

    if (codeQualityScore < 70) {
      feedback.push(
        `\n⚠️  Code quality score: ${codeQualityScore}/100 (minimum: 70)`
      );
      feedback.push('  - Add more artifacts/screenshots');
      feedback.push('  - Provide detailed description');
      feedback.push('  - Document key findings');
    }

    if (feedback.length === 0) {
      return '✅ All validation checks passed! Deliverable approved for evidence generation.';
    }

    return feedback.join('\n');
  }

  /**
   * Build failed validation response
   */
  private buildFailedResponse(
    errorMessage: string
  ): DeliverableValidationResponse {
    return {
      approved: false,
      validationResults: {
        acceptanceCriteriaMet: false,
        dependenciesSatisfied: false,
        testsPass: false,
        codeQualityScore: 0,
        details: {
          acceptanceCriteria: [],
          dependencyStatuses: [],
          testResults: { passed: 0, failed: 0, total: 0 },
        },
      },
      feedback: `❌ Validation failed: ${errorMessage}`,
    };
  }
}
