/**
 * Phone Agent Service
 *
 * Main service orchestrating SMS/Voice phone agent operations.
 * Integrates Twilio webhooks, conversation state machine, intent classification,
 * and SEPPA assistant for construction project communication.
 *
 * @module phone-agent/phone-agent.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import {
  buildSmsMessageUrn,
  formatSmsResponse,
  DEFAULT_RESPONSE_SETTINGS,
  calculateSmsSegments,
  type SmsMessage,
  type SmsConversation,
  type TwilioMessageData,
  type SendMessageRequest,
  type SendMessageResponse,
  type VoiceCall,
  type PhoneAgentStatus,
  type HealthCheckResponse,
  type UserIntent,
  type AuthorityLevel,
  type ConversationState,
  type IntentClassification,
  type ExtractedEntities,
} from './types.js';
import {
  isTwilioConfigured,
  sendSms,
  sendSmsFrom,
  validateTwilioSignature,
  parseWebhookParams,
  checkTwilioHealth,
  generateTwiml,
} from './twilio-client.js';
import {
  createSession,
  getSession,
  getOrCreateSession,
  saveSession,
  transitionState,
  forceTransition,
  updateSessionIdentity,
  updateSessionIntent,
  updateSessionEntities,
  updateSessionRagContext,
  setPendingAction,
  setActionResult,
  addMessageToSession,
  processInboundMessage,
  calculateMissingEntities,
  getActiveSessionCount,
  getSessionStats,
} from './conversation-state-machine.js';
import {
  classifyIntent,
  classifyIntentRuleBased,
  isConfidentClassification,
  getIntentDescription,
} from './intent-classifier.js';
import {
  resolveUserFromPhone,
  resolveUserForProject,
  getEscalationTargets,
} from './user-resolver.js';
import {
  createVoiceSession,
  getVoiceSession,
  endVoiceSession,
  generateWelcomeGreeting,
  generateConfirmationPrompt,
  generateGoodbyeTwiml,
  generateErrorTwiml,
  parseTwilioSpeechResult,
  getVoiceSessionStats,
} from './voice-processor.js';

// ============================================================================
// Service State
// ============================================================================

let serviceInitialized = false;
let lastHealthCheck: Date | null = null;
let messagesProcessed24h = 0;
let callsProcessed24h = 0;

// Reset counters daily
setInterval(() => {
  messagesProcessed24h = 0;
  callsProcessed24h = 0;
}, 24 * 60 * 60 * 1000);

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize phone agent service
 */
export async function initializePhoneAgentService(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Check Twilio configuration
    const twilioConfigured = isTwilioConfigured();
    if (!twilioConfigured) {
      console.warn('[Phone Agent] Twilio not configured - SMS/Voice disabled');
    }

    serviceInitialized = true;
    lastHealthCheck = new Date();

    console.log('[Phone Agent] Service initialized successfully');
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Phone Agent] Initialization failed:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check if service is initialized
 */
export function isPhoneAgentInitialized(): boolean {
  return serviceInitialized;
}

// ============================================================================
// SMS Webhook Handling
// ============================================================================

/**
 * Handle inbound SMS webhook from Twilio
 */
