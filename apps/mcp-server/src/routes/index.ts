import { type Router, Router as createRouter } from 'express';
import { semanticSearchRouter } from './semantic-search.js';
import { documentAnalysisRouter } from './document-analysis.js';
import { codeGenerationRouter } from './code-generation.js';
import { toolsRouter } from './tools.js';
import agentsRouter from './agents.routes.js';
import { buildAnalysisRouter } from './build-analysis.routes.js';
import { patternDetectionRouter } from './pattern-detection.routes.js';
import { agentGuidanceRouter } from './agent-guidance.routes.js';
import { roadmapRouter } from './roadmap.routes.js';
import graphRouter from './graph.js';
import votesRouter from './votes.js';
import councilVotesRouter from './council-votes.routes.js';
import { deliverablesRouter } from './deliverables.routes.js';
import { pmDecisionRouter } from './pm-decision.routes.js';
import { assistantRouter } from './assistant.routes.js';
import { dualProcessRouter } from './dual-process.routes.js';
import { dependencyManagementRouter } from './dependency-management.routes.js';
import { udeRouter } from './ude.routes.js';
import { crmRouter } from './crm.routes.js';

// Seppä Agent Services - EIL (Ectropy Intelligence Layer)
import ragRouter from './rag.routes.js';
import phoneAgentRouter from './phone-agent.routes.js';

export const apiRouter: Router = createRouter();

apiRouter.get('/status', (req, res) => {
  res.json({
    message: 'MCP Server Operational',
    user: (req as any).user,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use('/semantic-search', semanticSearchRouter as any);
apiRouter.use('/document-analysis', documentAnalysisRouter as any);
apiRouter.use('/code-generation', codeGenerationRouter as any);
apiRouter.use('/tools', toolsRouter as any);
apiRouter.use('/agents', agentsRouter);
apiRouter.use('/mcp', buildAnalysisRouter);
apiRouter.use('/mcp', patternDetectionRouter);
apiRouter.use('/mcp', agentGuidanceRouter);
apiRouter.use('/mcp', roadmapRouter);
apiRouter.use('/mcp/graph', graphRouter);
apiRouter.use('/mcp/votes', votesRouter);
apiRouter.use('/mcp/council', councilVotesRouter);
apiRouter.use('/mcp/deliverables', deliverablesRouter);
apiRouter.use('/mcp/pm-tools', pmDecisionRouter);
apiRouter.use('/mcp/dual-process', dualProcessRouter);
apiRouter.use('/mcp/dependency', dependencyManagementRouter);
apiRouter.use('/mcp/ude', udeRouter);
apiRouter.use('/mcp/crm', crmRouter);
apiRouter.use('/assistant', assistantRouter);

// Seppä Agent Services - EIL (Ectropy Intelligence Layer)
// RAG: Vector search, embedding generation, context assembly
apiRouter.use('/rag', ragRouter);
// Phone Agent: SMS/Voice channel handling via Twilio
apiRouter.use('/phone', phoneAgentRouter);
