/** Recursively sanitize input values. */
export function sanitizeInput<T>(input: T): T {
  if (typeof input === 'string') {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value as any);
    }
    return sanitized;
  }
  return input;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /forget.*instructions/i,
  /system prompt/i,
  /override.*rules/i,
];

/** Detect basic prompt injection attempts in text. */
export function detectPromptInjection(text: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((p) => p.test(text));
}