export async function handleInboundSms(
  webhookData: Record<string, unknown>,
  requestUrl: string,
  signature: string
): Promise<{
  success: boolean;
  twimlResponse?: string;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Validate Twilio signature
    const isValid = validateTwilioSignature(
      requestUrl,
      webhookData as Record<string, string>,
      signature
    );

    if (!isValid) {
      console.warn('[Phone Agent] Invalid Twilio signature');
      return { success: false, error: 'Invalid signature' };
    }

    // Parse webhook data
    const twilioData = parseWebhookParams(webhookData);

    // Create SMS message object
    const message: SmsMessage = {
      messageId: twilioData.messageSid,
      direction: 'inbound',
      phoneNumber: twilioData.from,
      twilioNumber: twilioData.to,
      body: twilioData.body || '',
      status: 'received',
      twilioData,
      timestamp: new Date().toISOString(),
    };

    // Process the message
    const result = await processInboundSmsMessage(message);

    messagesProcessed24h++;

    console.log(`[Phone Agent] SMS processed in ${Date.now() - startTime}ms`);

    // Return empty TwiML (we'll respond asynchronously)
    return {
      success: true,
      twimlResponse: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    };
  } catch (error) {
    console.error('[Phone Agent] Error handling inbound SMS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process inbound SMS message through conversation flow
 */
async function processInboundSmsMessage(message: SmsMessage): Promise<void> {
  // Get or create conversation session
  const session = await getOrCreateSession(
    message.phoneNumber,
    message.twilioNumber
  );

  // Add message to session
  await addMessageToSession(session.sessionId, message);

  // If session is idle, start the conversation flow
  if (session.state === 'IDLE') {
    await transitionState(session.sessionId, 'IDENTIFY_USER', 'New message received');
  }

  // Process based on current state
  await processConversationState(session.sessionId, message);
}

/**
 * Process conversation based on current state
 */
async function processConversationState(
  sessionId: string,
  message: SmsMessage
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {return;}

  switch (session.state) {
    case 'IDENTIFY_USER':
      await handleIdentifyUser(session, message);
      break;

    case 'CLASSIFY_INTENT':
      await handleClassifyIntent(session, message);
      break;

    case 'EXTRACT_ENTITIES':
      await handleExtractEntities(session, message);
      break;

    case 'COLLECT_DATA':
      await handleCollectData(session, message);
      break;

    case 'VALIDATE':
      await handleValidate(session, message);
      break;

    case 'CONFIRM':
      await handleConfirm(session, message);
      break;

    case 'EXECUTE':
      await handleExecute(session, message);
      break;

    case 'RESPOND':
      await handleRespond(session);
      break;

    case 'ERROR':
      await handleError(session);
      break;

    case 'ESCALATE':
      await handleEscalate(session);
      break;

    default:
      // Reset to idle if in unknown state
      await forceTransition(sessionId, 'IDLE', 'Unknown state reset');
  }
}

// ============================================================================
// State Handlers
// ============================================================================

/**
 * Handle IDENTIFY_USER state
 */
async function handleIdentifyUser(
  session: SmsConversation,
  message: SmsMessage
): Promise<void> {
  const userResult = await resolveUserFromPhone(
    message.phoneNumber,
    message.twilioNumber
  );

  if (!userResult.success || !userResult.user) {
    // User not found - send error response
    await sendSmsResponse(
      session,
      'Sorry, this phone number is not registered with any project. Please contact your project manager.'
    );
    await forceTransition(session.sessionId, 'IDLE', 'User not found');
    return;
  }

  // Update session with user identity
  await updateSessionIdentity(
    session.sessionId,
    userResult.user.userId,
    userResult.user.primaryProject?.projectId || '',
    userResult.user.authorityLevel
  );

  // Update message with resolved info
  message.userId = userResult.user.userId;
  message.projectId = userResult.user.primaryProject?.projectId;
  message.tenantId = userResult.user.tenantId;
  message.$id = buildSmsMessageUrn(userResult.user.tenantId, message.messageId);

  // Transition to classify intent
  await transitionState(
    session.sessionId,
    'CLASSIFY_INTENT',
    `User identified: ${userResult.user.displayName}`
  );

  // Continue to next state
  const updatedSession = await getSession(session.sessionId);
  if (updatedSession) {
    await handleClassifyIntent(updatedSession, message);
  }
}

/**
 * Handle CLASSIFY_INTENT state
 */
async function handleClassifyIntent(
  session: SmsConversation,
  message: SmsMessage
): Promise<void> {
  // Get conversation history for context
  const history = session.messages.map((m) =>
    `${m.direction === 'inbound' ? 'User' : 'Assistant'}: ${m.body}`
  );

  // Classify intent
  const classification = await classifyIntent(message.body, {
    userId: session.userId,
    projectId: session.projectId,
    authorityLevel: session.authorityLevel,
    previousIntent: session.intent,
    conversationHistory: history,
  });

  // Update session with intent
  await updateSessionIntent(session.sessionId, classification.intent);

  // Store classification in message
  message.parsedIntent = classification;

  // Update session entities
  await updateSessionEntities(session.sessionId, classification.entities);

  // Transition to extract entities
  await transitionState(
    session.sessionId,
    'EXTRACT_ENTITIES',
    `Intent: ${classification.intent} (${Math.round(classification.confidence * 100)}%)`
  );

  // Continue to next state
  const updatedSession = await getSession(session.sessionId);
  if (updatedSession) {
    await handleExtractEntities(updatedSession, message);
  }
}

/**
 * Handle EXTRACT_ENTITIES state
 */
async function handleExtractEntities(
  session: SmsConversation,
  _message: SmsMessage
): Promise<void> {
  // Calculate missing entities for this intent
  const missingEntities = calculateMissingEntities(
    session.intent || 'unknown',
    session.entities
  );

  await updateSessionEntities(session.sessionId, {}, missingEntities);

  if (missingEntities.length > 0) {
    // Need more data
    await transitionState(
      session.sessionId,
      'COLLECT_DATA',
      `Missing entities: ${missingEntities.join(', ')}`
    );

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleCollectData(updatedSession, _message);
    }
  } else {
    // Have all required data
    await transitionState(
      session.sessionId,
      'VALIDATE',
      'All entities extracted'
    );

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleValidate(updatedSession, _message);
    }
  }
}

