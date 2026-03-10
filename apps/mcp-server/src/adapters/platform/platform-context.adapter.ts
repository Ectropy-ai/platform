/**
 * Platform Context Adapter
 *
 * Reads Ectropy's .roadmap/ canonical JSON files and maps them to
 * universal decision engine types. This is the first concrete
 * implementation of IContextAdapter, enabling the decision engine
 * to operate on Ectropy's own development data (dogfooding).
 *
 * Data Sources:
 * - .roadmap/current-truth.json   → IStateNode[]
 * - .roadmap/roadmap.json         → IWorkUnit[], IContainer[]
 * - .roadmap/decision-log.json    → IDecision[]
 * - .roadmap/architecture.json    → IDependency[] (service deps)
 * - .roadmap/dependencies.json    → IDependency[] (external deps)
 * - .roadmap/success-stack-platform.json → Pattern context
 *
 * @module adapters/platform
 * @version 1.0.0
 */

import { readFileSync, existsSync } from 'fs';
import type {
  IContextAdapter,
  AdapterHealthStatus,
  ContextAdapterConfig,
} from '../universal/context-adapter.interface.js';
import type {
  DomainContext,
  IWorkUnit,
  IDecision,
  IDecisionAlternative,
  IDependency,
  IStateNode,
  IContainer,
  IMilestone,
  IAuthorityCascade,
  IHealthAssessment,
  IHealthMetric,
  IWorkRecommendation,
  UniversalStatus,
  ImpactLevel,
  WorkUnitFilter,
  DecisionFilter,
  StateNodeFilter,
} from '../universal/universal.types.js';
import type { EigenmodeVector } from '../../types/dual-process.types.js';
import { DATA_FILES } from '../../config/data-paths.config.js';
import { createPlatformAuthorityCascade } from './platform-authority.config.js';
import {
  computeAllMetrics,
  computeHealthAssessment,
  metricsToEigenmodeVector,
  type PlatformMetricInputs,
} from './platform-eigenmodes.js';

// ============================================================================
// Types for Raw .roadmap/ Data
// ============================================================================

interface RawCurrentTruth {
  platformState: {
    health: string;
    phase: string;
    progress: {
      completedDeliverables: number;
      totalDeliverables: number;
      activeWorkstreams: number;
    };
    productionReadinessScore: number;
    typeSafetyScore: number;
  };
  nodes: RawNode[];
  indexes?: {
    byNodeType?: Record<string, string[]>;
    byPhase?: Record<string, string[]>;
    byStatus?: Record<string, string[]>;
  };
}

interface RawNode {
  nodeId: string;
  $id?: string;
  nodeType?: string;
  type?: string; // legacy field name
  title: string;
  status: string;
  timestamp?: string;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  relationships?: {
    triggers?: string[];
    dependencies?: string[];
    relatedNodes?: string[];
    evidence?: string[];
  };
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
  };
}

interface RawRoadmap {
  quarters: Record<string, RawQuarter>;
  flagshipFeatures?: Array<Record<string, unknown>>;
  cicd_metrics?: Record<string, unknown>;
}

interface RawQuarter {
  focus: string;
  theme?: string;
  status: string;
  milestones?: RawMilestone[];
  deliverables?: RawDeliverable[];
  metrics?: Record<string, unknown>;
}

interface RawMilestone {
  id: string;
  date: string;
  event: string;
  gate?: boolean;
  critical?: boolean;
  status: string;
  type?: string;
}

interface RawDeliverable {
  id: string;
  $id?: string;
  name: string;
  type?: string;
  owner?: string;
  status: string;
  progress?: string;
  progressNote?: string;
  featureId?: string;
  targetDate?: string;
  targetReleaseId?: string;
  value?: Record<string, unknown>;
}

interface RawDecisionLog {
  decisions: RawDecision[];
}

interface RawDecision {
  decisionId: string;
  $id?: string;
  title: string;
  context: string;
  decision: string;
  rationale?: string;
  status: string;
  category?: string;
  impact?: string;
  proposedBy?: string;
  approvedBy?: string | string[];
  implementedDate?: string;
  timestamp?: string;
  alternatives?: Array<{
    option?: string;
    title?: string;
    description?: string;
    pros?: string[];
    cons?: string[];
    selected?: boolean;
    rejectionReason?: string;
  }>;
  relatedDecisions?: string[];
  impactedDeliverables?: string[];
  impactedServices?: string[];
  evidence?: string[];
  tags?: string[];
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
  };
}

