/**
 * Phone Agent API Routes
 *
 * REST API endpoints for SMS/Voice phone agent service.
 * Includes Twilio webhooks and management APIs.
 *
 * @module routes/phone-agent
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import {
  initializePhoneAgentService,
  handleInboundSms,
  handleInboundVoiceCall,
  handleVoiceGather,
  handleVoiceCallEnd,
  getPhoneAgentStatus,
  healthCheck,
  sendSms,
  getSession,
  getActiveSessionCount,
  getSessionStats,
  resolveUserFromPhone,
  registerPhoneNumber,
  getEscalationTargets,
  getVoiceSessionStats,
  isValidE164,
  formatToE164,
} from '../services/phone-agent/index.js';
import type {
  SendMessageRequest,
  AuthorityLevel,
} from '../services/phone-agent/types.js';

const router: ReturnType<typeof Router> = Router();

// ============================================================================
// Twilio Webhooks
// ============================================================================

/**
 * POST /api/phone/v1/webhooks/twilio/sms
 * Handle inbound SMS from Twilio
 */
router.post('/webhooks/twilio/sms', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-twilio-signature'] as string || '';
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const result = await handleInboundSms(req.body, requestUrl, signature);

    if (!result.success) {
      console.error('[Phone Routes] SMS webhook error:', result.error);
      res.status(400).send(result.error);
      return;
    }

    res.type('text/xml').send(result.twimlResponse);
  } catch (error) {
    console.error('[Phone Routes] SMS webhook error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * POST /api/phone/v1/webhooks/twilio/sms/status
 * Handle SMS status callbacks from Twilio
 */
router.post('/webhooks/twilio/sms/status', async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;

    console.log(`[Phone Routes] SMS status update: ${MessageSid} -> ${MessageStatus}`, {
      errorCode: ErrorCode,
    });

    // Update message status in session if needed
    // This would update the message in the conversation store

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Phone Routes] SMS status error:', error);
    res.status(500).send('Error');
  }
});

/**
 * POST /api/phone/v1/webhooks/twilio/voice
 * Handle inbound voice call from Twilio
 */