/**
 * Handle COLLECT_DATA state
 */
async function handleCollectData(
  session: SmsConversation,
  _message: SmsMessage
): Promise<void> {
  // Ask for missing information
  const missingField = session.missingEntities[0];

  const prompts: Record<string, string> = {
    voxelId: 'What is the voxel or zone ID? (e.g., VOX-123 or Zone A)',
    zone: 'Which zone or area are you referring to?',
    trade: 'What trade is this for? (e.g., concrete, electrical)',
    status: 'What is the current status?',
    description: 'Please provide a brief description.',
    decisionId: 'What is the decision ID? (e.g., DEC-123)',
    date: 'What date? (e.g., tomorrow, Friday, or 01/25)',
  };

  const prompt = prompts[missingField] || `Please provide the ${missingField}.`;

  await sendSmsResponse(session, prompt);
}

/**
 * Handle VALIDATE state
 */
async function handleValidate(
  session: SmsConversation,
  _message: SmsMessage
): Promise<void> {
  // Check if user has authority for this action
  const requiredAuthority = getRequiredAuthorityForIntent(session.intent || 'unknown');

  if ((session.authorityLevel || 0) < requiredAuthority) {
    // Needs escalation
    await transitionState(
      session.sessionId,
      'ESCALATE',
      `Authority level ${session.authorityLevel} < required ${requiredAuthority}`
    );

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleEscalate(updatedSession);
    }
    return;
  }

  // Prepare action for confirmation
  const actionDescription = getActionDescription(session.intent || 'unknown', session.entities);

  await setPendingAction(session.sessionId, {
    tool: mapIntentToTool(session.intent || 'unknown'),
    input: session.entities as Record<string, unknown>,
    description: actionDescription,
  });

  // Transition to confirm
  await transitionState(
    session.sessionId,
    'CONFIRM',
    'Action prepared, awaiting confirmation'
  );

  // Ask for confirmation
  await sendSmsResponse(
    session,
    `${actionDescription}\n\nReply YES to confirm or NO to cancel.`
  );
}

/**
 * Handle CONFIRM state
 */
async function handleConfirm(
  session: SmsConversation,
  message: SmsMessage
): Promise<void> {
  const confirmText = message.body.toLowerCase().trim();

  if (['yes', 'y', 'confirm', 'ok'].includes(confirmText)) {
    await transitionState(session.sessionId, 'EXECUTE', 'User confirmed');

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleExecute(updatedSession, message);
    }
  } else if (['no', 'n', 'cancel'].includes(confirmText)) {
    await sendSmsResponse(session, 'Action cancelled. How else can I help?');
    await forceTransition(session.sessionId, 'IDLE', 'User cancelled');
  } else {
    // Unclear response
    await sendSmsResponse(session, 'Please reply YES to confirm or NO to cancel.');
  }
}

