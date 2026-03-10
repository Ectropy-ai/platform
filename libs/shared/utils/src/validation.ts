/**
 * Validation Utilities
 * Provides common validation functions for the platform
 */

export class ValidationUtils {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate URL format
   * Enterprise security: Only allows safe protocols to prevent XSS attacks
   */
  static isValidURL(url: string): boolean {
    try {
      const parsedURL = new URL(url);

      // ENTERPRISE FIX: Whitelist safe protocols only
      // Prevents javascript:, data:, vbscript:, file: protocol injections
      const safeProtocols = [
        'http:',
        'https:',
        'mailto:',
        'tel:',
        'ftp:',
        'ftps:',
      ];

      if (!safeProtocols.includes(parsedURL.protocol)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate required fields
   */
  static validateRequired(
    data: Record<string, any>,
    fields: string[]
  ): string[] {
    const missing: string[] = [];
    for (const field of fields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ''
      ) {
        missing.push(field);
      }
    }
    return missing;
  }

  /**
   * Sanitize string input to prevent XSS
   * Enterprise security: Removes dangerous protocols and HTML injection vectors
   */
  static sanitizeString(input: string): string {
    let sanitized = input;

    // ENTERPRISE FIX: Remove dangerous URL protocols (javascript:, data:, vbscript:, file:)
    // Prevents protocol-based XSS attacks
    const dangerousProtocols = /\b(javascript|data|vbscript|file):/gi;
    sanitized = sanitized.replace(dangerousProtocols, '');

    // HTML encode special characters to prevent tag injection
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    return sanitized;
  }
}