interface RawArchitecture {
  services?: Array<{
    serviceId: string;
    $id?: string;
    name: string;
    deliverableId?: string;
    dependencies?: string[];
    status?: string;
    port?: number;
  }>;
}

interface RawDependencies {
  dependencies?: Array<{
    id: string;
    type?: string;
    description?: string;
    blocking?: boolean;
    status?: string;
    impact?: string;
  }>;
}

// ============================================================================
// Cache Implementation
// ============================================================================

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
}

// ============================================================================
// Platform Context Adapter
// ============================================================================

/**
 * Reads .roadmap/ canonical JSON files and maps to universal types.
 *
 * @example
 * ```typescript
 * const adapter = new PlatformContextAdapter();
 * await adapter.initialize();
 *
 * const workUnits = await adapter.getWorkUnits({ status: ['active'] });
 * const decisions = await adapter.getDecisions({ impact: ['high', 'critical'] });
 * const health = await adapter.computeHealthAssessment();
 * ```
 */
export class PlatformContextAdapter implements IContextAdapter {
  private readonly domain: DomainContext = {
    domainId: 'platform',
    domainName: 'Ectropy Platform Development',
    domainVersion: '1.0.0',
  };

  private readonly enableCache: boolean;
  private readonly cacheTTL: number;

  private currentTruthCache: CacheEntry<RawCurrentTruth> | null = null;
  private roadmapCache: CacheEntry<RawRoadmap> | null = null;
  private decisionLogCache: CacheEntry<RawDecisionLog> | null = null;
  private architectureCache: CacheEntry<RawArchitecture> | null = null;
  private dependenciesCache: CacheEntry<RawDependencies> | null = null;
  private previousMetrics: IHealthMetric[] | undefined;

  constructor(config?: ContextAdapterConfig) {
    this.enableCache = config?.enableCache ?? true;
    this.cacheTTL = config?.cacheTTL ?? 300_000; // 5 minutes default
  }

  // ==========================================================================
  // IContextAdapter: Identity
  // ==========================================================================

  getDomainContext(): DomainContext {
    return this.domain;
  }

  // ==========================================================================
  // IContextAdapter: Work Units
  // ==========================================================================

  async getWorkUnits(filter?: WorkUnitFilter): Promise<IWorkUnit[]> {
    const roadmap = this.loadRoadmap();
    const workUnits: IWorkUnit[] = [];

    for (const [quarterId, quarter] of Object.entries(roadmap.quarters)) {
      if (!quarter.deliverables) {
        continue;
      }

      for (const deliverable of quarter.deliverables) {
        const workUnit = this.mapDeliverableToWorkUnit(deliverable, quarterId);
        workUnits.push(workUnit);
      }
    }

    return this.applyWorkUnitFilter(workUnits, filter);
  }

  async getWorkUnit(id: string): Promise<IWorkUnit | null> {
    const all = await this.getWorkUnits();
    return all.find((wu) => wu.id === id) ?? null;
  }

  // ==========================================================================
  // IContextAdapter: Decisions
  // ==========================================================================

  async getDecisions(filter?: DecisionFilter): Promise<IDecision[]> {
    const log = this.loadDecisionLog();
    const decisions = log.decisions.map((d) => this.mapRawDecision(d));
    return this.applyDecisionFilter(decisions, filter);
  }

  async getDecision(id: string): Promise<IDecision | null> {
    const all = await this.getDecisions();
    return all.find((d) => d.id === id) ?? null;
  }

  // ==========================================================================
  // IContextAdapter: Dependencies
  // ==========================================================================

