/**
 * REST Endpoints for Common GraphQL Queries
 *
 * Provides convenient REST wrappers around GraphQL queries for common
 * documentation queries. These endpoints internally execute GraphQL
 * queries and return JSON responses.
 *
 * Milestone 3: MCP Graph Endpoints
 */

import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
import { createApolloServer } from '../graphql/index.js';

const router: ExpressRouter = Router();

// Create Apollo Server instance for executing queries
const apolloServer = createApolloServer();
let serverStarted = false;

// Ensure server is started before handling requests
const ensureServerStarted = async () => {
  if (!serverStarted) {
    await apolloServer.start();
    serverStarted = true;
  }
};

/**
 * Execute a GraphQL query and return results
 */
async function executeGraphQL(
  query: string,
  variables: Record<string, unknown> = {}
) {
  await ensureServerStarted();

  const result = await apolloServer.executeOperation({
    query,
    variables,
  });

  if (result.body.kind === 'single') {
    return result.body.singleResult;
  }

  throw new Error('Unexpected GraphQL response format');
}

// ============================================================================
// DECISION ENDPOINTS
// ============================================================================

/**
 * GET /api/mcp/graph/decisions
 *
 * Query decisions with optional filters
 *
 * Query params:
 * - status: Filter by status (approved, proposed, implemented, etc.)
 * - category: Filter by category (architecture, security, infrastructure, etc.)
 * - impact: Filter by impact level (low, medium, high, critical)
 * - deliverable: Filter decisions affecting a deliverable
 * - service: Filter decisions affecting a service
 *
 * Examples:
 * - GET /api/mcp/graph/decisions?status=approved
 * - GET /api/mcp/graph/decisions?category=architecture&impact=high
 * - GET /api/mcp/graph/decisions?service=service-api-gateway
 */
