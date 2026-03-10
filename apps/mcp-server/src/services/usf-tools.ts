/**
 * USF (Universal Service Factors) MCP Tools
 *
 * MCP tool definitions and handlers for Universal Service Factors.
 * Enables AI agents to track, calculate, and manage USF profiles
 * for service providers and work packets.
 *
 * Tools Implemented (7 total):
 * - P0 (Critical): usf_get_provider_profile, usf_create_work_packet, usf_complete_work_packet
 * - P1 (Important): usf_search_providers, usf_compare_providers, usf_get_market_benchmarks, usf_calculate_pricing
 *
 * @see .roadmap/schemas/usf/usf-profile.schema.json
 * @see .roadmap/schemas/usf/usf-work-packet.schema.json
 * @version 1.0.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_CONFIG } from '../config/data-paths.config.js';

import type {
  PMURN,
  USFProfile,
  USFWorkPacket,
  USFFactors,
  USFWeights,
  USFProviderType,
  USFPricingTier,
  USFWorkPacketStatus,
  USFLaborAllocation,
  USFAttribution,
  USFProfilesCollection,
  USFWorkPacketsCollection,
  USFGetProviderProfileInput,
  USFCreateWorkPacketInput,
  USFCompleteWorkPacketInput,
  USFSearchProvidersInput,
  USFCompareProvidersInput,
  USFGetMarketBenchmarksInput,
  USFCalculatePricingInput,
  USFGetProviderProfileResult,
  USFCreateWorkPacketResult,
  USFCompleteWorkPacketResult,
  USFSearchProvidersResult,
  USFCompareProvidersResult,
  USFGetMarketBenchmarksResult,
  USFCalculatePricingResult,
  PMToolResult,
  GraphMetadata,
} from '../types/pm.types.js';

import {
  USFService,
  calculateQualityScore,
  calculateCostScore,
  calculateSpeedScore,
  calculateComposite,
  calculateConfidence,
  calculateBillingAmount,
  calculateVariance,
  calculateContractAdjustment,
  updateProfileFactors,
  buildUSFProfileURN,
  buildUSFWorkPacketURN,
  generateUSFProfileId,
  generateUSFWorkPacketId,
  setUSFIdCounter,
  DEFAULT_USF_WEIGHTS,
  USF_PRICING_TIERS,
} from './usf.service.js';

// ============================================================================
// Storage Helpers
// ============================================================================

function getRepoRoot(): string {
  return DATA_CONFIG.paths.repoRoot;
}

function getProjectDataDir(projectId: string): string {
  return join(getRepoRoot(), '.roadmap', 'projects', projectId);
}

function getUSFProfilesPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'usf-profiles.json');
}

function getUSFWorkPacketsPath(projectId: string): string {
  return join(getProjectDataDir(projectId), 'usf-work-packets.json');
}

function ensureProjectDir(projectId: string): void {
  const dir = getProjectDataDir(projectId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// Collection Loaders/Savers
// ============================================================================

function loadUSFProfiles(projectId: string): USFProfilesCollection {
  const path = getUSFProfilesPath(projectId);

  if (!existsSync(path)) {
    const initial: USFProfilesCollection = {
      $schema: 'https://luhtech.dev/schemas/usf/usf-profiles-collection.json',
      $id: `urn:luhtech:${projectId}:file:usf-profiles`,
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/usf-profiles.json`,
        lastUpdated: new Date().toISOString(),
        totalProfiles: 0,
      },
      indexes: {
        byProviderType: {} as Record<USFProviderType, string[]>,
        byPricingTier: {} as Record<USFPricingTier, string[]>,
        byTrade: {},
      },
      profiles: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  // Restore ID counter from existing profiles
  if (collection.profiles.length > 0) {
    const maxId = Math.max(
      ...collection.profiles.map((p: USFProfile) => {
        const match = p.profileId.match(/USF-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setUSFIdCounter('profile', maxId);
  }
  return collection;
}

function saveUSFProfiles(projectId: string, collection: USFProfilesCollection): void {
  const path = getUSFProfilesPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalProfiles = collection.profiles.length;

  // Rebuild indexes
  const byProviderType: Record<string, string[]> = {};
  const byPricingTier: Record<string, string[]> = {};
  const byTrade: Record<string, string[]> = {};

  for (const p of collection.profiles) {
    if (!byProviderType[p.providerType]) {
      byProviderType[p.providerType] = [];
    }
    byProviderType[p.providerType].push(p.profileId);

    if (p.pricingTier) {
      if (!byPricingTier[p.pricingTier]) {
        byPricingTier[p.pricingTier] = [];
      }
      byPricingTier[p.pricingTier].push(p.profileId);
    }

    if (p.providerInfo?.trade) {
      if (!byTrade[p.providerInfo.trade]) {
        byTrade[p.providerInfo.trade] = [];
      }
      byTrade[p.providerInfo.trade].push(p.profileId);
    }
  }

  collection.indexes = {
    byProviderType,
    byPricingTier,
    byTrade,
  } as USFProfilesCollection['indexes'];

  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

function loadUSFWorkPackets(projectId: string): USFWorkPacketsCollection {
  const path = getUSFWorkPacketsPath(projectId);

  if (!existsSync(path)) {
    const initial: USFWorkPacketsCollection = {
      $schema: 'https://luhtech.dev/schemas/usf/usf-work-packets-collection.json',
      $id: `urn:luhtech:${projectId}:file:usf-work-packets`,
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/usf-work-packets.json`,
        lastUpdated: new Date().toISOString(),
        totalWorkPackets: 0,
      },
      indexes: {
        byStatus: {} as Record<USFWorkPacketStatus, string[]>,
        byWorkType: {},
        byProvider: {},
      },
      workPackets: [],
    };
    ensureProjectDir(projectId);
    writeFileSync(path, JSON.stringify(initial, null, 2));
    return initial;
  }

  const collection = JSON.parse(readFileSync(path, 'utf-8'));
  // Restore ID counter
  if (collection.workPackets.length > 0) {
    const maxId = Math.max(
      ...collection.workPackets.map((wp: USFWorkPacket) => {
        const match = wp.workPacketId.match(/WP-\d{4}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
    );
    setUSFIdCounter('work-packet', maxId);
  }
  return collection;
}

function saveUSFWorkPackets(projectId: string, collection: USFWorkPacketsCollection): void {
  const path = getUSFWorkPacketsPath(projectId);
  collection.meta.lastUpdated = new Date().toISOString();
  collection.meta.totalWorkPackets = collection.workPackets.length;

  // Rebuild indexes
  const byStatus: Record<string, string[]> = {};
  const byWorkType: Record<string, string[]> = {};
  const byProvider: Record<string, string[]> = {};

  for (const wp of collection.workPackets) {
    if (!byStatus[wp.status]) {
      byStatus[wp.status] = [];
    }
    byStatus[wp.status].push(wp.workPacketId);

    if (wp.workType) {
      if (!byWorkType[wp.workType]) {
        byWorkType[wp.workType] = [];
      }
      byWorkType[wp.workType].push(wp.workPacketId);
    }

    for (const alloc of wp.laborAllocation) {
      if (!byProvider[alloc.providerUrn]) {
        byProvider[alloc.providerUrn] = [];
      }
      byProvider[alloc.providerUrn].push(wp.workPacketId);
    }
  }

  collection.indexes = {
    byStatus,
    byWorkType,
    byProvider,
  } as USFWorkPacketsCollection['indexes'];

  ensureProjectDir(projectId);
  writeFileSync(path, JSON.stringify(collection, null, 2));
}

// ============================================================================
// Helper Functions
// ============================================================================

function createGraphMetadata(): GraphMetadata {
  return {
    inEdges: [],
    outEdges: [],
    edges: [],
  };
}

function parseProviderURN(urn: string): { projectId: string; profileId: string } | null {
  const match = urn.match(/^urn:luhtech:([^:]+):usf-profile:(.+)$/);
  if (!match) {return null;}
  return { projectId: match[1], profileId: match[2] };
}

function parseWorkPacketURN(urn: string): { projectId: string; workPacketId: string } | null {
  const match = urn.match(/^urn:luhtech:([^:]+):usf-work-packet:(.+)$/);
  if (!match) {return null;}
  return { projectId: match[1], workPacketId: match[2] };
}

// ============================================================================
// P0 Tool: usf_get_provider_profile
// ============================================================================

export async function usf_get_provider_profile(
  input: USFGetProviderProfileInput
): Promise<USFGetProviderProfileResult> {
  const startTime = Date.now();

  try {
    const parsed = parseProviderURN(input.providerUrn);
    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'INVALID_URN',
          message: `Invalid provider URN format: ${input.providerUrn}`,
        },
      };
    }

    const { projectId, profileId } = parsed;
    const collection = loadUSFProfiles(projectId);
    const profile = collection.profiles.find((p) => p.profileId === profileId);

    if (!profile) {
      return {
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: `USF profile not found: ${profileId}`,
        },
      };
    }

    return {
      success: true,
      data: {
        profile,
        history: input.includeHistory ? profile.history : undefined,
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P0 Tool: usf_create_work_packet
// ============================================================================

export async function usf_create_work_packet(
  input: USFCreateWorkPacketInput
): Promise<USFCreateWorkPacketResult> {
  const startTime = Date.now();

  try {
    const { projectId, laborAllocation, targets } = input;

    // Generate IDs
    const workPacketId = input.workPacketId || generateUSFWorkPacketId();
    const urn = buildUSFWorkPacketURN(projectId, workPacketId) as PMURN;

    // Build labor allocation with URNs
    const typedAllocation: USFLaborAllocation[] = laborAllocation.map((alloc) => ({
      providerUrn: alloc.providerUrn as PMURN,
      allocationPercent: alloc.allocationPercent,
      role: alloc.role,
      plannedHours: alloc.plannedHours,
    }));

    // Create work packet
    const workPacket: USFWorkPacket = {
      $id: urn,
      $schema: 'https://luhtech.dev/schemas/usf/usf-work-packet.schema.json',
      schemaVersion: '3.0.0',
      meta: {
        projectId,
        sourceOfTruth: `.roadmap/projects/${projectId}/usf-work-packets.json`,
        lastUpdated: new Date().toISOString(),
      },
      workPacketId,
      projectId,
      sourceRef: input.sourceRef
        ? {
            type: input.sourceRef.type,
            urn: input.sourceRef.urn as PMURN,
            externalId: input.sourceRef.externalId,
          }
        : undefined,
      description: input.description,
      workType: input.workType,
      status: 'planned',
      targets: {
        qualityTarget: targets.qualityTarget,
        budgetAmount: targets.budgetAmount,
        budgetCurrency: 'USD',
        durationHours: targets.durationHours,
        taktTime: targets.taktTime,
      },
      laborAllocation: typedAllocation,
      pricingTier: input.pricingTier,
      contractRef: input.contractRef as PMURN | undefined,
      voxelRefs: input.voxelRefs?.map((v) => v as PMURN),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      graphMetadata: createGraphMetadata(),
    };

    // Save to collection
    const collection = loadUSFWorkPackets(projectId);
    collection.workPackets.push(workPacket);
    saveUSFWorkPackets(projectId, collection);

    // Get affected profiles
    const profilesAffected = laborAllocation.map((a) => a.providerUrn);

    return {
      success: true,
      data: {
        workPacket,
        profilesAffected,
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P0 Tool: usf_complete_work_packet
// ============================================================================

export async function usf_complete_work_packet(
  input: USFCompleteWorkPacketInput
): Promise<USFCompleteWorkPacketResult> {
  const startTime = Date.now();

  try {
    const parsed = parseWorkPacketURN(input.workPacketUrn);
    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'INVALID_URN',
          message: `Invalid work packet URN format: ${input.workPacketUrn}`,
        },
      };
    }

    const { projectId, workPacketId } = parsed;
    const wpCollection = loadUSFWorkPackets(projectId);
    const wpIndex = wpCollection.workPackets.findIndex((wp) => wp.workPacketId === workPacketId);

    if (wpIndex === -1) {
      return {
        success: false,
        error: {
          code: 'WORK_PACKET_NOT_FOUND',
          message: `Work packet not found: ${workPacketId}`,
        },
      };
    }

    const workPacket = wpCollection.workPackets[wpIndex];
    const { actuals, attribution, inspectionRef, evidence } = input;

    // Update actuals
    workPacket.actuals = {
      qualityScore: actuals.qualityScore,
      defectCount: actuals.defectCount,
      reworkHours: actuals.reworkHours,
      actualCost: actuals.actualCost,
      actualDurationHours: actuals.actualDurationHours,
      completedAt: new Date().toISOString(),
    };

    // Calculate USF scores
    const qualityScore = calculateQualityScore({
      firstPassYield: actuals.qualityScore || 0.85,
      defectCount: actuals.defectCount || 0,
      reworkHours: actuals.reworkHours || 0,
      plannedHours: workPacket.targets.durationHours || 8,
    });

    const costScore = calculateCostScore(
      actuals.actualCost || 0,
      workPacket.targets.budgetAmount || 0,
      workPacket.targets.marketBenchmark
    );

    const speedScore = calculateSpeedScore({
      plannedDuration: workPacket.targets.durationHours || 8,
      actualDuration: actuals.actualDurationHours || 8,
      taktTarget: workPacket.targets.taktTime,
    });

    const usfResults: USFFactors & { composite: number } = {
      quality: qualityScore,
      cost: costScore,
      speed: speedScore,
      composite: calculateComposite({ quality: qualityScore, cost: costScore, speed: speedScore }),
    };

    workPacket.usfResults = usfResults;

    // Calculate variance
    const varianceReport = calculateVariance(
      {
        quality: workPacket.targets.qualityTarget,
        budget: workPacket.targets.budgetAmount || 0,
        duration: workPacket.targets.durationHours || 0,
      },
      {
        quality: qualityScore,
        cost: actuals.actualCost || 0,
        duration: actuals.actualDurationHours || 0,
      }
    );

    workPacket.variance = {
      qualityVariance: varianceReport.qualityVariance,
      costVariance: varianceReport.costVariance,
      costVariancePercent: varianceReport.costVariancePercent,
      scheduleVariance: varianceReport.scheduleVariance,
      scheduleVariancePercent: varianceReport.scheduleVariancePercent,
    };

    // Update status
    workPacket.status = 'completed';
    workPacket.completedAt = new Date().toISOString();
    workPacket.updatedAt = new Date().toISOString();

    if (inspectionRef) {
      workPacket.inspectionRef = inspectionRef as PMURN;
    }

    if (evidence) {
      workPacket.evidence = evidence.map((e) => ({
        ...e,
        timestamp: new Date().toISOString(),
      }));
    }

    // Update attribution if provided
    if (attribution) {
      workPacket.attribution = attribution.map((a) => ({
        providerUrn: a.providerUrn as PMURN,
        qualityContribution: a.qualityContribution,
        costContribution: a.costContribution,
        speedContribution: a.speedContribution,
      }));
    }

    // Save work packet
    wpCollection.workPackets[wpIndex] = workPacket;
    saveUSFWorkPackets(projectId, wpCollection);

    // Update provider profiles
    const profilesUpdated: Array<{
      providerUrn: string;
      previousFactors: USFFactors;
      newFactors: USFFactors;
      delta: USFFactors;
    }> = [];

    const profileCollection = loadUSFProfiles(projectId);

    for (const alloc of workPacket.laborAllocation) {
      const parsedProfile = parseProviderURN(alloc.providerUrn);
      if (!parsedProfile) {continue;}

      const profileIndex = profileCollection.profiles.findIndex(
        (p) => p.profileId === parsedProfile.profileId
      );
      if (profileIndex === -1) {continue;}

      const profile = profileCollection.profiles[profileIndex];
      const previousFactors = { ...profile.factors };

      // Calculate new factors using exponential moving average
      const newFactors = updateProfileFactors(
        profile.factors,
        usfResults,
        profile.confidence?.sampleSize || 0
      );

      // Update profile
      profile.factors = newFactors;
      profile.composite = {
        score: calculateComposite(newFactors),
        weights: profile.composite?.weights || DEFAULT_USF_WEIGHTS,
      };
      profile.confidence = {
        score: calculateConfidence((profile.confidence?.sampleSize || 0) + 1, 0.1),
        sampleSize: (profile.confidence?.sampleSize || 0) + 1,
        variance: profile.confidence?.variance || 0.1,
        lastUpdated: new Date().toISOString(),
      };
      profile.updatedAt = new Date().toISOString();

      // Add to history
      if (!profile.history) {profile.history = [];}
      profile.history.push({
        timestamp: new Date().toISOString(),
        factors: newFactors,
        composite: profile.composite.score,
        sampleSize: profile.confidence.sampleSize,
        triggeringWorkPacket: workPacket.$id,
      });

      profileCollection.profiles[profileIndex] = profile;

      profilesUpdated.push({
        providerUrn: alloc.providerUrn,
        previousFactors,
        newFactors,
        delta: {
          quality: newFactors.quality - previousFactors.quality,
          cost: newFactors.cost - previousFactors.cost,
          speed: newFactors.speed - previousFactors.speed,
        },
      });
    }

    saveUSFProfiles(projectId, profileCollection);

    // Calculate billing if applicable
    let billingAmount: number | undefined;
    let bonusOrPenalty: number | undefined;

    if (workPacket.pricingTier && workPacket.targets.budgetAmount) {
      const baseAmount = workPacket.targets.budgetAmount;
      billingAmount = calculateBillingAmount(
        baseAmount,
        workPacket.pricingTier,
        usfResults.composite
      );

      if (workPacket.contractThresholds) {
        bonusOrPenalty = calculateContractAdjustment(
          usfResults,
          workPacket.contractThresholds,
          baseAmount
        );
        billingAmount += bonusOrPenalty;
      }

      workPacket.billing = {
        baseRate: baseAmount,
        tierMultiplier: USF_PRICING_TIERS[workPacket.pricingTier].costMultiplier,
        reputationMultiplier: 0.8 + usfResults.composite * 0.4,
        varianceAdjustment: bonusOrPenalty,
        finalAmount: billingAmount,
        status: 'pending',
      };

      // Update work packet with billing info
      wpCollection.workPackets[wpIndex] = workPacket;
      saveUSFWorkPackets(projectId, wpCollection);
    }

    return {
      success: true,
      data: {
        workPacket,
        usfResults,
        profilesUpdated,
        billingAmount,
        varianceReport: {
          ...varianceReport,
          bonusOrPenalty,
        },
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P1 Tool: usf_search_providers
// ============================================================================

export async function usf_search_providers(
  input: USFSearchProvidersInput & { projectId: string }
): Promise<USFSearchProvidersResult> {
  const startTime = Date.now();

  try {
    const collection = loadUSFProfiles(input.projectId);
    let results = [...collection.profiles];

    // Filter by provider types
    if (input.providerTypes && input.providerTypes.length > 0) {
      results = results.filter((p) => input.providerTypes!.includes(p.providerType));
    }

    // Filter by minimum quality
    if (input.minQuality !== undefined) {
      results = results.filter((p) => p.factors.quality >= input.minQuality!);
    }

    // Filter by maximum cost (inverted - lower cost score means higher actual cost)
    if (input.maxCost !== undefined) {
      results = results.filter((p) => p.factors.cost >= input.maxCost!);
    }

    // Filter by minimum speed
    if (input.minSpeed !== undefined) {
      results = results.filter((p) => p.factors.speed >= input.minSpeed!);
    }

    // Filter by trade
    if (input.trade) {
      results = results.filter((p) => p.providerInfo?.trade === input.trade);
    }

    // Filter by minimum confidence
    if (input.minConfidence !== undefined) {
      results = results.filter((p) => (p.confidence?.score || 0) >= input.minConfidence!);
    }

    // Sort by composite score
    results.sort((a, b) => (b.composite?.score || 0) - (a.composite?.score || 0));

    // Apply limit
    if (input.limit) {
      results = results.slice(0, input.limit);
    }

    // Calculate market benchmark (average of all profiles)
    const allProfiles = collection.profiles;
    const marketBenchmark: USFFactors | undefined =
      allProfiles.length > 0
        ? {
            quality: allProfiles.reduce((sum, p) => sum + p.factors.quality, 0) / allProfiles.length,
            cost: allProfiles.reduce((sum, p) => sum + p.factors.cost, 0) / allProfiles.length,
            speed: allProfiles.reduce((sum, p) => sum + p.factors.speed, 0) / allProfiles.length,
          }
        : undefined;

    return {
      success: true,
      data: {
        providers: results,
        total: results.length,
        marketBenchmark,
        recommendedTier:
          results.length > 0
            ? USFService.determinePricingTier(results[0].factors.quality)
            : undefined,
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P1 Tool: usf_compare_providers
// ============================================================================

export async function usf_compare_providers(
  input: USFCompareProvidersInput & { projectId: string }
): Promise<USFCompareProvidersResult> {
  const startTime = Date.now();

  try {
    const collection = loadUSFProfiles(input.projectId);
    const weights = input.weightOverrides || DEFAULT_USF_WEIGHTS;

    const comparison: Array<{
      profile: USFProfile;
      rank: number;
      compositeScore: number;
      recommendation: string;
    }> = [];

    for (const urn of input.providerUrns) {
      const parsed = parseProviderURN(urn);
      if (!parsed) {continue;}

      const profile = collection.profiles.find((p) => p.profileId === parsed.profileId);
      if (!profile) {continue;}

      const compositeScore = calculateComposite(profile.factors, weights);
      comparison.push({
        profile,
        rank: 0, // Will be set after sorting
        compositeScore,
        recommendation: '',
      });
    }

    // Sort by composite score and assign ranks
    comparison.sort((a, b) => b.compositeScore - a.compositeScore);
    comparison.forEach((item, index) => {
      item.rank = index + 1;
      if (index === 0) {
        item.recommendation = 'Best overall performer based on weighted factors';
      } else if (item.compositeScore >= 0.8) {
        item.recommendation = 'Strong performer, suitable for premium work';
      } else if (item.compositeScore >= 0.6) {
        item.recommendation = 'Solid performer, suitable for standard work';
      } else {
        item.recommendation = 'Consider for economy tier work or development opportunities';
      }
    });

    // Calculate benchmark comparison
    const avgComposite =
      comparison.reduce((sum, c) => sum + c.compositeScore, 0) / comparison.length;
    const aboveAverage = comparison
      .filter((c) => c.compositeScore > avgComposite)
      .map((c) => c.profile.profileId);
    const belowAverage = comparison
      .filter((c) => c.compositeScore <= avgComposite)
      .map((c) => c.profile.profileId);

    return {
      success: true,
      data: {
        comparison,
        benchmarkComparison: {
          aboveAverage,
          belowAverage,
        },
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P1 Tool: usf_get_market_benchmarks
// ============================================================================

export async function usf_get_market_benchmarks(
  input: USFGetMarketBenchmarksInput & { projectId: string }
): Promise<USFGetMarketBenchmarksResult> {
  const startTime = Date.now();

  try {
    const collection = loadUSFProfiles(input.projectId);

    // Filter profiles by work type (if they have work types specified)
    let relevantProfiles = collection.profiles.filter((p) =>
      p.workTypes?.some((wt) => wt.workType === input.workType)
    );

    // If no specific matches, use all profiles as fallback
    if (relevantProfiles.length === 0) {
      relevantProfiles = collection.profiles;
    }

    // Calculate average benchmark
    const benchmark: USFFactors = {
      quality:
        relevantProfiles.length > 0
          ? relevantProfiles.reduce((sum, p) => sum + p.factors.quality, 0) / relevantProfiles.length
          : 0.75,
      cost:
        relevantProfiles.length > 0
          ? relevantProfiles.reduce((sum, p) => sum + p.factors.cost, 0) / relevantProfiles.length
          : 0.7,
      speed:
        relevantProfiles.length > 0
          ? relevantProfiles.reduce((sum, p) => sum + p.factors.speed, 0) / relevantProfiles.length
          : 0.7,
    };

    // Calculate confidence based on sample size
    const confidence = relevantProfiles.length > 0
      ? calculateConfidence(relevantProfiles.length, 0.15)
      : 0.1;

    // Generate price ranges based on tiers (using hypothetical base rate)
    const baseRate = 100; // Hypothetical base rate per hour
    const priceRange = {
      economy: {
        min: baseRate * USF_PRICING_TIERS.economy.costMultiplier * 0.8,
        max: baseRate * USF_PRICING_TIERS.economy.costMultiplier * 1.2,
      },
      standard: {
        min: baseRate * USF_PRICING_TIERS.standard.costMultiplier * 0.9,
        max: baseRate * USF_PRICING_TIERS.standard.costMultiplier * 1.1,
      },
      premium: {
        min: baseRate * USF_PRICING_TIERS.premium.costMultiplier * 0.9,
        max: baseRate * USF_PRICING_TIERS.premium.costMultiplier * 1.2,
      },
      expedited: {
        min: baseRate * USF_PRICING_TIERS.expedited.costMultiplier * 0.95,
        max: baseRate * USF_PRICING_TIERS.expedited.costMultiplier * 1.3,
      },
    };

    return {
      success: true,
      data: {
        workType: input.workType,
        region: input.region || 'default',
        benchmark,
        sampleSize: relevantProfiles.length,
        confidence,
        priceRange,
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// P1 Tool: usf_calculate_pricing
// ============================================================================

export async function usf_calculate_pricing(
  input: USFCalculatePricingInput & { projectId: string }
): Promise<USFCalculatePricingResult> {
  const startTime = Date.now();

  try {
    const parsed = parseWorkPacketURN(input.workPacketUrn);
    if (!parsed) {
      return {
        success: false,
        error: {
          code: 'INVALID_URN',
          message: `Invalid work packet URN format: ${input.workPacketUrn}`,
        },
      };
    }

    const { projectId, workPacketId } = parsed;
    const wpCollection = loadUSFWorkPackets(projectId);
    const workPacket = wpCollection.workPackets.find((wp) => wp.workPacketId === workPacketId);

    if (!workPacket) {
      return {
        success: false,
        error: {
          code: 'WORK_PACKET_NOT_FOUND',
          message: `Work packet not found: ${workPacketId}`,
        },
      };
    }

    const tier = input.pricingTier || workPacket.pricingTier || 'standard';
    const baseRate = workPacket.targets.budgetAmount || workPacket.targets.marketBenchmark || 1000;

    // Get average composite from allocated providers
    const profileCollection = loadUSFProfiles(projectId);
    let avgComposite = 0.7; // Default

    if (workPacket.laborAllocation.length > 0) {
      let totalWeight = 0;
      let weightedComposite = 0;

      for (const alloc of workPacket.laborAllocation) {
        const parsedProfile = parseProviderURN(alloc.providerUrn);
        if (!parsedProfile) {continue;}

        const profile = profileCollection.profiles.find(
          (p) => p.profileId === parsedProfile.profileId
        );
        if (!profile) {continue;}

        const weight = alloc.allocationPercent / 100;
        weightedComposite += (profile.composite?.score || 0.7) * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        avgComposite = weightedComposite / totalWeight;
      }
    }

    const tierMultiplier = USF_PRICING_TIERS[tier].costMultiplier;
    const reputationMultiplier = 0.8 + avgComposite * 0.4;
    const projectedAmount = baseRate * tierMultiplier * reputationMultiplier;

    // Calculate breakdown
    const laborCost = baseRate;
    const qualityPremium = avgComposite > 0.8 ? baseRate * 0.1 : 0;
    const speedPremium = avgComposite > 0.85 ? baseRate * 0.05 : 0;
    const tierAdjustment = baseRate * (tierMultiplier - 1);

    return {
      success: true,
      data: {
        workPacketUrn: input.workPacketUrn,
        baseRate,
        tierMultiplier,
        reputationMultiplier,
        projectedAmount,
        breakdown: {
          laborCost,
          qualityPremium,
          speedPremium,
          tierAdjustment,
        },
      },
      metadata: {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ============================================================================
// Tool Definitions (MCP Schema)
// ============================================================================

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    required?: string[];
    properties: Record<string, unknown>;
  };
}

export const usfTools: MCPToolDefinition[] = [
  {
    name: 'usf_get_provider_profile',
    description:
      'Get Universal Service Factor profile for a provider (human, robot, agent, team, subcontractor)',
    inputSchema: {
      type: 'object',
      required: ['providerUrn'],
      properties: {
        providerUrn: {
          type: 'string',
          description: 'URN of the provider (e.g., urn:luhtech:project-alpha:usf-profile:USF-CREW-ELEC-001)',
        },
        includeHistory: {
          type: 'boolean',
          default: false,
          description: 'Include historical USF snapshots',
        },
      },
    },
  },
  {
    name: 'usf_create_work_packet',
    description: 'Initialize a work packet with USF targets for tracking provider performance',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'laborAllocation', 'targets'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        workPacketId: { type: 'string', description: 'Optional custom work packet ID' },
        sourceRef: {
          type: 'object',
          description: 'Reference to source work unit (wagon, voxel, etc.)',
          properties: {
            type: { type: 'string', enum: ['wagon', 'voxel', 'voxel-cluster', 'task', 'milestone'] },
            urn: { type: 'string' },
            externalId: { type: 'string' },
          },
        },
        description: { type: 'string' },
        workType: { type: 'string', description: 'Type of work (e.g., electrical-rough)' },
        laborAllocation: {
          type: 'array',
          description: 'Providers allocated to this work',
          items: {
            type: 'object',
            required: ['providerUrn', 'allocationPercent'],
            properties: {
              providerUrn: { type: 'string' },
              allocationPercent: { type: 'number', minimum: 0, maximum: 100 },
              role: { type: 'string' },
              plannedHours: { type: 'number' },
            },
          },
        },
        targets: {
          type: 'object',
          required: ['qualityTarget'],
          properties: {
            qualityTarget: { type: 'number', minimum: 0, maximum: 1 },
            budgetAmount: { type: 'number' },
            durationHours: { type: 'number' },
            taktTime: { type: 'number' },
          },
        },
        pricingTier: { type: 'string', enum: ['economy', 'standard', 'premium', 'expedited'] },
        contractRef: { type: 'string' },
        voxelRefs: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'usf_complete_work_packet',
    description: 'Record actual results for a work packet and update provider USF profiles',
    inputSchema: {
      type: 'object',
      required: ['workPacketUrn', 'actuals'],
      properties: {
        workPacketUrn: { type: 'string', description: 'URN of the work packet to complete' },
        actuals: {
          type: 'object',
          description: 'Actual results',
          properties: {
            qualityScore: { type: 'number', description: 'First-pass yield 0-1' },
            defectCount: { type: 'integer' },
            reworkHours: { type: 'number' },
            actualCost: { type: 'number' },
            actualDurationHours: { type: 'number' },
          },
        },
        attribution: {
          type: 'array',
          description: 'Optional: override auto-attribution for mixed labor',
          items: {
            type: 'object',
            properties: {
              providerUrn: { type: 'string' },
              qualityContribution: { type: 'number' },
              costContribution: { type: 'number' },
              speedContribution: { type: 'number' },
            },
          },
        },
        inspectionRef: { type: 'string' },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['photo', 'document', 'measurement', 'inspection-report', 'timesheet'] },
              uri: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'usf_search_providers',
    description: 'Search for providers based on USF requirements',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string' },
        providerTypes: {
          type: 'array',
          items: { type: 'string', enum: ['human', 'robot', 'agent', 'team', 'subcontractor', 'aggregate'] },
        },
        minQuality: { type: 'number', minimum: 0, maximum: 1 },
        maxCost: { type: 'number', minimum: 0, maximum: 1 },
        minSpeed: { type: 'number', minimum: 0, maximum: 1 },
        trade: { type: 'string' },
        minConfidence: { type: 'number', minimum: 0, maximum: 1 },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'usf_compare_providers',
    description: 'Side-by-side USF comparison of providers',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'providerUrns'],
      properties: {
        projectId: { type: 'string' },
        providerUrns: {
          type: 'array',
          items: { type: 'string' },
          description: 'URNs of providers to compare',
        },
        weightOverrides: {
          type: 'object',
          description: 'Custom weights for comparison',
          properties: {
            quality: { type: 'number' },
            cost: { type: 'number' },
            speed: { type: 'number' },
          },
        },
      },
    },
  },
  {
    name: 'usf_get_market_benchmarks',
    description: 'Get market benchmark USF values for a work type and region',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'workType'],
      properties: {
        projectId: { type: 'string' },
        workType: { type: 'string', description: 'Type of work (e.g., electrical-rough)' },
        region: { type: 'string', description: 'Geographic region' },
      },
    },
  },
  {
    name: 'usf_calculate_pricing',
    description: 'Calculate dynamic pricing for a work packet based on USF profiles',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'workPacketUrn'],
      properties: {
        projectId: { type: 'string' },
        workPacketUrn: { type: 'string' },
        pricingTier: { type: 'string', enum: ['economy', 'standard', 'premium', 'expedited'] },
      },
    },
  },
];

// ============================================================================
// Tool Registry
// ============================================================================

export function getUSFToolByName(name: string): MCPToolDefinition | undefined {
  return usfTools.find((t) => t.name === name);
}

export function getUSFToolNames(): string[] {
  return usfTools.map((t) => t.name);
}

// ============================================================================
// Tool Handler Map
// ============================================================================

export const usfToolHandlers: Record<string, Function> = {
  usf_get_provider_profile,
  usf_create_work_packet,
  usf_complete_work_packet,
  usf_search_providers,
  usf_compare_providers,
  usf_get_market_benchmarks,
  usf_calculate_pricing,
};

/**
 * Execute a USF tool by name
 */
export async function executeUSFTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<PMToolResult<unknown>> {
  const handler = usfToolHandlers[toolName];
  if (!handler) {
    return {
      success: false,
      error: {
        code: 'TOOL_NOT_FOUND',
        message: `USF tool not found: ${toolName}`,
      },
    };
  }

  return handler(input);
}