/**
 * Handle EXECUTE state
 */
async function handleExecute(
  session: SmsConversation,
  _message: SmsMessage
): Promise<void> {
  const pendingAction = session.pendingAction;

  if (!pendingAction) {
    await setActionResult(session.sessionId, {
      success: false,
      error: 'No pending action',
    });
    await transitionState(session.sessionId, 'RESPOND', 'No action to execute');
    return;
  }

  try {
    // Execute the action (integrate with SEPPA assistant tools)
    // This would call the appropriate tool from the assistant service
    const result = await executeAction(
      pendingAction.tool,
      pendingAction.input,
      session
    );

    await setActionResult(session.sessionId, result);
    await transitionState(session.sessionId, 'RESPOND', 'Action executed');

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleRespond(updatedSession);
    }
  } catch (error) {
    await setActionResult(session.sessionId, {
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    });
    await transitionState(session.sessionId, 'ERROR', 'Action execution failed');

    const updatedSession = await getSession(session.sessionId);
    if (updatedSession) {
      await handleError(updatedSession);
    }
  }
}

/**
 * Handle RESPOND state
 */
async function handleRespond(session: SmsConversation): Promise<void> {
  const result = session.result;

  let responseText: string;
  if (result?.success) {
    responseText = getSuccessResponse(session.intent || 'unknown', session.entities);
    if (result.createdUrns && result.createdUrns.length > 0) {
      responseText += `\nRef: ${result.createdUrns[0]}`;
    }
  } else {
    responseText = result?.error || 'Sorry, something went wrong.';
  }

  await sendSmsResponse(session, responseText);
  await forceTransition(session.sessionId, 'IDLE', 'Response sent');
}

/**
 * Handle ERROR state
 */
async function handleError(session: SmsConversation): Promise<void> {
  const errorMessage = session.result?.error || 'An unexpected error occurred.';
  await sendSmsResponse(
    session,
    `${errorMessage}\nPlease try again or text HELP for assistance.`
  );
  await forceTransition(session.sessionId, 'IDLE', 'Error handled');
}

/**
 * Handle ESCALATE state
 */
async function handleEscalate(session: SmsConversation): Promise<void> {
  // Get escalation targets
  const targets = await getEscalationTargets(
    session.projectId || '',
    session.authorityLevel || 0,
    session.tenantId
  );

  if (targets.length === 0) {
    await sendSmsResponse(
      session,
      'Unable to escalate at this time. Please contact your supervisor directly.'
    );
    await forceTransition(session.sessionId, 'IDLE', 'No escalation targets');
    return;
  }

  // Notify first escalation target
  const target = targets[0];
  const escalationMessage = `Escalation from ${session.phoneNumber}: ${session.entities.description || session.intent || 'Assistance requested'}`;

  if (target.phoneNumber) {
    await sendSms({
      to: target.phoneNumber,
      body: escalationMessage,
      projectId: session.projectId,
      tenantId: session.tenantId,
    });
  }

  await sendSmsResponse(
    session,
    `Your request has been escalated to ${target.displayName}. They will contact you shortly.`
  );

  await forceTransition(session.sessionId, 'IDLE', 'Escalation sent');
}

// ============================================================================
// Voice Webhook Handling
// ============================================================================

/**
 * Handle inbound voice call webhook
 */
