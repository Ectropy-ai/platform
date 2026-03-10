/**
 * Roadmap Service
 * Manages strategic roadmap tracking and alignment validation
 *
 * V3 Migration (2026-01-07): Updated to use centralized DATA_CONFIG
 * for V3 .roadmap/ directory paths instead of hardcoded V1 paths.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import {
  DATA_CONFIG,
  validateDataFiles,
  logConfig,
} from '../config/data-paths.config.js';
import { getCurrentVersion } from '../utils/version.js';
import type { WorkPlan } from './work-plan-validator.js';
import type {
  Roadmap,
  RoadmapPhase,
  Deliverable,
  RoadmapAlignment,
  BusinessRoadmap,
} from '../models/roadmap.js';

export class RoadmapService {
  private roadmap: Roadmap;
  private roadmapPath: string;
  private businessRoadmapPath: string;
  private readonly VALIDATION_ONLY = process.env.VALIDATION_ONLY === 'true';

  constructor(roadmapPath?: string, businessRoadmapPath?: string) {
    // V3 Migration: Use centralized data path configuration
    // Override paths only for testing purposes
    if (roadmapPath) {
      this.roadmapPath = roadmapPath;
      console.log(`📊 RoadmapService: Using override path: ${roadmapPath}`);
    } else {
      // Use V3 path from DATA_CONFIG (points to .roadmap/roadmap.json)
      this.roadmapPath = DATA_CONFIG.files.roadmap;
      console.log(`📊 RoadmapService: Using V3 path: ${this.roadmapPath}`);

      // Validate file exists, fall back to legacy path if needed
      if (!existsSync(this.roadmapPath)) {
        console.warn(`⚠️  V3 roadmap not found at: ${this.roadmapPath}`);
        // Try legacy fallback paths for backward compatibility
        const legacyPaths = [
          join(DATA_CONFIG.paths.data, 'roadmap-platform.json'),
          join(DATA_CONFIG.paths.data, 'roadmap.json'),
          '/app/data/roadmap-platform.json',
        ];
        const foundLegacy = legacyPaths.find((p) => existsSync(p));
        if (foundLegacy) {
          this.roadmapPath = foundLegacy;
          console.warn(`⚠️  Falling back to legacy path: ${this.roadmapPath}`);
        } else {
          console.error(
            `❌ No roadmap file found. Checked V3 and legacy paths.`
          );
        }
      }
    }

    // Business roadmap path resolution
    if (businessRoadmapPath) {
      this.businessRoadmapPath = businessRoadmapPath;
      console.log(
        `📊 RoadmapService: Using override business path: ${businessRoadmapPath}`
      );
    } else {
      // Use V3 path from DATA_CONFIG (points to .roadmap/roadmap-business.json)
      this.businessRoadmapPath = DATA_CONFIG.files.businessRoadmap;
      console.log(
        `📊 RoadmapService: Using V3 business path: ${this.businessRoadmapPath}`
      );

      // Validate file exists, fall back to legacy path if needed
      if (!existsSync(this.businessRoadmapPath)) {
        console.warn(
          `⚠️  V3 business roadmap not found at: ${this.businessRoadmapPath}`
        );
        // Try legacy fallback paths for backward compatibility
        const legacyBusinessPaths = [
          join(DATA_CONFIG.paths.data, 'roadmap-business.json'),
          '/app/data/roadmap-business.json',
        ];
        const foundLegacyBusiness = legacyBusinessPaths.find((p) =>
          existsSync(p)
        );
        if (foundLegacyBusiness) {
          this.businessRoadmapPath = foundLegacyBusiness;
          console.warn(
            `⚠️  Falling back to legacy business path: ${this.businessRoadmapPath}`
          );
        }
      }
    }

    this.roadmap = this.loadRoadmap();

    if (this.VALIDATION_ONLY) {
      console.log('📂 Roadmap Service: Validation-only mode (read-only)');
    }

    // Log V3 file validation status
    this.logV3Status();
  }

  /**
   * Log V3 file validation status on startup
   */
  private logV3Status(): void {
    const validation = validateDataFiles();
    if (!validation.valid) {
      console.warn('⚠️  V3 Data Files - Some files missing:');
      validation.missing.forEach((file) => console.warn(`   - ${file}`));
    } else {
      console.log('✅ V3 Data Files - All files present');
    }
  }

  /**
   * Load roadmap from JSON file
   */
  private loadRoadmap(): Roadmap {
    try {
      console.log(`📊 Loading roadmap from: ${this.roadmapPath}`);
      const data = readFileSync(this.roadmapPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Detect schema version: V2 uses quarters object, V1 uses top-level phases array
      const isV2 = !!parsed.quarters && !parsed.phases;

      let phases: RoadmapPhase[];
      let currentPhase: string;
      let overallProgress: number;
      let lastUpdated: Date;
      let version: string;

      if (isV2) {
        // V2 schema: quarters-based structure
        currentPhase = parsed.venture?.currentPhase || '';
        version = parsed.schemaVersion || '2.0.0';
        lastUpdated = new Date(
          parsed.meta?.lastUpdated || parsed.lastUpdated || Date.now()
        );

        // Transform quarters into phases for the Roadmap interface
        const quarterEntries = Object.entries(parsed.quarters) as [
          string,
          any,
        ][];
        phases = quarterEntries.map(([quarterId, quarter]) => {
          const deliverables: Deliverable[] = (quarter.deliverables || []).map(
            (d: any) => ({
              id: d.id,
              name: d.name,
              description: d.description || d.type || '',
              status:
                d.status === 'complete'
                  ? 'complete'
                  : d.status === 'in-progress'
                    ? 'in-progress'
                    : 'not-started',
              assignee: d.owner,
              filesImpacted: d.filesImpacted || [],
              evidence: d.evidence || [],
            })
          );

          const totalDeliverables = deliverables.length;
          const completedDeliverables = deliverables.filter(
            (d) => d.status === 'complete'
          ).length;

          return {
            id: quarterId,
            name: quarter.focus || quarterId,
            description: quarter.theme || '',
            status:
              quarter.status === 'complete'
                ? ('complete' as const)
                : quarter.status === 'in-progress'
                  ? ('in-progress' as const)
                  : ('planned' as const),
            priority: 'high' as const,
            dependencies: [],
            deliverables,
            completedCount: completedDeliverables,
            totalCount: totalDeliverables,
          };
        });

        // Calculate overall progress from all deliverables
        const allDeliverables = phases.flatMap((p) => p.deliverables);
        const totalDel = allDeliverables.length;
        const completedDel = allDeliverables.filter(
          (d) => d.status === 'complete'
        ).length;
        overallProgress =
          totalDel > 0 ? Math.round((completedDel / totalDel) * 100) : 0;

        // Try to parse platformProgress as a percentage fallback
        if (parsed.venture?.platformProgress) {
          const pctMatch = String(parsed.venture.platformProgress).match(
            /(\d+)/
          );
          if (pctMatch) {
            overallProgress = parseInt(pctMatch[1], 10);
          }
        }
      } else {
        // V1 schema: legacy format with top-level phases array
        phases = (parsed.phases || []).map((phase: any) => ({
          ...phase,
          startDate: phase.startDate ? new Date(phase.startDate) : undefined,
          targetDate: phase.targetDate ? new Date(phase.targetDate) : undefined,
          completionDate: phase.completionDate
            ? new Date(phase.completionDate)
            : undefined,
        }));
        currentPhase = parsed.currentPhase || '';
        overallProgress = parsed.overallProgress || 0;
        version = parsed.version || getCurrentVersion();
        lastUpdated = new Date(parsed.lastUpdated || Date.now());
      }

      const roadmap: Roadmap = {
        ...parsed,
        // V3 metadata (preserve for graph queries)
        $id: parsed.$id,
        $schema: parsed.$schema,
        schemaVersion: parsed.schemaVersion,
        meta: parsed.meta,
        graphMetadata: parsed.graphMetadata,
        // Core roadmap data
        version,
        lastUpdated,
        phases,
        currentPhase,
        overallProgress,
      };

      // Log V3 metadata if present
      if (parsed.$id) {
        console.log(`✅ Roadmap loaded (V3): URN=${parsed.$id}`);
      }
      console.log(
        `✅ Roadmap loaded: ${roadmap.phases.length} phases, Current: ${roadmap.currentPhase}`
      );
      return roadmap;
    } catch (error) {
      console.error('Error loading roadmap:', error);
      // Return empty roadmap on error
      return {
        version: getCurrentVersion(),
        lastUpdated: new Date(),
        phases: [],
        currentPhase: '',
        overallProgress: 0,
      };
    }
  }

  /**
   * Get current roadmap state
   */
  getRoadmap(): Roadmap {
    return this.roadmap;
  }

  /**
   * Get business roadmap
   */
  getBusinessRoadmap(): BusinessRoadmap {
    try {
      console.log(
        `📊 Loading business roadmap from: ${this.businessRoadmapPath}`
      );
      const data = readFileSync(this.businessRoadmapPath, 'utf-8');
      const businessRoadmap = JSON.parse(data) as BusinessRoadmap;

      // Log V3 metadata if present
      if ((businessRoadmap as any).$id) {
        console.log(
          `✅ Business roadmap loaded (V3): URN=${(businessRoadmap as any).$id}`
        );
      }
      console.log(
        `✅ Business roadmap loaded: Organization: ${businessRoadmap.organizationName}`
      );
      return businessRoadmap;
    } catch (error) {
      console.error('Error loading business roadmap:', error);
      throw new Error('Failed to load business roadmap');
    }
  }

  /**
   * Get current active phase
   */
  getCurrentPhase(): RoadmapPhase | null {
    const phase = this.roadmap.phases.find(
      (p) => p.id === this.roadmap.currentPhase
    );
    return phase || null;
  }

  /**
   * Get next phase after current
   */
  getNextPhase(): RoadmapPhase | null {
    const currentPhase = this.getCurrentPhase();
    if (!currentPhase) {
      return null;
    }

    // Extract phase number from id (e.g., "phase-4" -> 4)
    const currentPhaseNumber =
      currentPhase.phase ||
      (currentPhase.id.match(/phase-(\d+)/)
        ? parseInt(currentPhase.id.match(/phase-(\d+)/)![1], 10)
        : 0);

    const nextPhaseNumber = currentPhaseNumber + 1;

    // Find next phase by matching phase number in id
    const nextPhase = this.roadmap.phases.find((p) => {
      const phaseNum =
        p.phase ||
        (p.id.match(/phase-(\d+)/)
          ? parseInt(p.id.match(/phase-(\d+)/)![1], 10)
          : 0);
      return phaseNum === nextPhaseNumber;
    });

    return nextPhase || null;
  }

  /**
   * Check if work plan aligns with current roadmap phase
   */
  checkAlignment(workPlan: WorkPlan): RoadmapAlignment {
    const currentPhase = this.getCurrentPhase();

    if (!currentPhase) {
      return {
        aligned: false,
        currentPhase: {
          id: '',
          name: 'Unknown',
          description: 'No current phase set',
          status: 'planned',
          priority: 'low',
          dependencies: [],
          deliverables: [],
        },
        workPlanMatchesPhase: false,
        phaseProgress: 0,
        recommendations: ['Set current phase in roadmap'],
        blockers: ['No active phase defined'],
      };
    }

    // Check if task matches any deliverable in current phase
    const matchingDeliverable = currentPhase.deliverables.find((d) =>
      this.workPlanMatchesDeliverable(workPlan, d)
    );

    // Check for blockers (dependencies not complete)
    const blockers = this.getBlockers(currentPhase);

    const recommendations = this.generateRecommendations(
      workPlan,
      currentPhase,
      matchingDeliverable
    );

    return {
      aligned: !!matchingDeliverable && blockers.length === 0,
      currentPhase,
      workPlanMatchesPhase: !!matchingDeliverable,
      phaseProgress: this.calculatePhaseProgress(currentPhase),
      recommendations,
      blockers,
    };
  }

  /**
   * Update deliverable status
   */
  updateDeliverable(
    phaseId: string,
    deliverableId: string,
    status: string,
    evidence?: string[]
  ): void {
    if (this.VALIDATION_ONLY) {
      console.warn(
        '⚠️  Cannot update deliverable in validation-only mode (read-only)'
      );
      throw new Error('Roadmap updates not available in validation-only mode');
    }

    const phase = this.roadmap.phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }

    const deliverable = phase.deliverables.find((d) => d.id === deliverableId);
    if (!deliverable) {
      throw new Error(
        `Deliverable ${deliverableId} not found in phase ${phaseId}`
      );
    }

    // Update status
    deliverable.status = status as 'not-started' | 'in-progress' | 'complete';

    // Add evidence if provided
    if (evidence && evidence.length > 0) {
      deliverable.evidence = [...(deliverable.evidence || []), ...evidence];
    }

    // Recalculate phase progress
    const progress = this.calculatePhaseProgress(phase);

    // Check if phase is complete
    if (progress === 100 && phase.status !== 'complete') {
      phase.status = 'complete';
      phase.completionDate = new Date();
    }

    // Update overall progress
    this.updateOverallProgress();
  }

  /**
   * Mark phase complete
   */
  completePhase(phaseId: string): void {
    if (this.VALIDATION_ONLY) {
      console.warn(
        '⚠️  Cannot complete phase in validation-only mode (read-only)'
      );
      throw new Error('Roadmap updates not available in validation-only mode');
    }

    const phase = this.roadmap.phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }

    // Validate all deliverables complete
    const incompleteDeliverables = phase.deliverables.filter(
      (d) => d.status !== 'complete'
    );

    if (incompleteDeliverables.length > 0) {
      throw new Error(
        `Cannot complete phase: ${incompleteDeliverables.length} deliverable(s) incomplete`
      );
    }

    phase.status = 'complete';
    phase.completionDate = new Date();

    // Update overall progress
    this.updateOverallProgress();
  }

  /**
   * Get upcoming deliverables (not yet complete)
   */
  getUpcomingDeliverables(limit: number = 5): Deliverable[] {
    const upcoming: Deliverable[] = [];

    // Start with current phase deliverables
    const currentPhase = this.getCurrentPhase();
    if (currentPhase) {
      const currentPhaseUpcoming = currentPhase.deliverables.filter(
        (d) => d.status !== 'complete'
      );
      upcoming.push(...currentPhaseUpcoming);
    }

    // Add from next phases if needed
    if (upcoming.length < limit) {
      const currentPhaseIndex = this.roadmap.phases.findIndex(
        (p) => p.id === this.roadmap.currentPhase
      );

      for (let i = currentPhaseIndex + 1; i < this.roadmap.phases.length; i++) {
        const phase = this.roadmap.phases[i];
        const phaseUpcoming = phase.deliverables.filter(
          (d) => d.status !== 'complete'
        );
        upcoming.push(...phaseUpcoming);

        if (upcoming.length >= limit) {
          break;
        }
      }
    }

    return upcoming.slice(0, limit);
  }

  /**
   * Check if work plan matches a deliverable
   */
  private workPlanMatchesDeliverable(
    workPlan: WorkPlan,
    deliverable: Deliverable
  ): boolean {
    // Skip completed deliverables
    if (deliverable.status === 'complete') {
      return false;
    }

    // Check task description similarity (simple keyword matching)
    const taskLower = workPlan.taskDescription.toLowerCase();
    const deliverableLower = deliverable.name.toLowerCase();

    // Check for keyword matches
    const keywords = deliverableLower.split(/\s+/);
    const hasKeywordMatch = keywords.some(
      (keyword) => keyword.length > 3 && taskLower.includes(keyword)
    );

    // Check files impacted overlap
    const hasFileOverlap = deliverable.filesImpacted.some((file) =>
      workPlan.filesImpacted.some(
        (wpFile) => wpFile.includes(file) || file.includes(wpFile)
      )
    );

    return hasKeywordMatch || hasFileOverlap;
  }

  /**
   * Get blockers for a phase
   */
  private getBlockers(phase: RoadmapPhase): string[] {
    const blockers: string[] = [];

    // Check dependencies are complete
    for (const depId of phase.dependencies) {
      const depPhase = this.roadmap.phases.find((p) => p.id === depId);
      if (depPhase && depPhase.status !== 'complete') {
        blockers.push(
          `Dependency phase "${depPhase.name}" (${depId}) not complete`
        );
      }
    }

    // Check if phase is blocked
    if (phase.status === 'blocked') {
      blockers.push('Phase marked as blocked');
    }

    return blockers;
  }

  /**
   * Calculate phase progress percentage
   */
  calculatePhaseProgress(phase: RoadmapPhase): number {
    const total = phase.deliverables.length;
    if (total === 0) {
      return 100;
    }

    const complete = phase.deliverables.filter(
      (d) => d.status === 'complete'
    ).length;
    return Math.round((complete / total) * 100);
  }

  /**
   * Generate recommendations based on work plan and phase
   */
  private generateRecommendations(
    workPlan: WorkPlan,
    currentPhase: RoadmapPhase,
    matchingDeliverable?: Deliverable
  ): string[] {
    const recommendations: string[] = [];

    if (!matchingDeliverable) {
      recommendations.push(
        `Work does not align with current phase: ${currentPhase.name}`
      );
      recommendations.push('Current phase deliverables:');
      currentPhase.deliverables
        .filter((d) => d.status !== 'complete')
        .forEach((d) => {
          recommendations.push(`  - ${d.name}: ${d.description}`);
        });
    } else {
      recommendations.push(
        `Work aligns with deliverable: ${matchingDeliverable.name}`
      );
      recommendations.push(
        `Phase progress: ${this.calculatePhaseProgress(currentPhase)}%`
      );
    }

    return recommendations;
  }

  /**
   * Update overall progress across all phases
   */
  private updateOverallProgress(): void {
    const totalPhases = this.roadmap.phases.length;
    if (totalPhases === 0) {
      this.roadmap.overallProgress = 0;
      return;
    }

    let totalProgress = 0;
    for (const phase of this.roadmap.phases) {
      const phaseProgress = this.calculatePhaseProgress(phase);
      totalProgress += phaseProgress;
    }

    this.roadmap.overallProgress = Math.round(totalProgress / totalPhases);
  }
}
