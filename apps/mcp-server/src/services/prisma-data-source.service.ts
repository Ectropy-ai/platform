/**
 * Prisma-Based Data Source Implementation
 *
 * Queries PostgreSQL via Prisma instead of reading JSON files.
 * Implements the same DataSource interface as FileDataSource for
 * seamless swap via dependency injection.
 *
 * Prisma model → DataSource interface mapping:
 *   DocumentationDecision → Decision
 *   RoadmapVote           → Vote
 *   InfraEnvironment      → Server (reconstructed from servers_data JSON)
 *   InfraService          → Service
 *   StateNode             → Node
 *   RoadmapPhase          → Phase
 *   RoadmapDeliverableDb  → RoadmapDeliverable
 *
 * Design:
 * - No caching layer (Prisma connection pool handles performance)
 * - clearCache() is a no-op
 * - getHealth() measures a trivial query latency
 * - getPorts()/getWorkflows() return empty arrays (no dedicated tables)
 */

import type { PrismaClient } from '@prisma/client';
import type {
  DataSource,
  Decision,
  Vote,
  Server,
  Service,
  Port,
  Workflow,
  Node,
  Phase,
  RoadmapDeliverable,
  URN,
  EdgeType,
  GraphMetadata,
} from './data-source.interface.js';

// ============================================================================
// Enum-to-string mapping helpers
// ============================================================================

/**
 * Map Prisma DocDecisionStatus enum → Decision['status'] kebab-case string.
 */
function mapDecisionStatus(
  prismaStatus: string
): Decision['status'] {
  const map: Record<string, Decision['status']> = {
    PROPOSED: 'proposed',
    UNDER_REVIEW: 'under-review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    IMPLEMENTED: 'implemented',
    DEPRECATED: 'deprecated',
  };
  return map[prismaStatus] ?? 'proposed';
}

/**
 * Map Decision['status'] kebab-case → Prisma DocDecisionStatus enum.
 */
function toDecisionStatusEnum(status: Decision['status']): string {
  const map: Record<string, string> = {
    'proposed': 'PROPOSED',
    'under-review': 'UNDER_REVIEW',
    'approved': 'APPROVED',
    'rejected': 'REJECTED',
    'implemented': 'IMPLEMENTED',
    'deprecated': 'DEPRECATED',
  };
  return map[status] ?? 'PROPOSED';
}

/**
 * Map Prisma DocDecisionImpact enum → Decision['impact'] lowercase string.
 */
function mapDecisionImpact(
  prismaImpact: string
): Decision['impact'] {
  const map: Record<string, Decision['impact']> = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  };
  return map[prismaImpact] ?? 'medium';
}

/**
 * Map Decision['impact'] → Prisma DocDecisionImpact enum.
 */
function toDecisionImpactEnum(impact: Decision['impact']): string {
  const map: Record<string, string> = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  };
  return map[impact] ?? 'MEDIUM';
}

/**
 * Map Prisma RoadmapNodeType enum → Node['nodeType'] lowercase string.
 */
function mapNodeType(prismaType: string): Node['nodeType'] {
  const map: Record<string, Node['nodeType']> = {
    FILE: 'file',
    DIRECTORY: 'directory',
    SERVICE: 'service',
    WORKFLOW: 'workflow',
    DELIVERABLE: 'deliverable',
  };
  // Prisma enum has more values (MILESTONE, DECISION, etc.) that do not map
  // directly to the DataSource Node['nodeType'] union. Default to 'file'.
  return map[prismaType] ?? 'file';
}

/**
 * Map Node['nodeType'] → Prisma RoadmapNodeType enum.
 */
function toNodeTypeEnum(nodeType: Node['nodeType']): string {
  const map: Record<string, string> = {
    file: 'FILE',
    directory: 'DIRECTORY',
    service: 'SERVICE',
    workflow: 'WORKFLOW',
    deliverable: 'DELIVERABLE',
  };
  return map[nodeType] ?? 'FILE';
}

/**
 * Map Prisma RoadmapNodeStatus enum → Node['status'] lowercase string.
 */
function mapNodeStatus(prismaStatus: string): Node['status'] {
  const map: Record<string, Node['status']> = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
    DEPRECATED: 'deprecated',
  };
  return map[prismaStatus] ?? 'active';
}

