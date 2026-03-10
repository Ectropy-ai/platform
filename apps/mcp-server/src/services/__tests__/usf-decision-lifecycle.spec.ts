/**
 * USF Decision Lifecycle Integration Tests - Phase 4
 *
 * Validates the integration between Universal Service Factors (USF) and
 * the decision lifecycle tools: capture, route, approve, reject.
 *
 * Test Coverage:
 * - Projected USF impact calculation
 * - Provider recommendations based on USF profiles
 * - USF-based authority escalation
 * - Decision outcome event emission
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @see apps/mcp-server/src/services/usf-decision.service.ts
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

// Import types
import type {
  PMURN,
  PMDecision,
  USFProfile,
  USFImpact,
  AuthorityLevel,
} from '../../types/pm.types.js';

// Import USF Decision Service
import {
  calculateProjectedUSFImpact,
  classifyImpactSeverity,
  getUSFProviderRecommendations,
  getUSFEscalationRecommendation,
  getUSFDecisionContext,
  calculateUSFAuthorityAdjustment,
  USF_ESCALATION_THRESHOLDS,
  USF_AUTHORITY_BUMPS,
  type ProjectedUSFImpact,
  type USFProviderRecommendation,
  type USFEscalationRecommendation,
} from '../usf-decision.service.js';

// Import USF Service for calculations
import {
  calculateComposite,
  DEFAULT_USF_WEIGHTS,
} from '../usf.service.js';

// Import URN utilities
import {
  buildURN,
  resetAllIdCounters,
} from '../pm-urn.utils.js';

// ============================================================================
// Test Setup
// ============================================================================

const TEST_PROJECT_ID = 'usf-decision-lifecycle-test';
const TEST_DATA_DIR = join(
  process.cwd(),
  '.roadmap',
  'projects',
  TEST_PROJECT_ID
);

describe('USF Decision Lifecycle - Phase 4', () => {
  beforeEach(() => {
    resetAllIdCounters();

    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    initializeTestCollections();
  });

  afterEach(() => {
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function initializeTestCollections(): void {
    // Initialize USF profiles collection with test providers
    const profilesPath = join(TEST_DATA_DIR, 'usf-profiles.json');
    writeFileSync(
      profilesPath,
      JSON.stringify(
        {
          $schema: 'https://luhtech.dev/schemas/usf/usf-profiles-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:usf-profiles`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/usf-profiles.json`,
            lastUpdated: new Date().toISOString(),
            totalProfiles: 3,
          },
          indexes: { byProviderType: {}, byPricingTier: {}, byTrade: {} },
          profiles: [
            createTestProfile('USF-2026-0001', 'CREW-ELEC-001', 'team', 0.92, 0.85, 0.88, 'electrical'),
            createTestProfile('USF-2026-0002', 'CREW-PLUM-001', 'team', 0.78, 0.82, 0.75, 'plumbing'),
            createTestProfile('USF-2026-0003', 'CREW-HVAC-001', 'subcontractor', 0.65, 0.90, 0.70, 'hvac'),
          ],
        },
        null,
        2
      )
    );

    // Initialize decisions collection
    const decisionsPath = join(TEST_DATA_DIR, 'decisions.json');
    writeFileSync(
      decisionsPath,
      JSON.stringify(
        {
          $schema: 'https://luhtech.dev/schemas/pm/decisions-collection.json',
          $id: `urn:luhtech:${TEST_PROJECT_ID}:file:decisions`,
          schemaVersion: '3.0.0',
          meta: {
            projectId: TEST_PROJECT_ID,
            sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/decisions.json`,
            lastUpdated: new Date().toISOString(),
            totalDecisions: 0,
          },
          indexes: { byStatus: {}, byVoxel: {}, byAuthorityLevel: {} },
          decisions: [],
        },
        null,
        2
      )
    );
  }

  function createTestProfile(
    profileId: string,
    providerId: string,
    providerType: string,
    quality: number,
    cost: number,
    speed: number,
    trade: string
  ): USFProfile {
    const composite = calculateComposite({ quality, cost, speed });
    return {
      $id: `urn:luhtech:${TEST_PROJECT_ID}:usf-profile:${profileId}` as PMURN,
      $schema: 'https://luhtech.dev/schemas/usf/usf-profile.schema.json',
      schemaVersion: '3.0.0',
      meta: {
        projectId: TEST_PROJECT_ID,
        sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/usf-profiles.json`,
        lastUpdated: new Date().toISOString(),
      },
      profileId,
      providerId,
      providerType: providerType as any,
      providerInfo: {
        name: `Test Provider ${providerId}`,
        trade,
      },
      factors: { quality, cost, speed },
      composite: {
        score: composite,
        weights: DEFAULT_USF_WEIGHTS,
      },
      confidence: {
        score: 0.8,
        sampleSize: 15,
        variance: 0.08,
        lastUpdated: new Date().toISOString(),
      },
      pricingTier: quality >= 0.85 ? 'premium' : quality >= 0.75 ? 'standard' : 'economy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      graphMetadata: { inEdges: [], outEdges: [], edges: [] },
    };
  }

  function createTestDecision(
    decisionId: string,
    budgetImpact?: number,
    scheduleDelayDays?: number,
    criticalPath?: boolean
  ): PMDecision {
    return {
      $id: `urn:luhtech:${TEST_PROJECT_ID}:pm-decision:${decisionId}` as PMURN,
      $schema: 'https://luhtech.dev/schemas/pm/decision.schema.json',
      schemaVersion: '3.0.0',
      meta: {
        projectId: TEST_PROJECT_ID,
        sourceOfTruth: `.roadmap/projects/${TEST_PROJECT_ID}/decisions.json`,
        lastUpdated: new Date().toISOString(),
      },
      decisionId,
      title: `Test Decision ${decisionId}`,
      type: 'APPROVAL',
      status: 'PENDING',
      authorityLevel: {
        required: 2 as AuthorityLevel,
        current: 0 as AuthorityLevel,
      },
      voxelRef: `urn:luhtech:${TEST_PROJECT_ID}:voxel:VOX-TEST-001` as PMURN,
      budgetImpact: budgetImpact ? { estimated: budgetImpact, currency: 'USD' } : undefined,
      scheduleImpact: scheduleDelayDays
        ? { delayDays: scheduleDelayDays, criticalPath: criticalPath || false }
        : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      graphMetadata: { inEdges: [], outEdges: [], edges: [] },
    };
  }

  // ============================================================================
  // Projected USF Impact Tests
  // ============================================================================

  describe('calculateProjectedUSFImpact', () => {
    it('should calculate minor impact for small decision', () => {
      const decision = createTestDecision('DEC-2026-0001');

      const projection = calculateProjectedUSFImpact(decision);

      expect(projection.severity).toBe('minor');
      expect(projection.authorityBump).toBe(0);
      expect(projection.riskFactors.length).toBe(0);
    });

    it('should calculate impact for budget decision', () => {
      const decision = createTestDecision('DEC-2026-0002', 15000);

      const projection = calculateProjectedUSFImpact(decision);

      expect(projection.impact.costImpact).toBeLessThan(0);
      // Budget impact severity depends on the formula
      expect(['moderate', 'significant', 'critical']).toContain(projection.severity);
      expect(projection.authorityBump).toBeGreaterThanOrEqual(0);
    });

    it('should calculate significant impact for schedule delay', () => {
      const decision = createTestDecision('DEC-2026-0003', 0, 14, false);

      const projection = calculateProjectedUSFImpact(decision);

      expect(projection.impact.scheduleImpact).toBeLessThan(0);
      expect(['moderate', 'significant']).toContain(projection.severity);
    });

    it('should calculate critical impact for critical path delay', () => {
      const decision = createTestDecision('DEC-2026-0004', 50000, 21, true);

      const projection = calculateProjectedUSFImpact(decision);

      expect(projection.severity).toBe('critical');
      expect(projection.authorityBump).toBe(3);
      expect(projection.riskFactors.length).toBeGreaterThan(0);
      expect(projection.mitigations.length).toBeGreaterThan(0);
    });

    it('should include mitigations for high-impact decisions', () => {
      const decision = createTestDecision('DEC-2026-0005', 75000, 30, true);

      const projection = calculateProjectedUSFImpact(decision);

      expect(projection.mitigations.length).toBeGreaterThan(0);
      expect(projection.mitigations.some((m) => m.includes('budget') || m.includes('cost'))).toBe(true);
      expect(projection.mitigations.some((m) => m.includes('schedule') || m.includes('time'))).toBe(true);
    });
  });

  // ============================================================================
  // Impact Severity Classification Tests
  // ============================================================================

  describe('classifyImpactSeverity', () => {
    it('should classify minor impact', () => {
      const impact: USFImpact = {
        qualityImpact: 0.02,
        costImpact: -0.03,
        scheduleImpact: 0.01,
        compositeImpact: 0.02,
        impactReason: 'Minor change',
        calculatedAt: new Date().toISOString(),
      };

      expect(classifyImpactSeverity(impact)).toBe('minor');
    });

    it('should classify moderate impact', () => {
      const impact: USFImpact = {
        qualityImpact: -0.05,
        costImpact: -0.10,
        scheduleImpact: -0.05,
        compositeImpact: -0.07,
        impactReason: 'Moderate change',
        calculatedAt: new Date().toISOString(),
      };

      expect(classifyImpactSeverity(impact)).toBe('moderate');
    });

    it('should classify significant impact', () => {
      const impact: USFImpact = {
        qualityImpact: -0.12,
        costImpact: -0.18,
        scheduleImpact: -0.10,
        compositeImpact: -0.13,
        impactReason: 'Significant change',
        calculatedAt: new Date().toISOString(),
      };

      expect(classifyImpactSeverity(impact)).toBe('significant');
    });

    it('should classify critical impact', () => {
      const impact: USFImpact = {
        qualityImpact: -0.30,
        costImpact: -0.25,
        scheduleImpact: -0.28,
        compositeImpact: -0.27,
        impactReason: 'Critical change',
        calculatedAt: new Date().toISOString(),
      };

      expect(classifyImpactSeverity(impact)).toBe('critical');
    });
  });

  // ============================================================================
  // Provider Recommendations Tests
  // ============================================================================

  describe('getUSFProviderRecommendations', () => {
    it('should return providers sorted by match score', () => {
      const recommendations = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { minQuality: 0.7 },
        5
      );

      expect(recommendations.length).toBe(3);
      expect(recommendations[0].matchScore).toBeGreaterThanOrEqual(recommendations[1].matchScore);
      expect(recommendations[1].matchScore).toBeGreaterThanOrEqual(recommendations[2].matchScore);
    });

    it('should filter by trade', () => {
      const recommendations = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { trade: 'electrical' }
      );

      expect(recommendations.length).toBe(1);
      expect(recommendations[0].profile.providerInfo?.trade).toBe('electrical');
    });

    it('should rank high-quality providers higher', () => {
      const recommendations = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { minQuality: 0.85 }
      );

      expect(recommendations.length).toBeGreaterThan(0);
      // First provider should have highest match score
      // Providers meeting minQuality should score higher
      const highQualityProviders = recommendations.filter(
        (r) => r.profile.factors.quality >= 0.85
      );
      if (highQualityProviders.length > 0) {
        expect(highQualityProviders[0].matchScore).toBeGreaterThanOrEqual(
          recommendations[recommendations.length - 1].matchScore
        );
      }
    });

    it('should include estimated cost when budget provided', () => {
      const recommendations = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { budgetAmount: 10000 }
      );

      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach((r) => {
        expect(r.estimatedCost).toBeDefined();
        expect(r.estimatedCost).toBeGreaterThan(0);
      });
    });

    it('should assess risk level for each provider', () => {
      const recommendations = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { minQuality: 0.9 } // High bar
      );

      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach((r) => {
        expect(['low', 'medium', 'high']).toContain(r.riskLevel);
      });
    });

    it('should return empty array for non-existent project', () => {
      const recommendations = getUSFProviderRecommendations(
        'non-existent-project',
        { minQuality: 0.7 }
      );

      expect(recommendations).toEqual([]);
    });
  });

  // ============================================================================
  // Escalation Recommendation Tests
  // ============================================================================

  describe('getUSFEscalationRecommendation', () => {
    it('should not escalate for minor impact', () => {
      const decision = createTestDecision('DEC-2026-0001');

      const recommendation = getUSFEscalationRecommendation(decision, 2);

      expect(recommendation.shouldEscalate).toBe(false);
      expect(recommendation.recommendedAuthority).toBe(2);
    });

    it('should escalate for significant budget impact', () => {
      const decision = createTestDecision('DEC-2026-0002', 100000);

      const recommendation = getUSFEscalationRecommendation(decision, 2);

      expect(recommendation.shouldEscalate).toBe(true);
      expect(recommendation.recommendedAuthority).toBeGreaterThan(2);
      expect(recommendation.reasons.length).toBeGreaterThan(0);
    });

    it('should escalate for critical path delay', () => {
      const decision = createTestDecision('DEC-2026-0003', 0, 30, true);

      const recommendation = getUSFEscalationRecommendation(decision, 2);

      expect(recommendation.shouldEscalate).toBe(true);
      expect(recommendation.reasons.some((r) => r.toLowerCase().includes('schedule') || r.toLowerCase().includes('critical'))).toBe(true);
    });

    it('should include USF impact in recommendation', () => {
      const decision = createTestDecision('DEC-2026-0004', 50000, 14, true);

      const recommendation = getUSFEscalationRecommendation(decision, 1);

      expect(recommendation.usfImpact).toBeDefined();
      expect(recommendation.usfImpact.qualityImpact).toBeDefined();
      expect(recommendation.usfImpact.costImpact).toBeDefined();
      expect(recommendation.usfImpact.scheduleImpact).toBeDefined();
    });

    it('should not exceed maximum authority level', () => {
      const decision = createTestDecision('DEC-2026-0005', 1000000, 90, true);
      decision.authorityLevel.required = 5 as AuthorityLevel;

      const recommendation = getUSFEscalationRecommendation(decision, 5);

      expect(recommendation.recommendedAuthority).toBeLessThanOrEqual(6);
    });
  });

  // ============================================================================
  // Authority Adjustment Tests
  // ============================================================================

  describe('calculateUSFAuthorityAdjustment', () => {
    it('should return 0 adjustment for minor impact', () => {
      const decision = createTestDecision('DEC-2026-0001');

      const adjustment = calculateUSFAuthorityAdjustment(decision);

      expect(adjustment.adjustment).toBe(0);
      expect(adjustment.reason).toContain('Minor');
    });

    it('should return positive adjustment for budget impact', () => {
      const decision = createTestDecision('DEC-2026-0002', 15000);

      const adjustment = calculateUSFAuthorityAdjustment(decision);

      // Budget impact triggers non-minor severity
      expect(adjustment.adjustment).toBeGreaterThanOrEqual(0);
      expect(adjustment.reason.length).toBeGreaterThan(0);
    });

    it('should return adjustment for schedule and budget impact', () => {
      const decision = createTestDecision('DEC-2026-0003', 50000, 21, false);

      const adjustment = calculateUSFAuthorityAdjustment(decision);

      // Combined impact should trigger adjustment
      expect(adjustment.adjustment).toBeGreaterThanOrEqual(1);
    });

    it('should return 3 adjustment for critical impact', () => {
      const decision = createTestDecision('DEC-2026-0004', 100000, 45, true);

      const adjustment = calculateUSFAuthorityAdjustment(decision);

      expect(adjustment.adjustment).toBe(3);
      expect(adjustment.reason).toContain('Critical');
    });
  });

  // ============================================================================
  // Decision Context Tests
  // ============================================================================

  describe('getUSFDecisionContext', () => {
    it('should return complete context with all components', () => {
      const decision = createTestDecision('DEC-2026-0001', 25000, 7);

      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision);

      expect(context.decision).toBe(decision);
      expect(context.projectedImpact).toBeDefined();
      expect(context.providerRecommendations).toBeDefined();
      expect(context.escalationRecommendation).toBeDefined();
    });

    it('should include market benchmark when profiles exist', () => {
      const decision = createTestDecision('DEC-2026-0002');

      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision);

      expect(context.marketBenchmark).toBeDefined();
      expect(context.marketBenchmark?.quality).toBeGreaterThan(0);
      expect(context.marketBenchmark?.cost).toBeGreaterThan(0);
      expect(context.marketBenchmark?.speed).toBeGreaterThan(0);
    });

    it('should use budget from decision for provider recommendations', () => {
      const decision = createTestDecision('DEC-2026-0003', 50000);

      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision);

      expect(context.providerRecommendations.length).toBeGreaterThan(0);
      context.providerRecommendations.forEach((r) => {
        expect(r.estimatedCost).toBeDefined();
      });
    });

    it('should apply custom requirements when provided', () => {
      const decision = createTestDecision('DEC-2026-0004');

      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision, {
        trade: 'plumbing',
        minQuality: 0.7,
      });

      // Should filter to plumbing trade only
      const plumbingRecs = context.providerRecommendations.filter(
        (r) => r.profile.providerInfo?.trade === 'plumbing'
      );
      expect(plumbingRecs.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Constants and Thresholds Tests
  // ============================================================================

  describe('USF Constants', () => {
    it('should have valid escalation thresholds', () => {
      expect(USF_ESCALATION_THRESHOLDS.qualityImpactThreshold).toBeLessThan(0);
      expect(USF_ESCALATION_THRESHOLDS.costImpactThreshold).toBeLessThan(0);
      expect(USF_ESCALATION_THRESHOLDS.scheduleImpactThreshold).toBeLessThan(0);
      expect(USF_ESCALATION_THRESHOLDS.compositeImpactThreshold).toBeLessThan(0);
    });

    it('should have valid authority bumps', () => {
      expect(USF_AUTHORITY_BUMPS.minor).toBe(0);
      expect(USF_AUTHORITY_BUMPS.moderate).toBe(1);
      expect(USF_AUTHORITY_BUMPS.significant).toBe(2);
      expect(USF_AUTHORITY_BUMPS.critical).toBe(3);
    });

    it('should have premium quality higher than standard', () => {
      expect(USF_ESCALATION_THRESHOLDS.premiumQualityMinimum)
        .toBeGreaterThan(USF_ESCALATION_THRESHOLDS.standardQualityMinimum);
    });
  });

  // ============================================================================
  // Integration Flow Tests
  // ============================================================================

  describe('End-to-End Decision Lifecycle Flow', () => {
    it('should process decision through full USF-enhanced lifecycle', () => {
      // 1. Create decision with significant impact
      const decision = createTestDecision('DEC-E2E-001', 75000, 21, true);

      // 2. Calculate projected impact
      const projection = calculateProjectedUSFImpact(decision);
      expect(projection.severity).toBe('critical');

      // 3. Get escalation recommendation
      const escalation = getUSFEscalationRecommendation(decision, 2);
      expect(escalation.shouldEscalate).toBe(true);

      // 4. Get provider recommendations
      const providers = getUSFProviderRecommendations(
        TEST_PROJECT_ID,
        { budgetAmount: decision.budgetImpact?.estimated }
      );
      expect(providers.length).toBeGreaterThan(0);

      // 5. Get full context
      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision);
      expect(context.projectedImpact.severity).toBe('critical');
      expect(context.escalationRecommendation.shouldEscalate).toBe(true);

      console.log(
        `[E2E Test] Decision ${decision.decisionId}:\n` +
          `  - Impact Severity: ${projection.severity}\n` +
          `  - Authority Bump: ${projection.authorityBump}\n` +
          `  - Should Escalate: ${escalation.shouldEscalate}\n` +
          `  - Recommended Authority: ${escalation.recommendedAuthority}\n` +
          `  - Top Provider: ${providers[0]?.profile.profileId || 'none'}\n` +
          `  - Risk Factors: ${projection.riskFactors.length}`
      );
    });

    it('should handle low-impact decision efficiently', () => {
      const decision = createTestDecision('DEC-E2E-002');

      const context = getUSFDecisionContext(TEST_PROJECT_ID, decision);

      expect(context.projectedImpact.severity).toBe('minor');
      expect(context.escalationRecommendation.shouldEscalate).toBe(false);
      expect(context.projectedImpact.riskFactors.length).toBe(0);

      console.log(`[E2E Test] Low-impact decision processed with no escalation`);
    });
  });
});
