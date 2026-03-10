/**
 * Twilio Client Service
 *
 * Enterprise-grade Twilio integration for SMS and Voice operations.
 * Handles message sending, webhook validation, and call management.
 *
 * @module phone-agent/twilio-client
 * @version 1.0.0
 */

import crypto from 'crypto';
import type {
  TwilioConfig,
  TwilioMessageData,
  SendMessageRequest,
  SendMessageResponse,
  VoiceCall,
  VoiceCallStatus,
  MessageStatus,
  TwimlOptions,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const config: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  phoneNumbers: (process.env.TWILIO_PHONE_NUMBERS || process.env.TWILIO_PHONE_NUMBER || '')
    .split(',')
    .filter(Boolean),
  webhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || '/api/phone/v1/webhooks/twilio',
  statusCallbackUrl: process.env.TWILIO_STATUS_CALLBACK_URL,
};

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

// ============================================================================
// Configuration Checks
// ============================================================================

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  return !!(config.accountSid && config.authToken);
}

/**
 * Get Twilio configuration (without sensitive data)
 */
export function getTwilioConfig(): Omit<TwilioConfig, 'authToken'> {
  return {
    accountSid: config.accountSid,
    phoneNumbers: config.phoneNumbers,
    webhookBaseUrl: config.webhookBaseUrl,
    statusCallbackUrl: config.statusCallbackUrl,
  };
}

/**
 * Check if phone number is owned by this Twilio account
 */
export function isOwnedPhoneNumber(phoneNumber: string): boolean {
  return config.phoneNumbers.includes(phoneNumber);
}

// ============================================================================
// Webhook Signature Validation
// ============================================================================

/**
 * Validate Twilio webhook signature
 * Implements Twilio's signature validation algorithm
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  if (!config.authToken) {
    console.warn('[Twilio Client] Auth token not configured, skipping signature validation');
    return false;
  }

  // Sort parameters and concatenate
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], '');

  // Create signature
  const data = url + sortedParams;
  const expectedSignature = crypto
    .createHmac('sha1', config.authToken)
    .update(data, 'utf-8')
    .digest('base64');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract webhook parameters from request body
 */
export function parseWebhookParams(body: Record<string, unknown>): TwilioMessageData {
  return {
    messageSid: String(body.MessageSid || body.SmsSid || ''),
    accountSid: String(body.AccountSid || ''),
    from: String(body.From || ''),
    to: String(body.To || ''),
    fromCity: body.FromCity ? String(body.FromCity) : undefined,
    fromState: body.FromState ? String(body.FromState) : undefined,
    fromCountry: body.FromCountry ? String(body.FromCountry) : undefined,
    body: body.Body ? String(body.Body) : undefined,
    numMedia: body.NumMedia ? parseInt(String(body.NumMedia), 10) : undefined,
    mediaContentType0: body.MediaContentType0 ? String(body.MediaContentType0) : undefined,
    mediaUrl0: body.MediaUrl0 ? String(body.MediaUrl0) : undefined,
  };
}

// ============================================================================
// SMS Operations
// ============================================================================

/**
 * Send SMS message via Twilio
 */
export async function sendSms(
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const fromNumber = config.phoneNumbers[0];
  if (!fromNumber) {
    throw new Error('No Twilio phone number configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages.json`;

  const formData = new URLSearchParams({
    To: request.to,
    From: fromNumber,
    Body: request.body,
  });

  // Add media URL if provided
  if (request.mediaUrl) {
    formData.append('MediaUrl', request.mediaUrl);
  }

  // Add status callback if configured
  if (config.statusCallbackUrl) {
    formData.append('StatusCallback', config.statusCallbackUrl);
  }

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Twilio API error: ${response.status} - ${errorData.message || 'Unknown error'}`
      );
    }

    const data = await response.json();

    return {
      messageId: data.sid,
      status: mapTwilioStatus(data.status),
      segments: data.num_segments || 1,
      sentAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Twilio Client] Failed to send SMS:', error);
    throw error;
  }
}

/**
 * Send SMS using specific Twilio number
 */
export async function sendSmsFrom(
  from: string,
  to: string,
  body: string,
  mediaUrl?: string
): Promise<SendMessageResponse> {
  if (!isOwnedPhoneNumber(from)) {
    throw new Error(`Phone number ${from} not configured for this account`);
  }

  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages.json`;

  const formData = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  if (mediaUrl) {
    formData.append('MediaUrl', mediaUrl);
  }

  if (config.statusCallbackUrl) {
    formData.append('StatusCallback', config.statusCallbackUrl);
  }

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Twilio API error: ${response.status} - ${errorData.message || 'Unknown error'}`
    );
  }

  const data = await response.json();

  return {
    messageId: data.sid,
    status: mapTwilioStatus(data.status),
    segments: data.num_segments || 1,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Get message status from Twilio
 */
export async function getMessageStatus(messageSid: string): Promise<MessageStatus> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages/${messageSid}.json`;

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${authHeader}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get message status: ${response.status}`);
  }

  const data = await response.json();
  return mapTwilioStatus(data.status);
}

// ============================================================================
// Voice Operations
// ============================================================================

/**
 * Initiate outbound voice call
 */
export async function initiateCall(
  to: string,
  twimlUrl: string,
  options?: {
    from?: string;
    statusCallback?: string;
    timeout?: number;
    record?: boolean;
  }
): Promise<VoiceCall> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const from = options?.from || config.phoneNumbers[0];
  if (!from) {
    throw new Error('No Twilio phone number configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Calls.json`;

  const formData = new URLSearchParams({
    To: to,
    From: from,
    Url: twimlUrl,
  });

  if (options?.statusCallback) {
    formData.append('StatusCallback', options.statusCallback);
  }

  if (options?.timeout) {
    formData.append('Timeout', String(options.timeout));
  }

  if (options?.record) {
    formData.append('Record', 'true');
  }

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to initiate call: ${response.status} - ${errorData.message || 'Unknown error'}`
    );
  }

  const data = await response.json();

  return {
    callSid: data.sid,
    sessionId: data.sid,
    from: data.from,
    to: data.to,
    status: mapVoiceStatus(data.status),
    direction: 'outbound',
    startedAt: new Date().toISOString(),
  };
}

/**
 * Get call status from Twilio
 */
export async function getCallStatus(callSid: string): Promise<VoiceCallStatus> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Calls/${callSid}.json`;

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${authHeader}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get call status: ${response.status}`);
  }

  const data = await response.json();
  return mapVoiceStatus(data.status);
}

/**
 * End active call
 */
export async function endCall(callSid: string): Promise<void> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio not configured');
  }

  const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Calls/${callSid}.json`;

  const authHeader = Buffer.from(
    `${config.accountSid}:${config.authToken}`
  ).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'Status=completed',
  });

  if (!response.ok) {
    throw new Error(`Failed to end call: ${response.status}`);
  }
}