/**
 * Map Node['status'] → Prisma RoadmapNodeStatus enum.
 */
function toNodeStatusEnum(status: Node['status']): string {
  const map: Record<string, string> = {
    active: 'ACTIVE',
    archived: 'ARCHIVED',
    deprecated: 'DEPRECATED',
  };
  return map[status] ?? 'ACTIVE';
}

/**
 * Map Prisma RoadmapPhaseStatus enum → Phase['status'] lowercase kebab string.
 */
function mapPhaseStatus(prismaStatus: string): string {
  const map: Record<string, string> = {
    PLANNED: 'planned',
    IN_PROGRESS: 'active',
    COMPLETED: 'complete',
    BLOCKED: 'blocked',
  };
  return map[prismaStatus] ?? prismaStatus.toLowerCase();
}

// ============================================================================
// Row → Domain transformer functions
// ============================================================================

/**
 * Transform a DocumentationDecision Prisma row into a DataSource Decision.
 */
function toDecision(row: any, index: number): Decision {
  return {
    $id: row.urn || undefined,
    graphMetadata: (row.graph_metadata as GraphMetadata) || undefined,
    decisionId: row.decision_id,
    title: row.title,
    status: mapDecisionStatus(row.status),
    category: row.category,
    impact: mapDecisionImpact(row.impact),
    proposedBy: row.proposed_by ?? '',
    proposedDate: row.proposed_date ?? '',
    approvedDate: row.approved_date ?? undefined,
    implementedDate: row.implemented_date ?? undefined,
    context: row.context ?? '',
    decision: row.decision ?? '',
    consequences: row.consequences ?? '',
    alternatives: Array.isArray(row.alternatives) ? row.alternatives : [],
    relatedDecisions: row.related_decisions ?? [],
    supersedes: row.supersedes ?? undefined,
    supersededBy: row.superseded_by ?? undefined,
    evidence: row.evidence ?? [],
    tags: row.tags ?? [],
    impactedDeliverables: row.impacted_deliverables ?? [],
    impactedServices: row.impacted_services ?? [],
    impactedInfrastructure: row.impacted_infrastructure ?? [],
    implementationNotes: row.implementation_notes ?? undefined,
    index,
  };
}

/**
 * Transform a RoadmapVote Prisma row into a DataSource Vote.
 */
function toVote(row: any): Vote {
  return {
    $id: row.urn || undefined,
    graphMetadata: (row.graph_metadata as GraphMetadata) || undefined,
    voteId: row.vote_id,
    decisionId: row.decision_id,
    status: row.status as Vote['status'],
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    closedAt: row.closed_at ?? undefined,
    votes: Array.isArray(row.voters) ? row.voters : [],
    result: row.result ?? undefined,
  };
}

/**
 * Transform an InfraService Prisma row into a DataSource Service.
 */
function toService(row: any): Service {
  return {
    serviceId: row.service_id,
    name: row.name,
    type: row.type ?? 'unknown',
    version: row.version ?? '',
    status: (row.status ?? 'running') as Service['status'],
    serverId: row.environment_id ?? '',
    port: row.port ?? 0,
    healthCheck: row.health_check ?? '',
    dependencies: row.dependencies ?? [],
    repository: row.repository ?? undefined,
    documentation: row.documentation ?? undefined,
    tags: row.tags ?? [],
  };
}

/**
 * Reconstruct DataSource Server objects from InfraEnvironment.servers_data JSON.
 *
 * Each InfraEnvironment row can contain a servers_data JSON array with nested
 * server objects. We flatten all of them into the Server interface.
 */
function toServers(envRow: any): Server[] {
  const serversData = envRow.servers_data;
  if (!Array.isArray(serversData)) {
    return [];
  }

  return serversData.map((s: any) => {
    const hardware = s.specs || s.hardware || { cpu: '', memory: '', storage: '' };
    return {
      serverId: s.id || s.serverId || `${envRow.environment_id}-${s.name}`,
      name: s.name ?? '',
      ipAddress: s.ipAddress || s.ip || undefined,
      provider: s.provider || envRow.provider || 'unknown',
      region: s.region || envRow.region || 'unknown',
      status: (s.status || 'active') as Server['status'],
      services: s.services ?? [],
      specs: {
        cpu: hardware.cpu ?? '',
        memory: hardware.memory ?? '',
        storage: hardware.storage ?? '',
      },
      monitoring: s.monitoring ?? { healthCheck: '', metricsEndpoint: '' },
      tags: s.tags || [envRow.type || envRow.name],
    } satisfies Server;
  });
}