  async getDependencies(entityId: string): Promise<IDependency[]> {
    const deps: IDependency[] = [];

    // Service dependencies from architecture.json
    const arch = this.loadArchitecture();
    if (arch.services) {
      for (const service of arch.services) {
        if (service.serviceId === entityId && service.dependencies) {
          for (const depId of service.dependencies) {
            deps.push({
              id: `${service.serviceId}→${depId}`,
              domain: this.domain,
              sourceId: service.serviceId,
              targetId: depId,
              type: 'depends-on',
              isCritical: true,
              status: 'satisfied',
              metadata: { source: 'architecture.json' },
            });
          }
        }
      }
    }

    // External dependencies from dependencies.json
    const external = this.loadDependencies();
    if (external.dependencies) {
      for (const dep of external.dependencies) {
        if (dep.id === entityId || dep.description?.includes(entityId)) {
          deps.push({
            id: dep.id,
            domain: this.domain,
            sourceId: entityId,
            targetId: dep.id,
            type: 'depends-on',
            isCritical: dep.blocking ?? false,
            status: this.mapDependencyStatus(dep.status),
            description: dep.description,
            metadata: {
              type: dep.type,
              impact: dep.impact,
              source: 'dependencies.json',
            },
          });
        }
      }
    }

    // Node dependencies from current-truth.json
    const truth = this.loadCurrentTruth();
    const node = truth.nodes.find((n) => n.nodeId === entityId);
    if (node?.relationships?.dependencies) {
      for (const depId of node.relationships.dependencies) {
        deps.push({
          id: `${entityId}→${depId}`,
          domain: this.domain,
          sourceId: entityId,
          targetId: depId,
          type: 'depends-on',
          isCritical: false,
          status: 'satisfied',
          metadata: { source: 'current-truth.json' },
        });
      }
    }

    return deps;
  }

  // ==========================================================================
  // IContextAdapter: State Nodes
  // ==========================================================================

  async getStateNodes(filter?: StateNodeFilter): Promise<IStateNode[]> {
    const truth = this.loadCurrentTruth();
    const nodes = truth.nodes.map((n) => this.mapRawNode(n));
    return this.applyStateNodeFilter(nodes, filter);
  }

  async getStateNode(id: string): Promise<IStateNode | null> {
    const all = await this.getStateNodes();
    return all.find((n) => n.id === id) ?? null;
  }

  // ==========================================================================
  // IContextAdapter: Containers
  // ==========================================================================

  async getContainers(): Promise<IContainer[]> {
    const roadmap = this.loadRoadmap();
    const containers: IContainer[] = [];

    for (const [quarterId, quarter] of Object.entries(roadmap.quarters)) {
      containers.push(this.mapQuarterToContainer(quarterId, quarter));
    }

    return containers;
  }

  async getActiveContainer(): Promise<IContainer | null> {
    const containers = await this.getContainers();
    return containers.find((c) => c.status === 'active') ?? null;
  }

  // ==========================================================================
  // IContextAdapter: Authority
  // ==========================================================================

  async getAuthorityCascade(): Promise<IAuthorityCascade> {
    return createPlatformAuthorityCascade(this.domain);
  }

  // ==========================================================================
  // IContextAdapter: Health & Eigenmodes
  // ==========================================================================

  async computeHealthAssessment(): Promise<IHealthAssessment> {
    const inputs = this.gatherMetricInputs();
    const metrics = computeAllMetrics(inputs, this.previousMetrics);
    this.previousMetrics = metrics;
    return computeHealthAssessment(this.domain, metrics);
  }

  async computeEigenmodeVector(): Promise<EigenmodeVector> {
    const inputs = this.gatherMetricInputs();
    const metrics = computeAllMetrics(inputs, this.previousMetrics);
    this.previousMetrics = metrics;
    return metricsToEigenmodeVector(metrics);
  }

  async computeMetric(metricId: string): Promise<IHealthMetric | null> {
    const inputs = this.gatherMetricInputs();
    const metrics = computeAllMetrics(inputs, this.previousMetrics);
    return metrics.find((m) => m.id === metricId) ?? null;
  }

  // ==========================================================================
  // IContextAdapter: Work Prioritization
  // ==========================================================================

