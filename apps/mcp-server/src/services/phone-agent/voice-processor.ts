/**
 * Voice Processing Service
 *
 * Speech-to-text and text-to-speech processing for voice calls.
 * Supports Twilio's built-in speech recognition and external providers.
 *
 * @module phone-agent/voice-processor
 * @version 1.0.0
 */

import type {
  SpeechRecognitionResult,
  TtsRequest,
  TtsResponse,
  TwimlOptions,
  VoiceCall,
  VoiceCallStatus,
} from './types.js';
import { generateTwiml, generateConversationTwiml } from './twilio-client.js';

// ============================================================================
// Configuration
// ============================================================================

interface VoiceConfig {
  defaultVoice: string;
  defaultLanguage: string;
  speechModel: 'default' | 'phone_call' | 'video';
  profanityFilter: boolean;
  enhancedModels: boolean;
}

const config: VoiceConfig = {
  defaultVoice: process.env.TTS_VOICE || 'Polly.Joanna',
  defaultLanguage: process.env.TTS_LANGUAGE || 'en-US',
  speechModel: (process.env.STT_MODEL as VoiceConfig['speechModel']) || 'phone_call',
  profanityFilter: process.env.PROFANITY_FILTER !== 'false',
  enhancedModels: process.env.ENHANCED_SPEECH_MODELS === 'true',
};

// ============================================================================
// Voice State Management
// ============================================================================

interface VoiceSession {
  callSid: string;
  sessionId: string;
  userId?: string;
  projectId?: string;
  tenantId?: string;
  state: 'greeting' | 'listening' | 'processing' | 'responding' | 'transferring' | 'ended';
  transcript: string[];
  lastActivity: Date;
}

const voiceSessions = new Map<string, VoiceSession>();

/**
 * Create voice session
 */
export function createVoiceSession(
  callSid: string,
  sessionId: string,
  context?: {
    userId?: string;
    projectId?: string;
    tenantId?: string;
  }
): VoiceSession {
  const session: VoiceSession = {
    callSid,
    sessionId,
    userId: context?.userId,
    projectId: context?.projectId,
    tenantId: context?.tenantId,
    state: 'greeting',
    transcript: [],
    lastActivity: new Date(),
  };

  voiceSessions.set(callSid, session);
  return session;
}

/**
 * Get voice session
 */
export function getVoiceSession(callSid: string): VoiceSession | undefined {
  return voiceSessions.get(callSid);
}

/**
 * Update voice session
 */
export function updateVoiceSession(
  callSid: string,
  updates: Partial<VoiceSession>
): VoiceSession | undefined {
  const session = voiceSessions.get(callSid);
  if (!session) {return undefined;}

  Object.assign(session, updates, { lastActivity: new Date() });
  return session;
}

/**
 * Add transcript entry
 */
export function addTranscript(callSid: string, text: string): void {
  const session = voiceSessions.get(callSid);
  if (session) {
    session.transcript.push(text);
    session.lastActivity = new Date();
  }
}

/**
 * End voice session
 */
export function endVoiceSession(callSid: string): VoiceSession | undefined {
  const session = voiceSessions.get(callSid);
  if (session) {
    session.state = 'ended';
    // Keep session for 5 minutes after ending for logging
    setTimeout(() => voiceSessions.delete(callSid), 5 * 60 * 1000);
  }
  return session;
}

// ============================================================================
// Speech Recognition (STT)
// ============================================================================

/**
 * Parse Twilio speech recognition result
 */
export function parseTwilioSpeechResult(
  twilioParams: Record<string, string>
): SpeechRecognitionResult | null {
  const speechResult = twilioParams.SpeechResult;
  const confidence = parseFloat(twilioParams.Confidence || '0');

  if (!speechResult) {
    return null;
  }

  return {
    transcript: speechResult,
    confidence,
    isFinal: true,
    alternatives: [],
  };
}

/**
 * Generate TwiML for speech gathering
 */
export function generateSpeechGatherTwiml(
  prompt: string,
  actionUrl: string,
  options?: {
    timeout?: number;
    speechTimeout?: string;
    hints?: string;
    language?: string;
    voice?: string;
  }
): string {
  return generateConversationTwiml(prompt, actionUrl, {
    input: 'speech',
    timeout: options?.timeout || 5,
    speechTimeout: options?.speechTimeout || 'auto',
    hints: options?.hints,
    language: options?.language || config.defaultLanguage,
    voice: (options?.voice || config.defaultVoice) as TwimlOptions['voice'],
    profanityFilter: config.profanityFilter,
  });
}

/**
 * Generate TwiML for DTMF gathering (keypad input)
 */