/**
 * Transform a StateNode Prisma row into a DataSource Node.
 */
function toNode(row: any, index: number): Node {
  const relationships = (row.relationships as any) ?? {};
  const metadata = (row.metadata as any) ?? {};

  return {
    $id: row.urn || undefined,
    graphMetadata: (row.graph_metadata as GraphMetadata) || undefined,
    nodeId: row.node_id,
    title: row.title,
    nodeType: mapNodeType(row.node_type),
    status: mapNodeStatus(row.status),
    phase: row.phase ?? '',
    path: row.path ?? undefined,
    description: row.description ?? undefined,
    owner: row.owner ?? undefined,
    createdAt: row.source_created_at ?? '',
    lastModified: row.source_modified_at ?? row.source_created_at ?? '',
    retentionDate: row.retention_date ?? undefined,
    relationships: {
      dependsOn: relationships.dependsOn ?? [],
      blockedBy: relationships.blockedBy ?? [],
      relatedTo: relationships.relatedTo ?? [],
    },
    metadata: {
      size: metadata.size ?? undefined,
      lines: metadata.lines ?? undefined,
      language: metadata.language ?? undefined,
      ...metadata,
    },
    evidence: row.evidence ?? [],
    tags: row.tags ?? [],
    index,
  };
}

/**
 * Transform a RoadmapPhase Prisma row into a DataSource Phase.
 */
function toPhase(row: any): Phase {
  return {
    phaseId: row.phase_id,
    name: row.name,
    status: mapPhaseStatus(row.status),
    startDate: row.start_date ?? undefined,
    targetDate: row.target_date ?? undefined,
    completionDate: row.completion_date ?? undefined,
  };
}

/**
 * Transform a RoadmapDeliverableDb Prisma row into a DataSource RoadmapDeliverable.
 */
function toDeliverable(row: any): RoadmapDeliverable {
  return {
    deliverableId: row.deliverable_id,
    title: row.title,
    description: row.description ?? '',
    status: row.status ?? 'planned',
    assignedTo: row.assigned_to ?? undefined,
    phaseId: row.phase_id,
  };
}

// ============================================================================
// PrismaDataSource Implementation
// ============================================================================

class PrismaDataSource implements DataSource {
  private readonly prisma: PrismaClient;
  private readonly ventureId: string;

  constructor(prisma: PrismaClient, ventureId: string) {
    this.prisma = prisma;
    this.ventureId = ventureId;
  }

  // ==========================================================================
  // Helper: access Prisma models via dynamic property access
  // Prisma generates model accessors as camelCase of the model name.
  // ==========================================================================

  private get decisions() {
    return (this.prisma as any).documentationDecision;
  }

  private get votes() {
    return (this.prisma as any).roadmapVote;
  }

  private get environments() {
    return (this.prisma as any).infraEnvironment;
  }

  private get services_() {
    return (this.prisma as any).infraService;
  }

  private get stateNodes() {
    return (this.prisma as any).stateNode;
  }

  private get phases() {
    return (this.prisma as any).roadmapPhase;
  }

  private get deliverables_() {
    return (this.prisma as any).roadmapDeliverableDb;
  }

  // ==========================================================================
  // URN parsing (same logic as FileDataSource)
  // ==========================================================================