  async getWorkRecommendations(
    limit: number = 5
  ): Promise<IWorkRecommendation[]> {
    const workUnits = await this.getWorkUnits({ status: ['active'] });
    const decisions = await this.getDecisions();
    const health = await this.computeHealthAssessment();

    const recommendations: IWorkRecommendation[] = [];

    for (const wu of workUnits) {
      const blockers = await this.getDependencies(wu.id);
      const activeBlockers = blockers.filter((d) => d.status === 'pending');

      // Find related decisions
      const related = decisions.filter(
        (d) =>
          d.impactedWorkUnitIds.includes(wu.id) ||
          d.tags.some((t) => wu.metadata.featureId === t)
      );

      // Priority scoring
      let priority = 0;

      // Higher progress = closer to done = higher priority
      priority += wu.progress * 0.3;

      // Fewer blockers = more actionable
      priority += activeBlockers.length === 0 ? 0.3 : 0;

      // Has decisions backing it = more validated
      priority += related.length > 0 ? 0.2 : 0;

      // Lower health metrics in related areas = more urgent
      const relevantMetrics = health.metrics.filter(
        (m) => m.value < m.healthyThreshold
      );
      priority += relevantMetrics.length > 0 ? 0.2 : 0;

      recommendations.push({
        workUnit: wu,
        priority: Math.min(1, priority),
        rationale: this.buildRecommendationRationale(
          wu,
          activeBlockers,
          related,
          relevantMetrics
        ),
        blockers: activeBlockers,
        relatedDecisions: related,
        relevantMetrics,
      });
    }

    // Sort by priority descending
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations.slice(0, limit);
  }

  // ==========================================================================
  // IContextAdapter: Lifecycle
  // ==========================================================================

  async initialize(): Promise<void> {
    // Validate that data files exist
    const requiredFiles = [
      DATA_FILES.currentTruth,
      DATA_FILES.roadmap,
      DATA_FILES.decisionLog,
    ];

    const missing = requiredFiles.filter((f) => !existsSync(f));
    if (missing.length > 0) {
      throw new Error(
        `PlatformContextAdapter: Missing required data files: ${missing.join(', ')}`
      );
    }

    // Warm the cache
    this.loadCurrentTruth();
    this.loadRoadmap();
    this.loadDecisionLog();
  }