router.get('/decisions', async (req: Request, res: Response) => {
  try {
    const { status, category, impact, deliverable, service } = req.query;

    let query: string;
    let variables: Record<string, unknown> = {};

    if (service) {
      query = `
        query DecisionsForService($serviceId: String!) {
          decisionsForService(serviceId: $serviceId) {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
            deliverables
            services
            evidence
          }
        }
      `;
      variables = { serviceId: service };
    } else if (deliverable) {
      query = `
        query DecisionsForDeliverable($deliverableId: String!) {
          decisionsForDeliverable(deliverableId: $deliverableId) {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
            deliverables
            services
            evidence
          }
        }
      `;
      variables = { deliverableId: deliverable };
    } else if (status) {
      query = `
        query DecisionsByStatus($status: DecisionStatus!) {
          decisionsByStatus(status: $status) {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
          }
        }
      `;
      variables = { status };
    } else if (category) {
      query = `
        query DecisionsByCategory($category: DecisionCategory!) {
          decisionsByCategory(category: $category) {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
          }
        }
      `;
      variables = { category };
    } else if (impact) {
      query = `
        query DecisionsByImpact($impact: ImpactLevel!) {
          decisionsByImpact(impact: $impact) {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
          }
        }
      `;
      variables = { impact };
    } else {
      // Get all decisions
      query = `
        query AllDecisions {
          decisions {
            decisionId
            title
            decision
            status
            category
            impact
            timestamp
            approvedBy
            implementedDate
          }
        }
      `;
    }

    const result = await executeGraphQL(query, variables);

    if (result.errors) {
      return res.status(400).json({ errors: result.errors });
    }

    const decisions =
      (result.data as any)?.decisions ||
      (result.data as any)?.decisionsByStatus ||
      (result.data as any)?.decisionsByCategory ||
      (result.data as any)?.decisionsByImpact ||
      (result.data as any)?.decisionsForService ||
      (result.data as any)?.decisionsForDeliverable ||
      [];

    return res.json({
      success: true,
      count: (decisions as any[]).length,
      data: decisions,
    });
  } catch (error) {
    console.error('Error fetching decisions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch decisions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/graph/decisions/:decisionId
 *
 * Get a specific decision with full details including relationships
 *
 * Example:
 * - GET /api/mcp/graph/decisions/d-2025-11-11-apollo-vs-neo4j
 */
router.get('/decisions/:decisionId', async (req: Request, res: Response) => {
  try {
    const { decisionId } = req.params;

    const query = `
      query GetDecision($decisionId: ID!) {
        decision(decisionId: $decisionId) {
          decisionId
          title
          context
          decision
          rationale
          status
          category
          impact
          timestamp
          approvedBy
          implementedDate
          votes

          alternatives {
            option
            pros
            cons
            estimatedEffort
            riskLevel
          }

          deliverables
          services
          infrastructure
          evidence
          documentation

          relatedDecisions {
            decisionId
            title
            status
            category
          }

          supersedes {
            decisionId
            title
            status
          }

          supersededBy {
            decisionId
            title
            status
          }
        }
      }
    `;

    const result = await executeGraphQL(query, { decisionId });

    if (result.errors) {
      return res.status(400).json({ errors: result.errors });
    }

    if (!result.data?.decision) {
      return res.status(404).json({
        success: false,
        error: 'Decision not found',
        decisionId,
      });
    }

    return res.json({
      success: true,
      data: result.data.decision,
    });
  } catch (error) {
    console.error('Error fetching decision:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch decision',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// INFRASTRUCTURE ENDPOINTS
// ============================================================================

/**
 * GET /api/mcp/graph/dependencies
 *
 * Get service dependency tree
 *
 * Query params:
 * - service: Service ID to get dependencies for (required)
 *
 * Example:
 * - GET /api/mcp/graph/dependencies?service=service-api-gateway
 */
router.get('/dependencies', async (req: Request, res: Response) => {
  try {
    const { service } = req.query;

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: service',
      });
    }

    const query = `
      query ServiceDependencies($serviceId: ID!) {
        service(serviceId: $serviceId) {
          serviceId
          name
          type
          version
          status

          dependencies {
            serviceId
            name
            type
            version
            status

            dependencies {
              serviceId
              name
              type
              status
            }
          }

          ports {
            number
            protocol
            public
          }

          servers {
            serverId
            name
            ipAddress
            environment
          }
        }
      }
    `;

    const result = await executeGraphQL(query, { serviceId: service });

    if (result.errors) {
      return res.status(400).json({ errors: result.errors });
    }

    if (!result.data?.service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found',
        serviceId: service,
      });
    }

    return res.json({
      success: true,
      data: result.data.service,
    });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch dependencies',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// CURRENT TRUTH / NODE ENDPOINTS
// ============================================================================

/**
 * GET /api/mcp/graph/blockers
 *
 * Get blocking dependencies for a node or phase
 *
 * Query params:
 * - node: Node ID to get blockers for
 * - phase: Phase to get all blockers for
 *
 * Examples:
 * - GET /api/mcp/graph/blockers?node=n-2025-11-10-oauth-validation
 * - GET /api/mcp/graph/blockers?phase=phase-5a
 */
router.get('/blockers', async (req: Request, res: Response) => {
  try {
    const { node, phase } = req.query;

    if (!node && !phase) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: node or phase',
      });
    }

    if (node) {
      // Get blockers for specific node
      const query = `
        query NodeBlockers($nodeId: ID!) {
          node(nodeId: $nodeId) {
            nodeId
            title
            status
            nodeType

            relationships {
              blockedBy {
                nodeId
                title
                status
                nodeType

                content {
                  summary
                  impact
                }
              }
            }
          }

          blockers(nodeId: $nodeId) {
            nodeId
            title
            status
            nodeType

            content {
              summary
              impact
            }
          }
        }
      `;

      const result = await executeGraphQL(query, { nodeId: node });

      if (result.errors) {
        return res.status(400).json({ errors: result.errors });
      }

      if (!result.data?.node) {
        return res.status(404).json({
          success: false,
          error: 'Node not found',
          nodeId: node,
        });
      }

      return res.json({
        success: true,
        data: {
          node: result.data.node,
          blockers: result.data.blockers || [],
        },
      });
    } else {
      // Get all nodes in phase with their blockers
      const query = `
        query PhaseBlockers($phase: String!) {
          nodesByPhase(phase: $phase) {
            nodeId
            title
            status
            nodeType

            content {
              summary
              impact
            }

            relationships {
              blockedBy {
                nodeId
                title
                status
              }
            }
          }
        }
      `;

      const result = await executeGraphQL(query, { phase });

      if (result.errors) {
        return res.status(400).json({ errors: result.errors });
      }

      const nodes = (result.data as any)?.nodesByPhase || [];
      const blocked = (nodes as any[]).filter(
        (n: any) => n.relationships.blockedBy.length > 0
      );

      return res.json({
        success: true,
        phase,
        totalNodes: (nodes as any[]).length,
        blockedNodes: (blocked as any[]).length,
        data: blocked,
      });
    }
  } catch (error) {
    console.error('Error fetching blockers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch blockers',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/mcp/graph/evidence
 *
 * Get evidence files referenced in documentation
 *
 * Query params:
 * - phase: Filter evidence by phase
 * - node: Get evidence for specific node
 *
 * Examples:
 * - GET /api/mcp/graph/evidence?phase=phase-5a
 * - GET /api/mcp/graph/evidence?node=n-2025-11-10-oauth-validation
 */
router.get('/evidence', async (req: Request, res: Response) => {
  try {
    const { phase, node } = req.query;

    if (node) {
      // Get evidence for specific node
      const query = `
        query NodeEvidence($nodeId: ID!) {
          node(nodeId: $nodeId) {
            nodeId
            title
            nodeType

            content {
              evidence
            }
          }
        }
      `;

      const result = await executeGraphQL(query, { nodeId: node });

      if (result.errors) {
        return res.status(400).json({ errors: result.errors });
      }

      if (!result.data?.node) {
        return res.status(404).json({
          success: false,
          error: 'Node not found',
          nodeId: node,
        });
      }

      const nodeData = (result.data as any).node;
      return res.json({
        success: true,
        data: {
          nodeId: nodeData.nodeId,
          title: nodeData.title,
          evidence: nodeData.content.evidence || [],
        },
      });
    } else if (phase) {
      // Get all evidence for phase
      const query = `
        query PhaseEvidence($phase: String!) {
          nodesByPhase(phase: $phase) {
            nodeId
            title
            nodeType

            content {
              evidence
            }
          }
        }
      `;

      const result = await executeGraphQL(query, { phase });

      if (result.errors) {
        return res.status(400).json({ errors: result.errors });
      }

      const nodes = (result.data as any)?.nodesByPhase || [];
      const evidenceMap: Record<string, any> = {};

      (nodes as any[]).forEach((n: any) => {
        if (n.content.evidence && n.content.evidence.length > 0) {
          evidenceMap[n.nodeId] = {
            nodeId: n.nodeId,
            title: n.title,
            evidence: n.content.evidence,
          };
        }
      });

      return res.json({
        success: true,
        phase,
        nodesWithEvidence: Object.keys(evidenceMap).length,
        data: Object.values(evidenceMap),
      });
    } else {
      // Get all evidence from decisions
      const query = `
        query AllEvidence {
          decisions {
            decisionId
            title
            evidence
          }
        }
      `;

      const result = await executeGraphQL(query);

      if (result.errors) {
        return res.status(400).json({ errors: result.errors });
      }

      const decisions = (result.data as any)?.decisions || [];
      const evidenceMap: Record<string, any> = {};

      (decisions as any[]).forEach((d: any) => {
        if (d.evidence && d.evidence.length > 0) {
          evidenceMap[d.decisionId] = {
            decisionId: d.decisionId,
            title: d.title,
            evidence: d.evidence,
          };
        }
      });

      return res.json({
        success: true,
        decisionsWithEvidence: Object.keys(evidenceMap).length,
        data: Object.values(evidenceMap),
      });
    }
  } catch (error) {
    console.error('Error fetching evidence:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch evidence',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
