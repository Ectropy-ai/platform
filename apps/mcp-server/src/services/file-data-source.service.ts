/**
 * File-Based Data Source Implementation
 *
 * Reads data from JSON files with intelligent caching.
 * Production-ready implementation with error handling and performance optimization.
 *
 * V3 Migration (2026-01-07): Added support for V3 graph metadata and URN lookups.
 *
 * Features:
 * - In-memory caching with TTL
 * - Atomic file operations
 * - Proper error handling
 * - Performance monitoring
 * - Environment-aware path resolution
 * - V3 URN-based entity lookups
 * - Graph edge traversal
 *
 * Future: Replace with PgVectorDataSource for database storage.
 */

import { readFileSync, writeFileSync } from 'fs';
import { DATA_CONFIG } from '../config/data-paths.config.js';
import type {
  DataSource,
  Decision,
  DecisionLog,
  Vote,
  VotesCollection,
  Server,
  Service,
  Port,
  Workflow,
  InfrastructureCatalog,
  Node,
  CurrentTruth,
  Phase,
  RoadmapDeliverable,
  URN,
  EdgeType,
} from './data-source.interface.js';

// ============================================================================
// Cache Entry Type
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ============================================================================
// FileDataSource Implementation
// ============================================================================

export class FileDataSource implements DataSource {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly enableCache: boolean;
  private readonly cacheTTL: number;

  constructor(config?: { enableCache?: boolean; cacheTTL?: number }) {
    this.enableCache = config?.enableCache ?? DATA_CONFIG.features.enableCache;
    this.cacheTTL = config?.cacheTTL ?? DATA_CONFIG.features.cacheTTL;

    if (this.enableCache) {
      console.log(
        `📦 FileDataSource initialized with caching (TTL: ${this.cacheTTL}ms)`
      );
    }

    // Log V3 configuration
    console.log(`📂 FileDataSource V3 paths:`);
    console.log(`   - Decision Log: ${DATA_CONFIG.files.decisionLog}`);
    console.log(`   - Current Truth: ${DATA_CONFIG.files.currentTruth}`);
    console.log(`   - Votes: ${DATA_CONFIG.files.votes}`);
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Read and parse JSON file with caching
   */
  private readJSON<T>(filePath: string, cacheKey: string): T {
    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data as T;
      }
    }

    // Read from file
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as T;