export function generateDtmfGatherTwiml(
  prompt: string,
  actionUrl: string,
  options?: {
    numDigits?: number;
    timeout?: number;
    finishOnKey?: string;
  }
): string {
  const voice = config.defaultVoice;
  const numDigits = options?.numDigits || 1;
  const timeout = options?.timeout || 10;
  const finishOnKey = options?.finishOnKey || '#';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="${numDigits}" timeout="${timeout}" finishOnKey="${finishOnKey}" action="${escapeXml(actionUrl)}" method="POST">
    <Say voice="${voice}">${escapeXml(prompt)}</Say>
  </Gather>
  <Say voice="${voice}">I didn't receive any input. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML for hybrid input (speech or DTMF)
 */
export function generateHybridGatherTwiml(
  prompt: string,
  actionUrl: string,
  options?: {
    timeout?: number;
    speechTimeout?: string;
    numDigits?: number;
    hints?: string;
  }
): string {
  const voice = config.defaultVoice;
  const timeout = options?.timeout || 5;
  const numDigits = options?.numDigits || 1;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="${numDigits}" timeout="${timeout}" speechTimeout="${options?.speechTimeout || 'auto'}" action="${escapeXml(actionUrl)}" method="POST"${options?.hints ? ` hints="${escapeXml(options.hints)}"` : ''}>
    <Say voice="${voice}">${escapeXml(prompt)}</Say>
  </Gather>
  <Say voice="${voice}">I didn't hear anything. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// ============================================================================
// Text-to-Speech (TTS)
// ============================================================================

/**
 * Supported Polly voices
 */
export const POLLY_VOICES = {
  'en-US': ['Joanna', 'Matthew', 'Ivy', 'Kendra', 'Kimberly', 'Salli', 'Joey', 'Justin'],
  'en-GB': ['Amy', 'Emma', 'Brian'],
  'en-AU': ['Nicole', 'Russell'],
  'es-ES': ['Conchita', 'Lucia', 'Enrique'],
  'es-MX': ['Mia'],
  'fr-FR': ['Celine', 'Lea', 'Mathieu'],
  'de-DE': ['Marlene', 'Vicki', 'Hans'],
} as const;

/**
 * Generate TwiML say response
 */
export function generateSayTwiml(
  text: string,
  options?: {
    voice?: string;
    language?: string;
    loop?: number;
  }
): string {
  return generateTwiml('say', text, {
    voice: (options?.voice || config.defaultVoice) as TwimlOptions['voice'],
    language: options?.language || config.defaultLanguage,
    loop: options?.loop,
  });
}

/**
 * Generate TwiML play response (for audio URLs)
 */
export function generatePlayTwiml(audioUrl: string, loop?: number): string {
  return generateTwiml('play', audioUrl, { loop });
}

/**
 * Format text for natural speech
 */
export function formatForSpeech(text: string): string {
  // Replace abbreviations with spoken forms
  let formatted = text
    .replace(/\bVOX-/gi, 'Voxel ')
    .replace(/\bDEC-/gi, 'Decision ')
    .replace(/\bRFI-/gi, 'R F I ')
    .replace(/\bCO-/gi, 'Change Order ')
    .replace(/\bPM\b/gi, 'Project Manager')
    .replace(/\bGC\b/gi, 'General Contractor')
    .replace(/\bSI\b/gi, 'Site Inspector')
    .replace(/\bHVAC\b/gi, 'H V A C');

  // Add pauses at punctuation
  formatted = formatted
    .replace(/\./g, '.<break time="300ms"/>')
    .replace(/,/g, ',<break time="150ms"/>')
    .replace(/:/g, ':<break time="200ms"/>');

  // Speak numbers clearly
  formatted = formatted.replace(/(\d+)/g, '<say-as interpret-as="number">$1</say-as>');

  return formatted;
}

/**
 * Generate SSML for enhanced speech
 */
export function generateSsml(
  text: string,
  options?: {
    rate?: 'x-slow' | 'slow' | 'medium' | 'fast' | 'x-fast';
    pitch?: 'x-low' | 'low' | 'medium' | 'high' | 'x-high';
    volume?: 'silent' | 'x-soft' | 'soft' | 'medium' | 'loud' | 'x-loud';
  }
): string {
  const rate = options?.rate || 'medium';
  const pitch = options?.pitch || 'medium';
  const volume = options?.volume || 'medium';

  return `<speak>
  <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
    ${formatForSpeech(text)}
  </prosody>
</speak>`;
}

// ============================================================================
// Voice Call Flow Management
// ============================================================================

/**
 * Generate welcome greeting TwiML
 */
export function generateWelcomeGreeting(
  projectName: string,
  gatherUrl: string
): string {
  const greeting = `Welcome to ${projectName} project assistant. How can I help you today? You can say things like "report completion", "check status", or "need a decision".`;

  return generateSpeechGatherTwiml(greeting, gatherUrl, {
    hints: 'report completion, check status, need decision, approve, escalate, help',
    timeout: 8,
    speechTimeout: 'auto',
  });
}

/**
 * Generate help menu TwiML
 */
export function generateHelpMenu(gatherUrl: string): string {
  const helpText = `You can say:
    "Report completion" to mark work as done.
    "Check status" to get project updates.
    "Need decision" to request an approval.
    "Escalate" to reach a supervisor.
    Or say "Goodbye" to end the call.
    What would you like to do?`;

  return generateSpeechGatherTwiml(helpText, gatherUrl, {
    hints: 'report completion, check status, need decision, escalate, goodbye',
    timeout: 10,
  });
}

/**
 * Generate confirmation TwiML
 */
export function generateConfirmationPrompt(
  actionDescription: string,
  confirmUrl: string
): string {
  const prompt = `I understood you want to ${actionDescription}. Is that correct? Say yes to confirm or no to cancel.`;

  return generateSpeechGatherTwiml(prompt, confirmUrl, {
    hints: 'yes, no, confirm, cancel, correct, wrong',
    timeout: 5,
  });
}

/**
 * Generate transfer TwiML
 */
export function generateTransferTwiml(
  targetNumber: string,
  announcementBefore?: string
): string {
  if (announcementBefore) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${config.defaultVoice}">${escapeXml(announcementBefore)}</Say>
  <Dial timeout="30">${escapeXml(targetNumber)}</Dial>
</Response>`;
  }

  return generateTwiml('dial', targetNumber, { timeout: 30 });
}

/**
 * Generate goodbye TwiML
 */
export function generateGoodbyeTwiml(message?: string): string {
  const farewell = message || 'Thank you for calling. Goodbye!';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${config.defaultVoice}">${escapeXml(farewell)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate error TwiML
 */
export function generateErrorTwiml(
  errorMessage: string,
  retryUrl?: string
): string {
  if (retryUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${config.defaultVoice}">${escapeXml(errorMessage)} Let's try again.</Say>
  <Redirect method="POST">${escapeXml(retryUrl)}</Redirect>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${config.defaultVoice}">${escapeXml(errorMessage)} Please try again later. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// ============================================================================
// Voice Response Generation
// ============================================================================

/**
 * Generate response for intent
 */
export function generateIntentResponse(
  intent: string,
  entities: Record<string, unknown>,
  result?: { success: boolean; message?: string }
): string {
  if (result?.success === false) {
    return result.message || 'Sorry, I was unable to complete that action.';
  }

  switch (intent) {
    case 'report_completion':
      return entities.voxelId
        ? `I've recorded that ${entities.voxelId} is complete. Is there anything else?`
        : 'I\'ve recorded the completion. Is there anything else?';

    case 'query_status':
      return 'Let me check the current status for you.';

    case 'request_decision':
      return 'I\'ve submitted your decision request. The relevant stakeholders will be notified.';

    case 'approve_decision':
      return entities.decisionId
        ? `Decision ${entities.decisionId} has been approved.`
        : 'The decision has been approved.';

    case 'escalate_decision':
      return 'I\'m escalating this to the next level. Someone will contact you shortly.';

    case 'schedule_inspection':
      return entities.date
        ? `I've noted your inspection request for ${entities.date}.`
        : 'I\'ve submitted your inspection request.';

    default:
      return 'I\'ve processed your request. Is there anything else I can help with?';
  }
}

// ============================================================================
// Call Analytics
// ============================================================================

/**
 * Calculate call duration
 */
export function calculateCallDuration(
  startedAt: string,
  endedAt?: string
): number {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.floor((end - start) / 1000);
}

/**
 * Get voice session statistics
 */
export function getVoiceSessionStats(): {
  activeSessions: number;
  byState: Record<string, number>;
} {
  const byState: Record<string, number> = {
    greeting: 0,
    listening: 0,
    processing: 0,
    responding: 0,
    transferring: 0,
    ended: 0,
  };

  let activeSessions = 0;

  for (const session of voiceSessions.values()) {
    if (session.state !== 'ended') {
      activeSessions++;
    }
    byState[session.state] = (byState[session.state] || 0) + 1;
  }

  return { activeSessions, byState };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse DTMF input
 */
export function parseDtmfInput(digits: string): {
  value: string;
  isValid: boolean;
} {
  const cleaned = digits.replace(/[^0-9*#]/g, '');
  return {
    value: cleaned,
    isValid: cleaned.length > 0,
  };
}

/**
 * Map DTMF to menu options
 */
export function mapDtmfToOption(
  digit: string,
  options: Record<string, string>
): string | null {
  return options[digit] || null;
}