router.post('/webhooks/twilio/voice', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-twilio-signature'] as string || '';
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const result = await handleInboundVoiceCall(req.body, requestUrl, signature);

    if (!result.success) {
      res.status(400).send(result.error);
      return;
    }

    res.type('text/xml').send(result.twimlResponse);
  } catch (error) {
    console.error('[Phone Routes] Voice webhook error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * POST /api/phone/v1/webhooks/twilio/voice/gather
 * Handle voice gather results
 */
router.post('/webhooks/twilio/voice/gather', async (req: Request, res: Response) => {
  try {
    const result = await handleVoiceGather(req.body);
    res.type('text/xml').send(result.twimlResponse);
  } catch (error) {
    console.error('[Phone Routes] Voice gather error:', error);
    res.status(500).type('text/xml').send(`<?xml version="1.0"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * POST /api/phone/v1/webhooks/twilio/voice/confirm
 * Handle voice confirmation
 */
router.post('/webhooks/twilio/voice/confirm', async (req: Request, res: Response) => {
  try {
    const { SpeechResult } = req.body;
    const confirmation = (SpeechResult || '').toLowerCase();

    if (['yes', 'confirm', 'correct'].includes(confirmation)) {
      // Execute action and respond
      res.type('text/xml').send(`<?xml version="1.0"?>
<Response>
  <Say voice="Polly.Joanna">Done. Is there anything else I can help with?</Say>
  <Gather input="speech" timeout="5" action="/api/phone/v1/webhooks/twilio/voice/gather">
    <Say voice="Polly.Joanna">You can say help for options, or goodbye to end the call.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`);
    } else if (['no', 'cancel', 'wrong'].includes(confirmation)) {
      res.type('text/xml').send(`<?xml version="1.0"?>
<Response>
  <Say voice="Polly.Joanna">Cancelled. What else can I help with?</Say>
  <Redirect method="POST">/api/phone/v1/webhooks/twilio/voice</Redirect>
</Response>`);
    } else {
      res.type('text/xml').send(`<?xml version="1.0"?>
<Response>
  <Gather input="speech" timeout="5" action="/api/phone/v1/webhooks/twilio/voice/confirm">
    <Say voice="Polly.Joanna">Please say yes to confirm or no to cancel.</Say>
  </Gather>
  <Redirect method="POST">/api/phone/v1/webhooks/twilio/voice</Redirect>
</Response>`);
    }
  } catch (error) {
    console.error('[Phone Routes] Voice confirm error:', error);
    res.status(500).type('text/xml').send(`<?xml version="1.0"?>
<Response>
  <Say>An error occurred.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * POST /api/phone/v1/webhooks/twilio/voice/status
 * Handle voice call status callbacks
 */
router.post('/webhooks/twilio/voice/status', async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    console.log(`[Phone Routes] Voice status update: ${CallSid} -> ${CallStatus}`, {
      duration: CallDuration,
    });

    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      await handleVoiceCallEnd(req.body);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Phone Routes] Voice status error:', error);
    res.status(500).send('Error');
  }
});

// ============================================================================
// SMS API
// ============================================================================

/**
 * POST /api/phone/v1/send
 * Send outbound SMS
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, body, mediaUrl, projectId, tenantId } = req.body as SendMessageRequest;

    if (!to || !body) {
      res.status(400).json({ error: 'to and body are required' });
      return;
    }

    // Validate phone number
    let formattedTo: string;
    try {
      formattedTo = isValidE164(to) ? to : formatToE164(to);
    } catch {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    const result = await sendSms({
      to: formattedTo,
      body,
      mediaUrl,
      projectId,
      tenantId,
    });

    res.json(result);
  } catch (error) {
    console.error('[Phone Routes] Send SMS error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    });
  }
});

// ============================================================================
// Conversation API
// ============================================================================

/**
 * GET /api/phone/v1/conversations/:sessionId
 * Get conversation details
 */
router.get('/conversations/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      phoneNumber: session.phoneNumber,
      state: session.state,
      intent: session.intent,
      entities: session.entities,
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error('[Phone Routes] Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * GET /api/phone/v1/conversations/:sessionId/messages
 * Get conversation messages
 */
router.get('/conversations/:sessionId/messages', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      messages: session.messages.map((m) => ({
        messageId: m.messageId,
        direction: m.direction,
        body: m.body,
        status: m.status,
        timestamp: m.timestamp,
      })),
    });
  } catch (error) {
    console.error('[Phone Routes] Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * GET /api/phone/v1/conversations
 * List active conversations
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const stats = await getSessionStats();

    res.json({
      activeCount: stats.activeSessions,
      byState: stats.byState,
    });
  } catch (error) {
    console.error('[Phone Routes] List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// ============================================================================
// User Resolution API
// ============================================================================

/**
 * GET /api/phone/v1/users/resolve/:phoneNumber
 * Resolve user from phone number
 */
router.get('/users/resolve/:phoneNumber', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.params;

    const result = await resolveUserFromPhone(phoneNumber);

    if (!result.success) {
      res.status(404).json({
        error: result.error,
        suggestions: result.suggestions,
      });
      return;
    }

    res.json({
      userId: result.user!.userId,
      displayName: result.user!.displayName,
      phoneNumber: result.user!.phoneNumber,
      authorityLevel: result.user!.authorityLevel,
      role: result.user!.role,
      projects: result.user!.projects.map((p) => ({
        projectId: p.projectId,
        projectName: p.projectName,
        role: p.role,
        authorityLevel: p.authorityLevel,
      })),
    });
  } catch (error) {
    console.error('[Phone Routes] Resolve user error:', error);
    res.status(500).json({ error: 'Failed to resolve user' });
  }
});

/**
 * POST /api/phone/v1/users/register
 * Register phone number for user/project
 */
router.post('/users/register', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, userId, projectId, role, authorityLevel } = req.body;

    if (!phoneNumber || !userId || !projectId || !role || authorityLevel === undefined) {
      res.status(400).json({
        error: 'phoneNumber, userId, projectId, role, and authorityLevel are required',
      });
      return;
    }

    const result = await registerPhoneNumber(
      phoneNumber,
      userId,
      projectId,
      role,
      authorityLevel as AuthorityLevel
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Phone Routes] Register phone error:', error);
    res.status(500).json({ error: 'Failed to register phone number' });
  }
});

// ============================================================================
// Escalation API
// ============================================================================

/**
 * GET /api/phone/v1/escalation/:projectId
 * Get escalation targets for a project
 */
router.get('/escalation/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { currentLevel } = req.query;

    const level = parseInt(currentLevel as string, 10) || 0;
    const targets = await getEscalationTargets(projectId, level as AuthorityLevel);

    res.json({ targets });
  } catch (error) {
    console.error('[Phone Routes] Get escalation error:', error);
    res.status(500).json({ error: 'Failed to get escalation targets' });
  }
});

// ============================================================================
// Health & Status
// ============================================================================

/**
 * GET /api/phone/v1/health
 * Health check endpoint
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await healthCheck();

    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[Phone Routes] Health check error:', error);
    res.status(503).json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/phone/v1/status
 * Detailed status endpoint
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getPhoneAgentStatus();
    res.json(status);
  } catch (error) {
    console.error('[Phone Routes] Status error:', error);
    res.status(500).json({
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/phone/v1/stats
 * Get statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const sessionStats = await getSessionStats();
    const voiceStats = getVoiceSessionStats();
    const activeCount = await getActiveSessionCount();

    res.json({
      sms: {
        activeSessions: sessionStats.activeSessions,
        byState: sessionStats.byState,
      },
      voice: voiceStats,
      total: {
        activeConversations: activeCount + voiceStats.activeSessions,
      },
    });
  } catch (error) {
    console.error('[Phone Routes] Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================================================
// Initialization
// ============================================================================

/**
 * POST /api/phone/v1/initialize
 * Initialize phone agent service (admin only)
 */
router.post('/initialize', async (_req: Request, res: Response) => {
  try {
    const result = await initializePhoneAgentService();

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Phone agent service initialized' });
  } catch (error) {
    console.error('[Phone Routes] Initialize error:', error);
    res.status(500).json({ error: 'Failed to initialize service' });
  }
});

export default router;