  private parseURN(urn: URN): { venture: string; nodeType: string; identifier: string } | null {
    const match = urn.match(/^urn:luhtech:([^:]+):([^:]+):(.+)$/);
    if (!match) return null;
    return { venture: match[1], nodeType: match[2], identifier: match[3] };
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
    const where: any = { venture_id: this.ventureId };

    if (filters?.status) {
      where.status = toDecisionStatusEnum(filters.status);
    }
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.impact) {
      where.impact = toDecisionImpactEnum(filters.impact);
    }
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const rows = await this.decisions.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any, idx: number) => toDecision(row, idx));
  }

  async getDecision(decisionId: string): Promise<Decision | null> {
    // Support both decisionId and URN lookups
    const row = await this.decisions.findFirst({
      where: {
        venture_id: this.ventureId,
        OR: [
          { decision_id: decisionId },
          { urn: decisionId },
        ],
      },
    });

    return row ? toDecision(row, 0) : null;
  }

  async getSupersededDecisions(decisionId: string): Promise<Decision[]> {
    const rows = await this.decisions.findMany({
      where: {
        venture_id: this.ventureId,
        superseded_by: decisionId,
      },
    });

    return rows.map((row: any, idx: number) => toDecision(row, idx));
  }

  async getSupersedesDecisions(decisionId: string): Promise<Decision[]> {
    const decision = await this.decisions.findFirst({
      where: {
        venture_id: this.ventureId,
        decision_id: decisionId,
      },
    });

    if (!decision || !decision.supersedes) return [];

    const superseded = await this.decisions.findFirst({
      where: {
        venture_id: this.ventureId,
        decision_id: decision.supersedes,
      },
    });

    return superseded ? [toDecision(superseded, 0)] : [];
  }

  async getRelatedDecisions(decisionId: string): Promise<Decision[]> {
    const decision = await this.decisions.findFirst({
      where: {
        venture_id: this.ventureId,
        decision_id: decisionId,
      },
    });

    if (!decision) return [];

    const relatedIds: string[] = decision.related_decisions ?? [];

    // Also check graph metadata edges for decision URNs
    const graphMeta = decision.graph_metadata as GraphMetadata | null;
    if (graphMeta) {
      const edgeIds = [
        ...(graphMeta.inEdges ?? []),
        ...(graphMeta.outEdges ?? []),
      ].filter((urn: string) => urn.includes(':decision:'));
      for (const id of edgeIds) {
        if (!relatedIds.includes(id)) relatedIds.push(id);
      }
    }

    if (relatedIds.length === 0) return [];

    const rows = await this.decisions.findMany({
      where: {
        venture_id: this.ventureId,
        OR: [
          { decision_id: { in: relatedIds } },
          { urn: { in: relatedIds } },
        ],
      },
    });

    return rows.map((row: any, idx: number) => toDecision(row, idx));
  }

  // ==========================================================================
  // V3 Graph Operations
  // ==========================================================================

  async getByURN(urn: URN): Promise<Decision | Node | Vote | null> {
    const parsed = this.parseURN(urn);
    if (!parsed) return null;

    const { nodeType, identifier } = parsed;

    switch (nodeType) {
      case 'decision':
      case 'pm-decision': {
        const row = await this.decisions.findFirst({
          where: {
            venture_id: this.ventureId,
            OR: [{ urn }, { decision_id: identifier }],
          },
        });
        return row ? toDecision(row, 0) : null;
      }

      case 'node':
      case 'deliverable':
      case 'workstream': {
        const row = await this.stateNodes.findFirst({
          where: {
            venture_id: this.ventureId,
            OR: [{ urn }, { node_id: identifier }],
          },
        });
        return row ? toNode(row, 0) : null;
      }

      case 'vote': {
        const row = await this.votes.findFirst({
          where: {
            venture_id: this.ventureId,
            OR: [{ urn }, { vote_id: identifier }],
          },
        });
        return row ? toVote(row) : null;
      }

      default:
        return null;
    }
  }

  async getRelatedByURN(
    urn: URN,
    edgeType?: EdgeType
  ): Promise<Array<Decision | Node | Vote>> {
    const entity = await this.getByURN(urn);
    if (!entity || !entity.graphMetadata) return [];

    let relatedURNs: string[];

    if (edgeType && entity.graphMetadata.edges) {
      relatedURNs = entity.graphMetadata.edges
        .filter((e) => e.type === edgeType)
        .flatMap((e) => [e.from, e.to])
        .filter((u) => u !== urn);
    } else {
      relatedURNs = [
        ...(entity.graphMetadata.inEdges ?? []),
        ...(entity.graphMetadata.outEdges ?? []),
      ];
    }

    const results: Array<Decision | Node | Vote> = [];
    for (const relatedURN of relatedURNs) {
      const related = await this.getByURN(relatedURN);
      if (related) results.push(related);
    }
    return results;
  }

  // ==========================================================================
  // Votes Operations
  // ==========================================================================

  async getVotes(): Promise<Vote[]> {
    const rows = await this.votes.findMany({
      where: { venture_id: this.ventureId },
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any) => toVote(row));
  }

  async getVote(voteId: string): Promise<Vote | null> {
    const row = await this.votes.findFirst({
      where: {
        venture_id: this.ventureId,
        vote_id: voteId,
      },
    });

    return row ? toVote(row) : null;
  }

  async createVote(vote: Omit<Vote, 'voteId'>): Promise<Vote> {
    const voteId = `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const urn = `urn:luhtech:${this.ventureId}:vote:${voteId}`;

    const row = await this.votes.create({
      data: {
        urn,
        venture_id: this.ventureId,
        vote_id: voteId,
        decision_id: vote.decisionId,
        status: vote.status,
        voters: vote.votes ?? [],
        result: vote.result ?? undefined,
        closed_at: vote.closedAt ?? undefined,
        graph_metadata: vote.graphMetadata ?? undefined,
      },
    });

    return toVote(row);
  }

  async castVote(
    voteId: string,
    voter: string,
    decision: 'approve' | 'reject' | 'abstain',
    comment?: string
  ): Promise<Vote> {
    const existing = await this.votes.findFirst({
      where: {
        venture_id: this.ventureId,
        vote_id: voteId,
      },
    });

    if (!existing) throw new Error(`Vote not found: ${voteId}`);
    if (existing.status !== 'open') {
      throw new Error(`Vote is not open: ${voteId} (status: ${existing.status})`);
    }

    const voters: any[] = Array.isArray(existing.voters) ? [...existing.voters] : [];
    const newEntry = {
      voter,
      decision,
      timestamp: new Date().toISOString(),
      comment,
    };

    // Update or append
    const existingIdx = voters.findIndex((v: any) => v.voter === voter);
    if (existingIdx >= 0) {
      voters[existingIdx] = newEntry;
    } else {
      voters.push(newEntry);
    }

    const row = await this.votes.update({
      where: { id: existing.id },
      data: { voters },
    });

    return toVote(row);
  }

  async closeVote(voteId: string): Promise<Vote> {
    const existing = await this.votes.findFirst({
      where: {
        venture_id: this.ventureId,
        vote_id: voteId,
      },
    });

    if (!existing) throw new Error(`Vote not found: ${voteId}`);
    if (existing.status !== 'open') {
      throw new Error(`Vote is not open: ${voteId} (status: ${existing.status})`);
    }

    const voters: any[] = Array.isArray(existing.voters) ? existing.voters : [];
    const approved = voters.filter((v: any) => v.decision === 'approve').length;
    const rejected = voters.filter((v: any) => v.decision === 'reject').length;
    const abstained = voters.filter((v: any) => v.decision === 'abstain').length;

    let outcome: 'approved' | 'rejected' | 'no-consensus';
    if (approved > rejected) {
      outcome = 'approved';
    } else if (rejected > approved) {
      outcome = 'rejected';
    } else {
      outcome = 'no-consensus';
    }

    const row = await this.votes.update({
      where: { id: existing.id },
      data: {
        status: 'closed',
        closed_at: new Date().toISOString(),
        result: { approved, rejected, abstained, outcome },
      },
    });

    return toVote(row);
  }

  async getVotesForDecision(decisionId: string): Promise<Vote[]> {
    const rows = await this.votes.findMany({
      where: {
        venture_id: this.ventureId,
        decision_id: decisionId,
      },
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any) => toVote(row));
  }

  // ==========================================================================
  // Infrastructure Catalog Operations
  // ==========================================================================

  async getServers(filters?: {
    status?: Server['status'];
    provider?: string;
    tags?: string[];
  }): Promise<Server[]> {
    const rows = await this.environments.findMany({
      where: { venture_id: this.ventureId },
    });

    let servers: Server[] = rows.flatMap((row: any) => toServers(row));

    if (filters?.status) {
      servers = servers.filter((s) => s.status === filters.status);
    }
    if (filters?.provider) {
      servers = servers.filter((s) => s.provider === filters.provider);
    }
    if (filters?.tags && filters.tags.length > 0) {
      servers = servers.filter((s) =>
        filters.tags!.some((tag) => s.tags.includes(tag))
      );
    }

    return servers;
  }

  async getServer(serverId: string): Promise<Server | null> {
    const rows = await this.environments.findMany({
      where: { venture_id: this.ventureId },
    });

    for (const row of rows) {
      const servers = toServers(row);
      const match = servers.find((s) => s.serverId === serverId);
      if (match) return match;
    }

    return null;
  }

  async getServices(filters?: {
    status?: Service['status'];
    serverId?: string;
    type?: string;
    tags?: string[];
  }): Promise<Service[]> {
    const where: any = { venture_id: this.ventureId };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.serverId) {
      where.environment_id = filters.serverId;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const rows = await this.services_.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any) => toService(row));
  }

  async getService(serviceId: string): Promise<Service | null> {
    const row = await this.services_.findFirst({
      where: {
        venture_id: this.ventureId,
        service_id: serviceId,
      },
    });

    return row ? toService(row) : null;
  }

  async getServiceDependencies(serviceId: string): Promise<Service[]> {
    const service = await this.services_.findFirst({
      where: {
        venture_id: this.ventureId,
        service_id: serviceId,
      },
    });

    if (!service || !service.dependencies || service.dependencies.length === 0) {
      return [];
    }

    const rows = await this.services_.findMany({
      where: {
        venture_id: this.ventureId,
        service_id: { in: service.dependencies },
      },
    });

    return rows.map((row: any) => toService(row));
  }

  /**
   * Ports are not stored as a separate table.
   * Derive from InfraService data or return empty.
   */
  async getPorts(): Promise<Port[]> {
    const services = await this.getServices();
    return services
      .filter((s) => s.port > 0)
      .map((s) => ({
        number: s.port,
        protocol: 'tcp' as const,
        service: s.serviceId,
        description: s.name,
        public: false,
      }));
  }

  /**
   * Workflows are not stored in a dedicated table.
   * Return empty array.
   */
  async getWorkflows(_filters?: { status?: Workflow['status'] }): Promise<Workflow[]> {
    return [];
  }

  /**
   * No dedicated workflow table. Always returns null.
   */
  async getWorkflow(_workflowId: string): Promise<Workflow | null> {
    return null;
  }

  // ==========================================================================
  // Current Truth (StateNode) Operations
  // ==========================================================================

  async getNodes(filters?: {
    nodeType?: Node['nodeType'];
    status?: Node['status'];
    phase?: string;
    tags?: string[];
  }): Promise<Node[]> {
    const where: any = { venture_id: this.ventureId };

    if (filters?.nodeType) {
      where.node_type = toNodeTypeEnum(filters.nodeType);
    }
    if (filters?.status) {
      where.status = toNodeStatusEnum(filters.status);
    }
    if (filters?.phase) {
      where.phase = filters.phase;
    }
    if (filters?.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const rows = await this.stateNodes.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any, idx: number) => toNode(row, idx));
  }

  async getNode(nodeId: string): Promise<Node | null> {
    const row = await this.stateNodes.findFirst({
      where: {
        venture_id: this.ventureId,
        OR: [
          { node_id: nodeId },
          { urn: nodeId },
        ],
      },
    });

    return row ? toNode(row, 0) : null;
  }

  async getNodeDependencies(nodeId: string): Promise<Node[]> {
    const node = await this.stateNodes.findFirst({
      where: {
        venture_id: this.ventureId,
        node_id: nodeId,
      },
    });

    if (!node) return [];

    const relationships = (node.relationships as any) ?? {};
    const dependsOn: string[] = relationships.dependsOn ?? [];

    if (dependsOn.length === 0) return [];

    const rows = await this.stateNodes.findMany({
      where: {
        venture_id: this.ventureId,
        node_id: { in: dependsOn },
      },
    });

    return rows.map((row: any, idx: number) => toNode(row, idx));
  }

  async getNodeBlockers(nodeId: string): Promise<Node[]> {
    const node = await this.stateNodes.findFirst({
      where: {
        venture_id: this.ventureId,
        node_id: nodeId,
      },
    });

    if (!node) return [];

    const relationships = (node.relationships as any) ?? {};
    const blockedBy: string[] = relationships.blockedBy ?? [];

    if (blockedBy.length === 0) return [];

    const rows = await this.stateNodes.findMany({
      where: {
        venture_id: this.ventureId,
        node_id: { in: blockedBy },
      },
    });

    return rows.map((row: any, idx: number) => toNode(row, idx));
  }

  async getRelatedNodes(nodeId: string): Promise<Node[]> {
    const node = await this.stateNodes.findFirst({
      where: {
        venture_id: this.ventureId,
        node_id: nodeId,
      },
    });

    if (!node) return [];

    const relationships = (node.relationships as any) ?? {};
    const relatedIds: string[] = [...(relationships.relatedTo ?? [])];

    // Also check graph metadata edges for node URNs
    const graphMeta = node.graph_metadata as GraphMetadata | null;
    if (graphMeta) {
      const edgeIds = [
        ...(graphMeta.inEdges ?? []),
        ...(graphMeta.outEdges ?? []),
      ].filter((urn: string) =>
        urn.includes(':node:') || urn.includes(':deliverable:')
      );
      for (const id of edgeIds) {
        if (!relatedIds.includes(id)) relatedIds.push(id);
      }
    }

    if (relatedIds.length === 0) return [];

    const rows = await this.stateNodes.findMany({
      where: {
        venture_id: this.ventureId,
        OR: [
          { node_id: { in: relatedIds } },
          { urn: { in: relatedIds } },
        ],
      },
    });

    return rows.map((row: any, idx: number) => toNode(row, idx));
  }

  // ==========================================================================
  // Roadmap Operations
  // ==========================================================================

  async getPhases(filters?: { status?: string }): Promise<Phase[]> {
    const where: any = { venture_id: this.ventureId };

    if (filters?.status) {
      // Convert lowercase filter to Prisma enum format
      const statusMap: Record<string, string> = {
        planned: 'PLANNED',
        active: 'IN_PROGRESS',
        'in-progress': 'IN_PROGRESS',
        complete: 'COMPLETED',
        completed: 'COMPLETED',
        blocked: 'BLOCKED',
      };
      where.status = statusMap[filters.status] ?? filters.status.toUpperCase();
    }

    const rows = await this.phases.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any) => toPhase(row));
  }

  async getPhase(phaseId: string): Promise<Phase | null> {
    const row = await this.phases.findFirst({
      where: {
        venture_id: this.ventureId,
        phase_id: phaseId,
      },
    });

    return row ? toPhase(row) : null;
  }

  async getCurrentPhase(): Promise<Phase | null> {
    const row = await this.phases.findFirst({
      where: {
        venture_id: this.ventureId,
        status: 'IN_PROGRESS',
      },
    });

    return row ? toPhase(row) : null;
  }

  async getDeliverables(filters?: {
    phaseId?: string;
    status?: string;
  }): Promise<RoadmapDeliverable[]> {
    const where: any = { venture_id: this.ventureId };

    if (filters?.phaseId) {
      where.phase_id = filters.phaseId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const rows = await this.deliverables_.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row: any) => toDeliverable(row));
  }

  async getDeliverable(deliverableId: string): Promise<RoadmapDeliverable | null> {
    const row = await this.deliverables_.findFirst({
      where: {
        venture_id: this.ventureId,
        deliverable_id: deliverableId,
      },
    });

    return row ? toDeliverable(row) : null;
  }

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  /**
   * No-op. Prisma does not use an application-level cache.
   */
  clearCache(): void {
    // Intentional no-op — Prisma manages its own connection pool.
  }

  /**
   * Measure a trivial query to verify database connectivity and latency.
   */
  async getHealth(): Promise<{
    healthy: boolean;
    source: string;
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();

    try {
      // Execute a minimal query to verify connectivity
      await (this.prisma as any).$queryRaw`SELECT 1`;
      const latency = Date.now() - start;

      return {
        healthy: true,
        source: 'prisma',
        latency,
      };
    } catch (error) {
      const err = error as Error;
      return {
        healthy: false,
        source: 'prisma',
        error: err.message,
      };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a PrismaDataSource instance.
 *
 * @param prisma  - An initialized PrismaClient connected to the main database.
 * @param ventureId - The venture_id used for multi-tenant scoping. Defaults to 'ectropy'.
 * @returns A DataSource implementation backed by PostgreSQL via Prisma.
 */
export function createPrismaDataSource(
  prisma: PrismaClient,
  ventureId: string = 'ectropy'
): DataSource {
  return new PrismaDataSource(prisma, ventureId);
}