  async healthCheck(): Promise<AdapterHealthStatus> {
    const start = Date.now();

    try {
      const truth = this.loadCurrentTruth();
      const roadmap = this.loadRoadmap();
      const log = this.loadDecisionLog();

      const deliverableCount = Object.values(roadmap.quarters).reduce(
        (sum, q) => sum + (q.deliverables?.length ?? 0),
        0
      );

      return {
        healthy: true,
        source: 'platform (.roadmap/ JSON files)',
        lastDataRead: new Date().toISOString(),
        latencyMs: Date.now() - start,
        entityCounts: {
          workUnits: deliverableCount,
          decisions: log.decisions.length,
          stateNodes: truth.nodes.length,
          containers: Object.keys(roadmap.quarters).length,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        source: 'platform (.roadmap/ JSON files)',
        latencyMs: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  clearCache(): void {
    this.currentTruthCache = null;
    this.roadmapCache = null;
    this.decisionLogCache = null;
    this.architectureCache = null;
    this.dependenciesCache = null;
  }

  // ==========================================================================
  // Private: File Loading with Caching
  // ==========================================================================

  private loadJSON<T>(filePath: string): T {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }

  private isCacheValid<T>(cache: CacheEntry<T> | null): cache is CacheEntry<T> {
    if (!this.enableCache || !cache) {
      return false;
    }
    return Date.now() - cache.loadedAt < this.cacheTTL;
  }

  private loadCurrentTruth(): RawCurrentTruth {
    if (this.isCacheValid(this.currentTruthCache)) {
      return this.currentTruthCache.data;
    }
    const data = this.loadJSON<RawCurrentTruth>(DATA_FILES.currentTruth);
    this.currentTruthCache = { data, loadedAt: Date.now() };
    return data;
  }

  private loadRoadmap(): RawRoadmap {
    if (this.isCacheValid(this.roadmapCache)) {
      return this.roadmapCache.data;
    }
    const data = this.loadJSON<RawRoadmap>(DATA_FILES.roadmap);
    this.roadmapCache = { data, loadedAt: Date.now() };
    return data;
  }

  private loadDecisionLog(): RawDecisionLog {
    if (this.isCacheValid(this.decisionLogCache)) {
      return this.decisionLogCache.data;
    }
    const data = this.loadJSON<RawDecisionLog>(DATA_FILES.decisionLog);
    this.decisionLogCache = { data, loadedAt: Date.now() };
    return data;
  }

  private loadArchitecture(): RawArchitecture {
    if (this.isCacheValid(this.architectureCache)) {
      return this.architectureCache.data;
    }
    const filePath = DATA_FILES.architecture;
    if (!existsSync(filePath)) {
      return { services: [] };
    }
    const data = this.loadJSON<RawArchitecture>(filePath);
    this.architectureCache = { data, loadedAt: Date.now() };
    return data;
  }

  private loadDependencies(): RawDependencies {
    if (this.isCacheValid(this.dependenciesCache)) {
      return this.dependenciesCache.data;
    }
    const filePath = DATA_FILES.dependencies;
    if (!existsSync(filePath)) {
      return { dependencies: [] };
    }
    const data = this.loadJSON<RawDependencies>(filePath);
    this.dependenciesCache = { data, loadedAt: Date.now() };
    return data;
  }

  // ==========================================================================
  // Private: Mapping Functions
  // ==========================================================================

  private mapDeliverableToWorkUnit(
    raw: RawDeliverable,
    containerId: string
  ): IWorkUnit {
    const progressStr = raw.progress?.replace('%', '') ?? '0';
    const progress = parseInt(progressStr, 10) / 100;

    return {
      id: raw.id,
      urn: raw.$id,
      domain: this.domain,
      title: raw.name,
      description: raw.progressNote,
      status: this.mapDeliverableStatus(raw.status),
      progress: isNaN(progress) ? 0 : progress,
      owner: raw.owner,
      containerId,
      dependencyIds: [],
      blockingIds: [],
      metadata: {
        type: raw.type,
        featureId: raw.featureId,
        targetReleaseId: raw.targetReleaseId,
        value: raw.value,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      targetDate: raw.targetDate,
    };
  }

  private mapRawDecision(raw: RawDecision): IDecision {
    const alternatives: IDecisionAlternative[] = (raw.alternatives ?? []).map(
      (alt) => ({
        title: alt.option ?? alt.title ?? 'Unnamed',
        description: alt.description ?? '',
        pros: alt.pros ?? [],
        cons: alt.cons ?? [],
        selected: alt.selected ?? false,
        rejectionReason: alt.rejectionReason,
      })
    );

    const approvedBy = Array.isArray(raw.approvedBy)
      ? raw.approvedBy[0]
      : raw.approvedBy;

    return {
      id: raw.decisionId,
      urn: raw.$id,
      domain: this.domain,
      title: raw.title,
      context: raw.context ?? '',
      resolution: raw.decision ?? '',
      rationale: raw.rationale ?? '',
      status: this.mapDecisionStatus(raw.status),
      impact: this.mapImpactLevel(raw.impact),
      proposedBy: raw.proposedBy ?? 'unknown',
      approvedBy,
      alternatives,
      relatedDecisionIds: raw.relatedDecisions ?? [],
      impactedWorkUnitIds: [
        ...(raw.impactedDeliverables ?? []),
        ...(raw.impactedServices ?? []),
      ],
      evidence: raw.evidence ?? [],
      tags: raw.tags ?? [],
      category: raw.category ?? 'uncategorized',
      createdAt: raw.timestamp ?? new Date().toISOString(),
      updatedAt:
        raw.implementedDate ?? raw.timestamp ?? new Date().toISOString(),
      graphMetadata: raw.graphMetadata,
    };
  }

  private mapRawNode(raw: RawNode): IStateNode {
    const nodeType = raw.nodeType ?? raw.type ?? 'unknown';

    return {
      id: raw.nodeId,
      urn: raw.$id,
      domain: this.domain,
      title: raw.title,
      nodeType,
      status: this.mapNodeStatus(raw.status),
      phase: (raw.metadata?.phase as string) ?? undefined,
      content: raw.content ?? {},
      metadata: raw.metadata ?? {},
      relationships: {
        dependencies: raw.relationships?.dependencies ?? [],
        triggers: raw.relationships?.triggers ?? [],
        relatedNodes: raw.relationships?.relatedNodes ?? [],
        evidence: raw.relationships?.evidence ?? [],
      },
      createdAt: raw.timestamp ?? new Date().toISOString(),
      updatedAt: raw.timestamp ?? new Date().toISOString(),
      graphMetadata: raw.graphMetadata,
    };
  }

  private mapQuarterToContainer(
    quarterId: string,
    raw: RawQuarter
  ): IContainer {
    const milestones: IMilestone[] = (raw.milestones ?? []).map((m, i) => ({
      id: m.id || `${quarterId}-ms-${i}`,
      name: m.event,
      targetDate: m.date,
      isGate: m.gate ?? false,
      isCritical: m.critical ?? false,
      status: this.mapMilestoneStatus(m.status),
      metadata: { type: m.type },
    }));

    const workUnitIds = (raw.deliverables ?? []).map((d) => d.id);

    return {
      id: quarterId,
      domain: this.domain,
      name: raw.focus,
      description: raw.theme,
      status: this.mapContainerStatus(raw.status),
      workUnitIds,
      milestones,
      metadata: { metrics: raw.metrics },
    };
  }

  // ==========================================================================
  // Private: Status Mapping
  // ==========================================================================

  private mapDeliverableStatus(status: string): UniversalStatus {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');
    const statusMap: Record<string, UniversalStatus> = {
      complete: 'completed',
      completed: 'completed',
      inprogress: 'active',
      planned: 'planned',
      onhold: 'on-hold',
      deferred: 'on-hold',
      blocked: 'blocked',
      cancelled: 'cancelled',
    };
    return statusMap[normalized] ?? 'planned';
  }

  private mapDecisionStatus(status: string): UniversalStatus {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');
    const statusMap: Record<string, UniversalStatus> = {
      implemented: 'completed',
      approved: 'completed',
      proposed: 'planned',
      planned: 'planned',
      rejected: 'cancelled',
      deprecated: 'cancelled',
      onhold: 'on-hold',
      underreview: 'active',
    };
    return statusMap[normalized] ?? 'planned';
  }

  private mapNodeStatus(status: string): UniversalStatus {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');
    const statusMap: Record<string, UniversalStatus> = {
      completed: 'completed',
      active: 'active',
      inprogress: 'active',
      planned: 'planned',
      archived: 'completed',
      deprecated: 'cancelled',
      blocked: 'blocked',
      onhold: 'on-hold',
    };
    return statusMap[normalized] ?? 'planned';
  }

  private mapMilestoneStatus(status: string): UniversalStatus {
    if (!status) {
      return 'planned';
    }
    const normalized = status.toLowerCase().replace(/[_-]/g, '');
    const statusMap: Record<string, UniversalStatus> = {
      complete: 'completed',
      completed: 'completed',
      planned: 'planned',
      deferred: 'on-hold',
      inprogress: 'active',
      blocked: 'blocked',
      cancelled: 'cancelled',
    };
    return statusMap[normalized] ?? 'planned';
  }

  private mapContainerStatus(status: string): UniversalStatus {
    const normalized = status.toLowerCase().replace(/[_-]/g, '');
    const statusMap: Record<string, UniversalStatus> = {
      active: 'active',
      complete: 'completed',
      completed: 'completed',
      planned: 'planned',
    };
    return statusMap[normalized] ?? 'planned';
  }

  private mapImpactLevel(impact: string | undefined): ImpactLevel {
    if (!impact) {
      return 'medium';
    }
    const normalized = impact.toLowerCase();
    if (normalized === 'critical') {
      return 'critical';
    }
    if (normalized === 'high') {
      return 'high';
    }
    if (normalized === 'low') {
      return 'low';
    }
    return 'medium';
  }

  private mapDependencyStatus(
    status: string | undefined
  ): 'satisfied' | 'pending' | 'violated' | 'waived' {
    if (!status) {
      return 'pending';
    }
    const normalized = status.toLowerCase();
    if (normalized === 'available' || normalized === 'resolved') {
      return 'satisfied';
    }
    if (normalized === 'pending' || normalized === 'planned') {
      return 'pending';
    }
    if (normalized === 'blocked') {
      return 'violated';
    }
    return 'pending';
  }

  // ==========================================================================
  // Private: Filters
  // ==========================================================================

  private applyWorkUnitFilter(
    units: IWorkUnit[],
    filter?: WorkUnitFilter
  ): IWorkUnit[] {
    if (!filter) {
      return units;
    }

    return units.filter((wu) => {
      if (filter.status && !filter.status.includes(wu.status)) {
        return false;
      }
      if (filter.containerId && wu.containerId !== filter.containerId) {
        return false;
      }
      if (filter.owner && wu.owner !== filter.owner) {
        return false;
      }
      if (filter.tags) {
        const wuTags = (wu.metadata.tags as string[]) ?? [];
        if (!filter.tags.some((t) => wuTags.includes(t))) {
          return false;
        }
      }
      if (filter.hasBlockers !== undefined) {
        const hasBlockers = wu.dependencyIds.length > 0;
        if (filter.hasBlockers !== hasBlockers) {
          return false;
        }
      }
      return true;
    });
  }

  private applyDecisionFilter(
    decisions: IDecision[],
    filter?: DecisionFilter
  ): IDecision[] {
    if (!filter) {
      return decisions;
    }

    return decisions.filter((d) => {
      if (filter.status && !filter.status.includes(d.status)) {
        return false;
      }
      if (filter.category && d.category !== filter.category) {
        return false;
      }
      if (filter.impact && !filter.impact.includes(d.impact)) {
        return false;
      }
      if (filter.tags && !filter.tags.some((t) => d.tags.includes(t))) {
        return false;
      }
      if (filter.proposedBy && d.proposedBy !== filter.proposedBy) {
        return false;
      }
      return true;
    });
  }

  private applyStateNodeFilter(
    nodes: IStateNode[],
    filter?: StateNodeFilter
  ): IStateNode[] {
    if (!filter) {
      return nodes;
    }

    return nodes.filter((n) => {
      if (filter.nodeType && !filter.nodeType.includes(n.nodeType)) {
        return false;
      }
      if (filter.status && !filter.status.includes(n.status)) {
        return false;
      }
      if (filter.phase && n.phase !== filter.phase) {
        return false;
      }
      if (filter.tags) {
        const nodeTags = (n.metadata.tags as string[]) ?? [];
        if (!filter.tags.some((t) => nodeTags.includes(t))) {
          return false;
        }
      }
      return true;
    });
  }

  // ==========================================================================
  // Private: Metric Input Gathering
  // ==========================================================================

  private gatherMetricInputs(): PlatformMetricInputs {
    const truth = this.loadCurrentTruth();
    const roadmap = this.loadRoadmap();
    const ps = truth.platformState;

    // Extract CI metrics from roadmap if available
    const ciMetrics = roadmap.cicd_metrics as
      | Record<string, unknown>
      | undefined;

    return {
      tsErrorCount: 0, // All resolved (commit c9d26157)
      tsProjectCount: 9,
      testPassRate: (ciMetrics?.testPassRate as number) ?? 0.85,
      testCoverage: (ciMetrics?.testCoverage as number) ?? 0.6,
      deprecatedCodeCount: 3, // Known: envalid, speckle token, legacy config
      todoCount: 10, // Estimate from codebase
      outdatedDependencyCount: 5, // Moderate estimate
      totalDependencyCount: 200, // Approximate
      securityAdvisoryCount: 0,
      ciBuildSuccessRate: (ciMetrics?.buildSuccessRate as number) ?? 0.85,
      flakyTestRate: 0.05,
      deploysPerWeek: 3,
      targetDeploysPerWeek: 5,
      documentationCompleteness: 0.7,
      breakingChangeCount: 0,
      productionReadinessScore: ps.productionReadinessScore ?? 92,
      typeSafetyScore: ps.typeSafetyScore ?? 100,
      completedDeliverables: ps.progress.completedDeliverables,
      totalDeliverables: ps.progress.totalDeliverables,
      activeWorkstreams: ps.progress.activeWorkstreams,
    };
  }

  // ==========================================================================
  // Private: Recommendation Rationale
  // ==========================================================================

  private buildRecommendationRationale(
    wu: IWorkUnit,
    blockers: IDependency[],
    decisions: IDecision[],
    urgentMetrics: IHealthMetric[]
  ): string {
    const parts: string[] = [];

    if (wu.progress > 0.5) {
      parts.push(
        `${Math.round(wu.progress * 100)}% complete — near finish line`
      );
    }

    if (blockers.length === 0) {
      parts.push('no blockers — ready to proceed');
    } else {
      parts.push(`${blockers.length} pending dependency(ies)`);
    }

    if (decisions.length > 0) {
      parts.push(`${decisions.length} decision(s) provide context`);
    }

    if (urgentMetrics.length > 0) {
      const metricNames = urgentMetrics.map((m) => m.name).join(', ');
      parts.push(`health concern(s): ${metricNames}`);
    }

    return parts.join('; ') || 'Standard priority';
  }
}