export async function handleInboundVoiceCall(
  webhookData: Record<string, unknown>,
  requestUrl: string,
  signature: string
): Promise<{
  success: boolean;
  twimlResponse?: string;
  error?: string;
}> {
  try {
    // Validate signature
    const isValid = validateTwilioSignature(
      requestUrl,
      webhookData as Record<string, string>,
      signature
    );

    if (!isValid) {
      return { success: false, error: 'Invalid signature' };
    }

    const callSid = String(webhookData.CallSid || '');
    const from = String(webhookData.From || '');
    const to = String(webhookData.To || '');

    // Resolve user
    const userResult = await resolveUserFromPhone(from, to);

    if (!userResult.success || !userResult.user) {
      return {
        success: true,
        twimlResponse: generateErrorTwiml(
          'Sorry, this phone number is not registered with any project.'
        ),
      };
    }

    // Create voice session
    createVoiceSession(callSid, uuidv4(), {
      userId: userResult.user.userId,
      projectId: userResult.user.primaryProject?.projectId,
      tenantId: userResult.user.tenantId,
    });

    callsProcessed24h++;

    // Generate welcome greeting
    const projectName = userResult.user.primaryProject?.projectName || 'your project';
    const gatherUrl = `${process.env.TWILIO_WEBHOOK_BASE_URL}/voice/gather`;

    return {
      success: true,
      twimlResponse: generateWelcomeGreeting(projectName, gatherUrl),
    };
  } catch (error) {
    console.error('[Phone Agent] Error handling voice call:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle voice gather result
 */
export async function handleVoiceGather(
  webhookData: Record<string, unknown>
): Promise<{ twimlResponse: string }> {
  const callSid = String(webhookData.CallSid || '');
  const session = getVoiceSession(callSid);

  if (!session) {
    return {
      twimlResponse: generateErrorTwiml('Session expired. Please call again.'),
    };
  }

  // Parse speech result
  const speechResult = parseTwilioSpeechResult(webhookData as Record<string, string>);

  if (!speechResult) {
    return {
      twimlResponse: generateErrorTwiml(
        "I didn't understand that.",
        `${process.env.TWILIO_WEBHOOK_BASE_URL}/voice`
      ),
    };
  }

  // Classify intent from speech
  const classification = await classifyIntent(speechResult.transcript, {
    userId: session.userId,
    projectId: session.projectId,
  });

  // Generate response based on intent
  if (classification.intent === 'unknown') {
    return {
      twimlResponse: generateErrorTwiml(
        "I didn't understand that. You can say things like report completion, check status, or need a decision.",
        `${process.env.TWILIO_WEBHOOK_BASE_URL}/voice`
      ),
    };
  }

  // For now, generate confirmation prompt
  const actionDescription = getIntentDescription(classification.intent);
  const confirmUrl = `${process.env.TWILIO_WEBHOOK_BASE_URL}/voice/confirm`;

  return {
    twimlResponse: generateConfirmationPrompt(actionDescription, confirmUrl),
  };
}

/**
 * Handle voice call end
 */
export async function handleVoiceCallEnd(
  webhookData: Record<string, unknown>
): Promise<void> {
  const callSid = String(webhookData.CallSid || '');
  endVoiceSession(callSid);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Send SMS response
 */
async function sendSmsResponse(
  session: SmsConversation,
  text: string
): Promise<void> {
  const segments = formatSmsResponse(text, DEFAULT_RESPONSE_SETTINGS);

  for (const segment of segments) {
    const response = await sendSmsFrom(
      session.twilioNumber,
      session.phoneNumber,
      segment
    );

    // Record outbound message
    const outboundMessage: SmsMessage = {
      messageId: response.messageId,
      direction: 'outbound',
      phoneNumber: session.phoneNumber,
      twilioNumber: session.twilioNumber,
      body: segment,
      status: response.status,
      numSegments: response.segments,
      timestamp: response.sentAt,
    };

    await addMessageToSession(session.sessionId, outboundMessage);
  }
}

/**
 * Execute action via SEPPA assistant
 */
async function executeAction(
  tool: string,
  input: ExtractedEntities,
  _session: SmsConversation
): Promise<{ success: boolean; createdUrns?: string[]; error?: string }> {
  // This would integrate with the SEPPA assistant service
  // For now, simulate successful execution
  console.log(`[Phone Agent] Executing tool: ${tool}`, input);

  return {
    success: true,
    createdUrns: [`urn:luhtech:action:${uuidv4()}`],
  };
}

/**
 * Get required authority level for intent
 */
function getRequiredAuthorityForIntent(intent: UserIntent): AuthorityLevel {
  const requirements: Record<UserIntent, AuthorityLevel> = {
    report_completion: 0,
    query_status: 0,
    capture_evidence: 0,
    request_decision: 1,
    schedule_inspection: 1,
    approve_decision: 2,
    escalate_decision: 0,
    unknown: 0,
  };

  return requirements[intent] || 0;
}

/**
 * Map intent to tool name
 */
function mapIntentToTool(intent: UserIntent): string {
  const tools: Record<UserIntent, string> = {
    report_completion: 'report_work_complete',
    request_decision: 'create_decision_request',
    query_status: 'get_project_status',
    approve_decision: 'approve_decision',
    escalate_decision: 'escalate_to_authority',
    capture_evidence: 'upload_evidence',
    schedule_inspection: 'schedule_inspection',
    unknown: 'general_query',
  };

  return tools[intent] || 'general_query';
}

/**
 * Get action description for confirmation
 */
function getActionDescription(
  intent: UserIntent,
  entities: ExtractedEntities
): string {
  switch (intent) {
    case 'report_completion':
      return entities.voxelId
        ? `Mark ${entities.voxelId} as complete`
        : 'Mark work as complete';

    case 'request_decision':
      return `Request decision: ${entities.description || 'New request'}`;

    case 'approve_decision':
      return `Approve decision ${entities.decisionId || ''}`;

    case 'escalate_decision':
      return 'Escalate to supervisor';

    case 'schedule_inspection':
      return `Schedule inspection for ${entities.date || 'requested date'}`;

    case 'capture_evidence':
      return `Record evidence for ${entities.voxelId || 'current work'}`;

    default:
      return 'Process your request';
  }
}

/**
 * Get success response text
 */
function getSuccessResponse(
  intent: UserIntent,
  entities: ExtractedEntities
): string {
  switch (intent) {
    case 'report_completion':
      return entities.voxelId
        ? `${entities.voxelId} marked as complete.`
        : 'Work marked as complete.';

    case 'request_decision':
      return 'Decision request submitted. Stakeholders will be notified.';

    case 'approve_decision':
      return `Decision ${entities.decisionId || ''} approved.`;

    case 'query_status':
      return 'Status retrieved.';

    case 'schedule_inspection':
      return `Inspection scheduled for ${entities.date || 'requested date'}.`;

    default:
      return 'Request processed successfully.';
  }
}

// ============================================================================
// Status & Health
// ============================================================================

/**
 * Get phone agent service status
 */
export async function getPhoneAgentStatus(): Promise<PhoneAgentStatus> {
  const twilioHealth = await checkTwilioHealth();
  const sessionStats = await getSessionStats();
  const voiceStats = getVoiceSessionStats();

  lastHealthCheck = new Date();

  let status: 'operational' | 'degraded' | 'unavailable';
  if (twilioHealth.available) {
    status = 'operational';
  } else if (serviceInitialized) {
    status = 'degraded';
  } else {
    status = 'unavailable';
  }

  return {
    status,
    twilio: {
      connected: twilioHealth.available,
      accountSid: twilioHealth.accountSid,
      phoneNumbers: [], // Would get from config
    },
    sms: {
      enabled: twilioHealth.available,
      messagesProcessed24h,
    },
    voice: {
      enabled: twilioHealth.available,
      callsProcessed24h,
    },
    conversations: {
      active: sessionStats.activeSessions + voiceStats.activeSessions,
      totalToday: messagesProcessed24h + callsProcessed24h,
    },
    lastHealthCheck: lastHealthCheck.toISOString(),
  };
}

/**
 * Health check
 */
export async function healthCheck(): Promise<HealthCheckResponse> {
  const twilioHealth = await checkTwilioHealth();

  return {
    healthy: twilioHealth.available || serviceInitialized,
    twilio: twilioHealth.available,
    redis: true, // Would check Redis
    database: true, // Would check database
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
  sendSms,
  sendSmsFrom,
  getSession,
  createSession,
  getActiveSessionCount,
};

export type {
  SmsMessage,
  SmsConversation,
  VoiceCall,
  PhoneAgentStatus,
};