      // Update cache
      if (this.enableCache) {
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl: this.cacheTTL,
        });
      }

      return data;
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to read JSON file: ${filePath}\nError: ${err.message}`
      );
    }
  }

  /**
   * Write JSON file atomically
   */
  private writeJSON<T>(filePath: string, data: T, cacheKey: string): void {
    try {
      const content = JSON.stringify(data, null, 2);
      writeFileSync(filePath, content, 'utf-8');

      // Update cache
      if (this.enableCache) {
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl: this.cacheTTL,
        });
      }
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to write JSON file: ${filePath}\nError: ${err.message}`
      );
    }
  }

  /**
   * Load decision log data
   */
  private loadDecisionLog(): DecisionLog {
    return this.readJSON<DecisionLog>(
      DATA_CONFIG.files.decisionLog,
      'decision-log'
    );
  }

  /**
   * Load votes data
   */
  private loadVotes(): VotesCollection {
    return this.readJSON<VotesCollection>(DATA_CONFIG.files.votes, 'votes');
  }

  /**
   * Save votes data
   */
  private saveVotes(data: VotesCollection): void {
    this.writeJSON(DATA_CONFIG.files.votes, data, 'votes');
  }

  /**
   * Load infrastructure catalog data
   *
   * Transforms the V2 nested JSON structure (catalog.environments[].servers,
   * catalog.services, catalog.ports as object) into the flat InfrastructureCatalog
   * interface the resolvers expect (servers[], services[], ports[], workflows[]).
   */
  private loadInfrastructure(): InfrastructureCatalog {
    const raw = this.readJSON<any>(
      DATA_CONFIG.files.infrastructureCatalog,
      'infrastructure-raw'
    );

    // Check cache for transformed data
    if (this.enableCache) {
      const cached = this.cache.get('infrastructure');
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data as InfrastructureCatalog;
      }
    }

    const catalog = raw.catalog || raw;

    // Transform servers: flatten from environments[].servers[]
    // Environment context comes from the parent environment object, not the server itself
    const servers: Server[] = [];
    if (catalog.environments) {
      for (const env of catalog.environments) {
        if (env.servers) {
          for (const s of env.servers) {
            const hardware = s.specs ||
              s.hardware || { cpu: '', memory: '', storage: '' };
            servers.push({
              serverId: s.id || s.serverId,
              name: s.name,
              ipAddress: s.ipAddress || s.ip || undefined,
              provider: s.provider || 'unknown',
              region: s.region || 'unknown',
              status: s.status || 'active',
              services: s.services || [],
              specs: {
                cpu: hardware.cpu || '',
                memory: hardware.memory || '',
                storage: hardware.storage || '',
              },
              monitoring: s.monitoring || {
                healthCheck: '',
                metricsEndpoint: '',
              },
              tags: s.tags || [env.type || env.name],
              // Extra field for GraphQL schema (not in TypeScript interface but accessible at runtime)
              environment: env.type || env.name || 'unknown',
            } as Server);
          }
        }
      }
    }

    // Transform services: map id → serviceId, normalize ports
    const services: Service[] = (catalog.services || []).map((s: any) => ({
      serviceId: s.id || s.serviceId,
      name: s.name,
      type: s.type || 'unknown',
      version: s.version || '',
      status: s.status || 'unknown',
      serverId: s.serverId || '',
      port:
        typeof s.ports === 'object' && s.ports !== null
          ? s.ports.internal || s.ports.external || 0
          : Array.isArray(s.ports)
            ? s.ports[0]
            : s.ports || 0,
      healthCheck:
        typeof s.healthCheck === 'object'
          ? s.healthCheck.endpoint || ''
          : s.healthCheck || '',
      dependencies: s.dependencies || [],
      repository: s.repository,
      documentation: s.documentation,
      tags: s.tags || [],
    }));

    // Transform ports: convert object keyed by service to Port[]
    const ports: Port[] = [];
    if (
      catalog.ports &&
      typeof catalog.ports === 'object' &&
      !Array.isArray(catalog.ports)
    ) {
      for (const [serviceId, portData] of Object.entries(
        catalog.ports as Record<string, any>
      )) {
        const portNum =
          portData.development || portData.staging || portData.production;
        if (portNum) {
          ports.push({
            number: portNum,
            protocol: 'tcp',
            service: serviceId,
            description: portData.description || serviceId,
            public: portData.production !== undefined,
          });
        }
      }
    } else if (Array.isArray(catalog.ports)) {
      ports.push(...catalog.ports);
    }

    // Workflows (pass through if present)
    const workflows = catalog.workflows || [];

    const result: InfrastructureCatalog = {
      version: raw.version || '2.0.0',
      lastUpdated: raw.lastUpdated || new Date().toISOString(),
      servers,
      services,
      ports,
      workflows,
    };

    // Cache the transformed result
    if (this.enableCache) {
      this.cache.set('infrastructure', {
        data: result,
        timestamp: Date.now(),
        ttl: this.cacheTTL,
      });
    }

    return result;
  }

  /**
   * Load current truth data
   *
   * Normalizes varied node structures to the interface contract.
   * Older nodes use different field names (type vs nodeType, summary vs content.summary)
   * and may lack relationships or standard metadata fields.
   */
  private loadCurrentTruth(): CurrentTruth {
    const raw = this.readJSON<any>(
      DATA_CONFIG.files.currentTruth,
      'current-truth-raw'
    );

    // Check cache for normalized data
    if (this.enableCache) {
      const cached = this.cache.get('current-truth');
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data as CurrentTruth;
      }
    }

    const nodes: Node[] = (raw.nodes || []).map((n: any, index: number) => ({
      $id: n.$id,
      graphMetadata: n.graphMetadata,
      nodeId: n.nodeId,
      title: n.title || '',
      nodeType: n.nodeType || n.type || 'unknown',
      status: n.status || 'unknown',
      phase: n.metadata?.phase || n.phase || '',
      path: n.path,
      description: n.description || n.summary || '',
      owner: n.metadata?.author || n.owner,
      createdAt: n.timestamp || n.createdAt || '',
      lastModified: n.lastVerified || n.lastModified || n.timestamp || '',
      relationships: {
        dependsOn: n.relationships?.dependsOn || n.dependencies || [],
        blockedBy: n.relationships?.blockedBy || [],
        relatedTo:
          n.relationships?.relatedTo ||
          n.relatedNodes ||
          n.relatedDecisions ||
          [],
      },
      metadata: {
        author: n.metadata?.author || n.owner || null,
        phase: n.metadata?.phase || n.phase || null,
        priority: n.metadata?.priority || null,
        tags: n.metadata?.tags || [],
        estimatedEffort: n.metadata?.estimatedEffort || null,
        category: n.metadata?.category || n.category || null,
      },
      evidence: n.evidence || n.content?.evidence || [],
      tags: n.metadata?.tags || n.tags || [],
      index,
    }));

    const result: CurrentTruth = {
      version: raw.schemaVersion || raw.version || '2.0.0',
      lastUpdated: raw.lastUpdated || new Date().toISOString(),
      nodes,
      indexes: raw.indexes,
    };

    // Cache normalized result
    if (this.enableCache) {
      this.cache.set('current-truth', {
        data: result,
        timestamp: Date.now(),
        ttl: this.cacheTTL,
      });
    }

    return result;
  }

  /**
   * Parse URN to extract venture, nodeType, and identifier
   * Pattern: urn:luhtech:{venture}:{nodeType}:{identifier}
   */
  private parseURN(
    urn: URN
  ): { venture: string; nodeType: string; identifier: string } | null {
    const match = urn.match(/^urn:luhtech:([^:]+):([^:]+):(.+)$/);
    if (!match) {
      return null;
    }
    return {
      venture: match[1],
      nodeType: match[2],
      identifier: match[3],
    };
  }

  // ==========================================================================
  // V3 Graph Operations
  // ==========================================================================

  /**
   * Get entity by URN identifier
   * Supports cross-type lookups using URN pattern
   */
  async getByURN(urn: URN): Promise<Decision | Node | Vote | null> {
    const parsed = this.parseURN(urn);
    if (!parsed) {
      console.warn(`⚠️ Invalid URN format: ${urn}`);
      return null;
    }

    const { nodeType, identifier } = parsed;

    switch (nodeType) {
      case 'decision':
      case 'pm-decision': {
        // Look up in decision log
        const decisionLog = this.loadDecisionLog();
        // Try matching by $id URN first, then by decisionId
        return (
          decisionLog.decisions.find(
            (d) => d.$id === urn || d.decisionId === identifier
          ) || null
        );
      }

      case 'node':
      case 'deliverable':
      case 'workstream': {
        // Look up in current truth
        const currentTruth = this.loadCurrentTruth();
        return (
          currentTruth.nodes.find(
            (n) => n.$id === urn || n.nodeId === identifier
          ) || null
        );
      }

      case 'vote': {
        // Look up in votes
        const votes = this.loadVotes();
        return (
          votes.votes.find((v) => v.$id === urn || v.voteId === identifier) ||
          null
        );
      }

      default:
        console.warn(`⚠️ Unknown node type in URN: ${nodeType}`);
        return null;
    }
  }

  /**
   * Get related entities by URN using graph edges
   * Traverses inEdges and outEdges for relationship discovery
   */
  async getRelatedByURN(
    urn: URN,
    edgeType?: EdgeType
  ): Promise<Array<Decision | Node | Vote>> {
    const entity = await this.getByURN(urn);
    if (!entity || !entity.graphMetadata) {
      return [];
    }

    const relatedURNs = [
      ...(entity.graphMetadata.inEdges || []),
      ...(entity.graphMetadata.outEdges || []),
    ];

    // If edgeType specified, filter by edge type in edges array
    if (edgeType && entity.graphMetadata.edges) {
      const filteredURNs = entity.graphMetadata.edges
        .filter((e) => e.type === edgeType)
        .flatMap((e) => [e.from, e.to])
        .filter((u) => u !== urn);

      const results: Array<Decision | Node | Vote> = [];
      for (const relatedURN of filteredURNs) {
        const related = await this.getByURN(relatedURN);
        if (related) {
          results.push(related);
        }
      }
      return results;
    }

    // Return all related entities
    const results: Array<Decision | Node | Vote> = [];
    for (const relatedURN of relatedURNs) {
      const related = await this.getByURN(relatedURN);
      if (related) {
        results.push(related);
      }
    }
    return results;
  }

  // ==========================================================================
  // Decision Log Operations
  // ==========================================================================

  async getDecisions(filters?: {
    status?: Decision['status'];
    category?: string;
    impact?: Decision['impact'];
    tags?: string[];
  }): Promise<Decision[]> {
    const data = this.loadDecisionLog();
    let decisions = data.decisions;

    // Apply filters
    if (filters) {
      if (filters.status) {
        decisions = decisions.filter((d) => d.status === filters.status);
      }
      if (filters.category) {
        decisions = decisions.filter((d) => d.category === filters.category);
      }
      if (filters.impact) {
        decisions = decisions.filter((d) => d.impact === filters.impact);
      }
      if (filters.tags && filters.tags.length > 0) {
        decisions = decisions.filter((d) =>
          filters.tags!.some((tag) => d.tags.includes(tag))
        );
      }
    }

    return decisions;
  }

  async getDecision(decisionId: string): Promise<Decision | null> {
    const data = this.loadDecisionLog();

    // V3: Support both decisionId and URN lookups
    return (
      data.decisions.find(
        (d) => d.decisionId === decisionId || d.$id === decisionId
      ) || null
    );
  }

  async getSupersededDecisions(decisionId: string): Promise<Decision[]> {
    const data = this.loadDecisionLog();
    return data.decisions.filter((d) => d.supersededBy === decisionId);
  }

  async getSupersedesDecisions(decisionId: string): Promise<Decision[]> {
    const data = this.loadDecisionLog();
    const decision = data.decisions.find((d) => d.decisionId === decisionId);
    if (!decision || !decision.supersedes) {
      return [];
    }
    const superseded = data.decisions.find(
      (d) => d.decisionId === decision.supersedes
    );
    return superseded ? [superseded] : [];
  }

  async getRelatedDecisions(decisionId: string): Promise<Decision[]> {
    const data = this.loadDecisionLog();
    const decision = data.decisions.find((d) => d.decisionId === decisionId);
    if (!decision) {
      return [];
    }

    // V3: Also check graphMetadata edges
    let relatedIds = [...decision.relatedDecisions];

    if (decision.graphMetadata) {
      const edgeIds = [
        ...(decision.graphMetadata.inEdges || []),
        ...(decision.graphMetadata.outEdges || []),
      ].filter((urn) => urn.includes(':decision:'));
      relatedIds = [...new Set([...relatedIds, ...edgeIds])];
    }

    return data.decisions.filter(
      (d) =>
        relatedIds.includes(d.decisionId) || relatedIds.includes(d.$id || '')
    );
  }

  // ==========================================================================
  // Votes Operations
  // ==========================================================================

  async getVotes(): Promise<Vote[]> {
    const data = this.loadVotes();
    return data.votes;
  }

  async getVote(voteId: string): Promise<Vote | null> {
    const data = this.loadVotes();
    return data.votes.find((v) => v.voteId === voteId) || null;
  }

  async createVote(vote: Omit<Vote, 'voteId'>): Promise<Vote> {
    const data = this.loadVotes();

    // Generate vote ID
    const voteId = `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newVote: Vote = {
      voteId,
      ...vote,
    };

    data.votes.push(newVote);
    data.lastUpdated = new Date().toISOString();

    this.saveVotes(data);

    return newVote;
  }

  async castVote(
    voteId: string,
    voter: string,
    decision: 'approve' | 'reject' | 'abstain',
    comment?: string
  ): Promise<Vote> {
    const data = this.loadVotes();
    const vote = data.votes.find((v) => v.voteId === voteId);

    if (!vote) {
      throw new Error(`Vote not found: ${voteId}`);
    }

    if (vote.status !== 'open') {
      throw new Error(`Vote is not open: ${voteId} (status: ${vote.status})`);
    }

    // Check if voter already voted
    const existingVoteIndex = vote.votes.findIndex((v) => v.voter === voter);
    if (existingVoteIndex >= 0) {
      // Update existing vote
      vote.votes[existingVoteIndex] = {
        voter,
        decision,
        timestamp: new Date().toISOString(),
        comment,
      };
    } else {
      // Add new vote
      vote.votes.push({
        voter,
        decision,
        timestamp: new Date().toISOString(),
        comment,
      });
    }

    data.lastUpdated = new Date().toISOString();
    this.saveVotes(data);

    return vote;
  }

  async closeVote(voteId: string): Promise<Vote> {
    const data = this.loadVotes();
    const vote = data.votes.find((v) => v.voteId === voteId);

    if (!vote) {
      throw new Error(`Vote not found: ${voteId}`);
    }

    if (vote.status !== 'open') {
      throw new Error(`Vote is not open: ${voteId} (status: ${vote.status})`);
    }

    // Calculate results
    const approved = vote.votes.filter((v) => v.decision === 'approve').length;
    const rejected = vote.votes.filter((v) => v.decision === 'reject').length;
    const abstained = vote.votes.filter((v) => v.decision === 'abstain').length;

    let outcome: 'approved' | 'rejected' | 'no-consensus';
    if (approved > rejected) {
      outcome = 'approved';
    } else if (rejected > approved) {
      outcome = 'rejected';
    } else {
      outcome = 'no-consensus';
    }

    vote.status = 'closed';
    vote.closedAt = new Date().toISOString();
    vote.result = {
      approved,
      rejected,
      abstained,
      outcome,
    };

    data.lastUpdated = new Date().toISOString();
    this.saveVotes(data);

    return vote;
  }

  async getVotesForDecision(decisionId: string): Promise<Vote[]> {
    const data = this.loadVotes();
    return data.votes.filter((v) => v.decisionId === decisionId);
  }

  // ==========================================================================
  // Infrastructure Catalog Operations
  // ==========================================================================

  async getServers(filters?: {
    status?: Server['status'];
    provider?: string;
    tags?: string[];
  }): Promise<Server[]> {
    const data = this.loadInfrastructure();
    let servers = data.servers;

    if (filters) {
      if (filters.status) {
        servers = servers.filter((s) => s.status === filters.status);
      }
      if (filters.provider) {
        servers = servers.filter((s) => s.provider === filters.provider);
      }
      if (filters.tags && filters.tags.length > 0) {
        servers = servers.filter((s) =>
          filters.tags!.some((tag) => s.tags.includes(tag))
        );
      }
    }

    return servers;
  }

  async getServer(serverId: string): Promise<Server | null> {
    const data = this.loadInfrastructure();
    return data.servers.find((s) => s.serverId === serverId) || null;
  }

  async getServices(filters?: {
    status?: Service['status'];
    serverId?: string;
    type?: string;
    tags?: string[];
  }): Promise<Service[]> {
    const data = this.loadInfrastructure();
    let services = data.services;

    if (filters) {
      if (filters.status) {
        services = services.filter((s) => s.status === filters.status);
      }
      if (filters.serverId) {
        services = services.filter((s) => s.serverId === filters.serverId);
      }
      if (filters.type) {
        services = services.filter((s) => s.type === filters.type);
      }
      if (filters.tags && filters.tags.length > 0) {
        services = services.filter((s) =>
          filters.tags!.some((tag) => s.tags.includes(tag))
        );
      }
    }

    return services;
  }

  async getService(serviceId: string): Promise<Service | null> {
    const data = this.loadInfrastructure();
    return data.services.find((s) => s.serviceId === serviceId) || null;
  }

  async getServiceDependencies(serviceId: string): Promise<Service[]> {
    const data = this.loadInfrastructure();
    const service = data.services.find((s) => s.serviceId === serviceId);
    if (!service) {
      return [];
    }

    return data.services.filter((s) =>
      service.dependencies.includes(s.serviceId)
    );
  }

  async getPorts(): Promise<Port[]> {
    const data = this.loadInfrastructure();
    return data.ports;
  }

  async getWorkflows(filters?: {
    status?: Workflow['status'];
  }): Promise<Workflow[]> {
    const data = this.loadInfrastructure();
    let workflows = data.workflows;

    if (filters?.status) {
      workflows = workflows.filter((w) => w.status === filters.status);
    }

    return workflows;
  }

  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    const data = this.loadInfrastructure();
    return data.workflows.find((w) => w.workflowId === workflowId) || null;
  }

  // ==========================================================================
  // Current Truth Operations
  // ==========================================================================

  async getNodes(filters?: {
    nodeType?: Node['nodeType'];
    status?: Node['status'];
    phase?: string;
    tags?: string[];
  }): Promise<Node[]> {
    const data = this.loadCurrentTruth();
    let nodes = data.nodes;

    if (filters) {
      if (filters.nodeType) {
        nodes = nodes.filter((n) => n.nodeType === filters.nodeType);
      }
      if (filters.status) {
        nodes = nodes.filter((n) => n.status === filters.status);
      }
      if (filters.phase) {
        nodes = nodes.filter((n) => n.phase === filters.phase);
      }
      if (filters.tags && filters.tags.length > 0) {
        nodes = nodes.filter((n) =>
          filters.tags!.some((tag) => n.tags.includes(tag))
        );
      }
    }

    return nodes;
  }

  async getNode(nodeId: string): Promise<Node | null> {
    const data = this.loadCurrentTruth();

    // V3: Support both nodeId and URN lookups
    return (
      data.nodes.find((n) => n.nodeId === nodeId || n.$id === nodeId) || null
    );
  }

  async getNodeDependencies(nodeId: string): Promise<Node[]> {
    const data = this.loadCurrentTruth();
    const node = data.nodes.find((n) => n.nodeId === nodeId);
    if (!node) {
      return [];
    }

    return data.nodes.filter((n) =>
      node.relationships.dependsOn.includes(n.nodeId)
    );
  }

  async getNodeBlockers(nodeId: string): Promise<Node[]> {
    const data = this.loadCurrentTruth();
    const node = data.nodes.find((n) => n.nodeId === nodeId);
    if (!node) {
      return [];
    }

    return data.nodes.filter((n) =>
      node.relationships.blockedBy.includes(n.nodeId)
    );
  }

  async getRelatedNodes(nodeId: string): Promise<Node[]> {
    const data = this.loadCurrentTruth();
    const node = data.nodes.find((n) => n.nodeId === nodeId);
    if (!node) {
      return [];
    }

    // V3: Also check graphMetadata edges
    let relatedIds = [...node.relationships.relatedTo];

    if (node.graphMetadata) {
      const edgeIds = [
        ...(node.graphMetadata.inEdges || []),
        ...(node.graphMetadata.outEdges || []),
      ].filter(
        (urn) => urn.includes(':node:') || urn.includes(':deliverable:')
      );
      relatedIds = [...new Set([...relatedIds, ...edgeIds])];
    }

    return data.nodes.filter(
      (n) => relatedIds.includes(n.nodeId) || relatedIds.includes(n.$id || '')
    );
  }

  // ==========================================================================
  // Roadmap Operations
  // ==========================================================================

  /**
   * Load and transform roadmap data.
   *
   * The canonical .roadmap/roadmap.json uses a `quarters` object keyed by
   * quarter ID (e.g., "q4_2025", "q1_2026") with nested deliverables.
   * This method transforms that structure into flat Phase[] and
   * RoadmapDeliverable[] arrays for the GraphQL layer.
   */
  private loadRoadmapData(): {
    phases: Phase[];
    deliverables: RoadmapDeliverable[];
  } {
    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get('roadmap-transformed');
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data as {
          phases: Phase[];
          deliverables: RoadmapDeliverable[];
        };
      }
    }

    const raw = this.readJSON<any>(DATA_CONFIG.files.roadmap, 'roadmap-raw');
    const quarters = raw.quarters || {};

    const phases: Phase[] = [];
    const deliverables: RoadmapDeliverable[] = [];

    for (const [quarterId, quarter] of Object.entries(quarters) as [
      string,
      any,
    ][]) {
      // Extract date bounds from milestones
      const milestones = quarter.milestones || [];
      const milestoneDates = milestones
        .map((m: any) => m.date)
        .filter(Boolean)
        .sort();

      const phase: Phase = {
        phaseId: quarterId,
        name: quarter.focus || quarterId,
        status: quarter.status || 'planned',
        startDate: milestoneDates[0] || undefined,
        targetDate: milestoneDates[milestoneDates.length - 1] || undefined,
        completionDate:
          quarter.status === 'complete'
            ? milestoneDates[milestoneDates.length - 1]
            : undefined,
      };
      phases.push(phase);

      // Transform deliverables
      for (const [dIdx, d] of (
        (quarter.deliverables || []) as any[]
      ).entries()) {
        deliverables.push({
          deliverableId: d.id || `${quarterId}-d-${dIdx}`,
          title: d.name || d.id,
          description:
            d.progressNote || `${d.type || 'deliverable'}: ${d.name || d.id}`,
          status: d.status || 'planned',
          assignedTo: d.owner || undefined,
          phaseId: quarterId,
        });
      }
    }

    const result = { phases, deliverables };

    // Cache transformed result
    if (this.enableCache) {
      this.cache.set('roadmap-transformed', {
        data: result,
        timestamp: Date.now(),
        ttl: this.cacheTTL,
      });
    }

    return result;
  }

  async getPhases(filters?: { status?: string }): Promise<Phase[]> {
    const { phases } = this.loadRoadmapData();
    if (filters?.status) {
      return phases.filter((p) => p.status === filters.status);
    }
    return phases;
  }

  async getPhase(phaseId: string): Promise<Phase | null> {
    const { phases } = this.loadRoadmapData();
    return phases.find((p) => p.phaseId === phaseId) || null;
  }

  async getCurrentPhase(): Promise<Phase | null> {
    const { phases } = this.loadRoadmapData();
    return phases.find((p) => p.status === 'active') || null;
  }

  async getDeliverables(filters?: {
    phaseId?: string;
    status?: string;
  }): Promise<RoadmapDeliverable[]> {
    const { deliverables } = this.loadRoadmapData();
    let result = deliverables;

    if (filters?.phaseId) {
      result = result.filter((d) => d.phaseId === filters.phaseId);
    }
    if (filters?.status) {
      result = result.filter((d) => d.status === filters.status);
    }

    return result;
  }

  async getDeliverable(
    deliverableId: string
  ): Promise<RoadmapDeliverable | null> {
    const { deliverables } = this.loadRoadmapData();
    return deliverables.find((d) => d.deliverableId === deliverableId) || null;
  }

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  clearCache(): void {
    this.cache.clear();
    console.log('🗑️  FileDataSource cache cleared');
  }

  async getHealth(): Promise<{
    healthy: boolean;
    source: string;
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();

    try {
      // Try to read a file to check health
      this.loadDecisionLog();
      const latency = Date.now() - start;

      return {
        healthy: true,
        source: 'file',
        latency,
      };
    } catch (error) {
      const err = error as Error;
      return {
        healthy: false,
        source: 'file',
        error: err.message,
      };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a FileDataSource instance with default configuration
 */
export function createFileDataSource(config?: {
  enableCache?: boolean;
  cacheTTL?: number;
}): DataSource {
  return new FileDataSource(config);
}
