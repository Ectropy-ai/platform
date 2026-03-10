/**
 * Assistant API Routes
 *
 * REST API endpoints for the Claude-powered assistant service.
 * Provides chat, conversation management, and status endpoints.
 *
 * Endpoints:
 * - POST /api/assistant/chat - Send a message and get a response
 * - GET /api/assistant/conversations - List user conversations
 * - GET /api/assistant/conversations/:id - Get conversation details
 * - DELETE /api/assistant/conversations/:id - Delete a conversation
 * - GET /api/assistant/status - Get service status
 *
 * @module routes/assistant
 * @version 1.0.0
 */

import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
import {
  getAssistantService,
  listConversations,
  getConversation,
  deleteConversation,
  updateContext,
  getStoreStats,
  isRedisAvailable,
  initializeConversationStore,
  type ChatRequest,
  type AuthorityLevel,
  type ChatContext,
} from '../services/assistant/index.js';
import { streamChat } from '../services/assistant/streaming.js';

const router: ExpressRouter = Router();

/**
 * POST /api/assistant/chat
 *
 * Send a message to the assistant and get a response.
 *
 * Request body:
 * {
 *   "message": "What decisions are pending for project-alpha?",
 *   "conversationId": "conv-abc123" (optional),
 *   "context": {
 *     "projectId": "project-alpha",
 *     "selectedVoxelId": "VOX-L2-A1-001"
 *   },
 *   "userAuthority": 3,
 *   "userId": "user-123",
 *   "userName": "John Smith"
 * }
 *
 * Response:
 * {
 *   "conversationId": "conv-abc123",
 *   "message": {
 *     "role": "assistant",
 *     "content": "Here are the pending decisions...",
 *     "toolCalls": [...]
 *   },
 *   "suggestedActions": ["Approve decision", "View details"],
 *   "metadata": { ... }
 * }
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      message,
      conversationId,
      context,
      userAuthority,
      userId,
      userName,
      stream,
    } = req.body;

    // Validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string',
      });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    // Validate authority level (0-6)
    const authority =
      typeof userAuthority === 'number'
        ? (Math.min(
            6,
            Math.max(0, Math.floor(userAuthority))
          ) as AuthorityLevel)
        : 0;

    const chatRequest: ChatRequest = {
      message,
      conversationId,
      context,
      userAuthority: authority,
      userId,
      userName,
      stream,
    };

    // Route to streaming if requested
    if (stream === true) {
      const assistant = getAssistantService();
      const client = assistant.getClaudeClient();
      const config = {
        maxHistoryMessages: 20, // Match DEFAULT_ASSISTANT_CONFIG
        maxToolIterations: 10, // Match DEFAULT_ASSISTANT_CONFIG
      };

      // streamChat handles its own response streaming and closing
      await streamChat(chatRequest, res, client, config);
      return; // Response already handled by streamChat
    }

    // Default blocking response
    const assistant = getAssistantService();
    const response = await assistant.chat(chatRequest);

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('[Assistant Routes] Chat error:', error);

    // Check for specific error types
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({
        success: false,
        error: 'Assistant service not configured',
        message: 'API key not set',
      });
    }

    if (errorMessage.includes('rate limit')) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'Please try again in a moment',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to process chat request',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/assistant/conversations
 *
 * List conversations for a user.
 *
 * Query params:
 * - userId: User ID (required)
 * - limit: Maximum number of results (default: 20)
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     { "id": "conv-abc", "title": "Project decisions", "updatedAt": "...", "messageCount": 5 }
 *   ]
 * }
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    const conversations = await listConversations(userId, limit);

    return res.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error('[Assistant Routes] List conversations error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list conversations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/assistant/conversations/:id
 *
 * Get a specific conversation with all messages.
 *
 * Path params:
 * - id: Conversation ID
 *
 * Query params:
 * - userId: User ID (required for authorization)
 */
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    const conversation = await getConversation(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    // Authorization check
    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this conversation',
      });
    }

    return res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error('[Assistant Routes] Get conversation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get conversation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/assistant/conversations/:id
 *
 * Delete a conversation.
 *
 * Path params:
 * - id: Conversation ID
 *
 * Query params:
 * - userId: User ID (required for authorization)
 */
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    const deleted = deleteConversation(id, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found or not authorized',
      });
    }

    return res.json({
      success: true,
      message: 'Conversation deleted',
    });
  } catch (error) {
    console.error('[Assistant Routes] Delete conversation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete conversation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/assistant/conversations/:id/context
 *
 * Update conversation context (e.g., selected voxel, active decision).
 *
 * Request body:
 * {
 *   "projectId": "project-alpha",
 *   "selectedVoxelId": "VOX-L2-A1-001",
 *   "activeDecisionId": "dec-123"
 * }
 *
 * Query params:
 * - userId: User ID (required for authorization)
 */
router.post('/conversations/:id/context', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string;
    const contextUpdates: Partial<ChatContext> = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    // Verify conversation exists and user owns it
    const conversation = await getConversation(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    if (conversation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this conversation',
      });
    }

    // Update context
    const updated = await updateContext(id, contextUpdates);

    return res.json({
      success: true,
      data: {
        conversationId: id,
        context: updated?.context,
      },
    });
  } catch (error) {
    console.error('[Assistant Routes] Update context error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update conversation context',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/assistant/status
 *
 * Get assistant service status with health checks.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "status": "operational" | "degraded" | "not_configured",
 *     "model": "claude-sonnet-4-20250514",
 *     "toolCount": 24,
 *     "storage": { "mode": "redis" | "memory" | "hybrid", "redisConnected": true },
 *     "conversationStats": { ... },
 *     "health": {
 *       "claude": true | false,
 *       "redis": true | false
 *     }
 *   }
 * }
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    let serviceStatus: {
      model: string;
      maxToolIterations: number;
      toolCount: number;
    };
    let claudeHealthy = false;

    try {
      const assistant = getAssistantService();
      serviceStatus = assistant.getStatus();
      claudeHealthy = true;
    } catch {
      // Service not initialized (missing API key)
      const stats = await getStoreStats();
      return res.json({
        success: true,
        data: {
          status: 'not_configured',
          message: 'ANTHROPIC_API_KEY not set',
          storage: {
            mode: stats.storageMode,
            redisConnected: isRedisAvailable(),
          },
          conversationStats: stats,
          health: {
            claude: false,
            redis: isRedisAvailable(),
          },
        },
      });
    }

    // Get conversation stats with storage mode
    const stats = await getStoreStats();
    const redisHealthy = isRedisAvailable();

    // Determine overall status
    let overallStatus: 'operational' | 'degraded' = 'operational';
    if (!claudeHealthy || (stats.storageMode === 'memory' && !redisHealthy)) {
      overallStatus = 'degraded';
    }

    return res.json({
      success: true,
      data: {
        status: overallStatus,
        ...serviceStatus,
        storage: {
          mode: stats.storageMode,
          redisConnected: redisHealthy,
        },
        conversationStats: stats,
        health: {
          claude: claudeHealthy,
          redis: redisHealthy,
        },
      },
    });
  } catch (error) {
    console.error('[Assistant Routes] Status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
export { router as assistantRouter };