// ============================================================================
// TwiML Generation
// ============================================================================

/**
 * Generate TwiML response for voice
 */
export function generateTwiml(
  action: string,
  content: string,
  options: TwimlOptions = {}
): string {
  const voice = options.voice || 'Polly.Joanna';
  const language = options.language || 'en-US';

  switch (action) {
    case 'say':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${language}">${escapeXml(content)}</Say>
</Response>`;

    case 'gather':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="${options.input || 'speech'}" timeout="${options.timeout || 5}" speechTimeout="${options.speechTimeout || 'auto'}" action="${options.action || ''}" method="${options.method || 'POST'}"${options.hints ? ` hints="${escapeXml(options.hints)}"` : ''}>
    <Say voice="${voice}" language="${language}">${escapeXml(content)}</Say>
  </Gather>
</Response>`;

    case 'play':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="${options.loop || 1}">${escapeXml(content)}</Play>
</Response>`;

    case 'dial':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${options.timeout || 30}">${escapeXml(content)}</Dial>
</Response>`;

    case 'hangup':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

    case 'pause':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${options.timeout || 1}"/>
</Response>`;

    case 'redirect':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="${options.method || 'POST'}">${escapeXml(content)}</Redirect>
</Response>`;

    case 'record':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${language}">${escapeXml(content)}</Say>
  <Record maxLength="${options.timeout || 60}" action="${options.action || ''}" transcribe="true" playBeep="true"/>
</Response>`;

    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${escapeXml(content)}</Say>
</Response>`;
  }
}

/**
 * Generate conversation TwiML (ask and wait for response)
 */
export function generateConversationTwiml(
  prompt: string,
  actionUrl: string,
  options: TwimlOptions = {}
): string {
  const voice = options.voice || 'Polly.Joanna';
  const language = options.language || 'en-US';
  const input = options.input || 'speech';
  const timeout = options.timeout || 5;
  const speechTimeout = options.speechTimeout || 'auto';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="${input}" timeout="${timeout}" speechTimeout="${speechTimeout}" action="${escapeXml(actionUrl)}" method="POST"${options.hints ? ` hints="${escapeXml(options.hints)}"` : ''}${options.profanityFilter === false ? ' profanityFilter="false"' : ''}>
    <Say voice="${voice}" language="${language}">${escapeXml(prompt)}</Say>
  </Gather>
  <Say voice="${voice}" language="${language}">I didn't hear anything. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate welcome TwiML for incoming calls
 */
export function generateWelcomeTwiml(
  welcomeMessage: string,
  gatherUrl: string,
  options: TwimlOptions = {}
): string {
  return generateConversationTwiml(welcomeMessage, gatherUrl, {
    ...options,
    hints: options.hints || 'yes, no, help, status, report, decision',
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map Twilio message status to internal status
 */
function mapTwilioStatus(twilioStatus: string): MessageStatus {
  const statusMap: Record<string, MessageStatus> = {
    'queued': 'queued',
    'sending': 'queued',
    'sent': 'sent',
    'delivered': 'delivered',
    'undelivered': 'failed',
    'failed': 'failed',
    'received': 'received',
    'read': 'read',
  };

  return statusMap[twilioStatus] || 'queued';
}

/**
 * Map Twilio voice status to internal status
 */
function mapVoiceStatus(twilioStatus: string): VoiceCallStatus {
  const statusMap: Record<string, VoiceCallStatus> = {
    'queued': 'queued',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'no-answer',
    'canceled': 'canceled',
  };

  return statusMap[twilioStatus] || 'queued';
}

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

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check Twilio connectivity
 */
export async function checkTwilioHealth(): Promise<{
  available: boolean;
  accountSid?: string;
  error?: string;
}> {
  if (!isTwilioConfigured()) {
    return {
      available: false,
      error: 'Twilio credentials not configured',
    };
  }

  try {
    const url = `${TWILIO_API_BASE}/Accounts/${config.accountSid}.json`;

    const authHeader = Buffer.from(
      `${config.accountSid}:${config.authToken}`
    ).toString('base64');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authHeader}`,
      },
    });

    if (!response.ok) {
      return {
        available: false,
        error: `Twilio API returned ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      available: data.status === 'active',
      accountSid: data.sid,
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
