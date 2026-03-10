/**
 * Enhanced Secret Validation Framework
 * Implements comprehensive validation rules for secret strength and compliance
 */

import { SecretConfig, SecretValue } from './types.js';

export interface SecretValidationRule {
  name: string;
  description: string;
  validate: (value: string, config: SecretConfig) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  message?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface SecretValidationConfig {
  /** Minimum entropy bits required */
  minEntropy?: number;
  /** Minimum length in characters */
  minLength?: number;
  /** Maximum age in days before warning */
  maxAgeDays?: number;
  /** Regex patterns that must match */
  requiredPatterns?: RegExp[];
  /** Regex patterns that must NOT match */
  forbiddenPatterns?: RegExp[];
  /** Custom validation rules */
  customRules?: SecretValidationRule[];
}

/**
 * Comprehensive secret validation with enterprise-grade security checks
 */
export class SecretValidator {
  private static readonly DEFAULT_VALIDATION_RULES: SecretValidationRule[] = [
    {
      name: 'minimum-length',
      description: 'Ensures minimum cryptographic strength',
      validate: (value: string, config: SecretConfig): ValidationResult => {
        const minLength = config.classification === 'critical' ? 64 : 
                         config.classification === 'high' ? 32 : 16;
        
        if (value.length < minLength) {
          return {
            passed: false,
            message: `Secret too short: ${value.length} chars, need ${minLength}+`,
            severity: 'error'
          };
        }
        
        return { passed: true, severity: 'info' };
      }
    },
    {
      name: 'no-common-patterns',
      description: 'Rejects commonly used weak secrets',
      validate: (value: string): ValidationResult => {
        const commonPatterns = [
          /password/i, /123456/, /qwerty/i, /admin/i, /test/i,
          /secret/i, /default/i, /changeme/i, /temp/i
        ];
        
        const foundPattern = commonPatterns.find(pattern => pattern.test(value));
        if (foundPattern) {
          return {
            passed: false,
            message: `Contains common pattern: ${foundPattern.source}`,
            severity: 'error'
          };
        }
        
        return { passed: true, severity: 'info' };
      }
    },
    {
      name: 'entropy-check',
      description: 'Validates cryptographic entropy',
      validate: (value: string): ValidationResult => {
        const entropy = this.calculateEntropy(value);
        const minEntropy = value.length >= 64 ? 4.5 : 3.5; // bits per character
        
        if (entropy < minEntropy) {
          return {
            passed: false,
            message: `Low entropy: ${entropy.toFixed(2)} bits/char, need ${minEntropy}+`,
            severity: 'warning'
          };
        }
        
        return { passed: true, severity: 'info' };
      }
    },
    {
      name: 'non-placeholder',
      description: 'Ensures secrets are not placeholder values',
      validate: (value: string): ValidationResult => {
        const placeholders = [
          'CHANGEME', 'REPLACE_ME', 'YOUR_SECRET_HERE', 'TODO',
          'FIXME', 'TBD', 'REDACTED', 'PLACEHOLDER'
        ];
        
        const isPlaceholder = placeholders.some(ph => 
          value.toUpperCase().includes(ph)
        );
        
        if (isPlaceholder) {
          return {
            passed: false,
            message: 'Contains placeholder text',
            severity: 'error'
          };
        }
        
        return { passed: true, severity: 'info' };
      }
    },
    {
      name: 'format-compliance',
      description: 'Validates format requirements for secret type',
      validate: (value: string, config: SecretConfig): ValidationResult => {
        // OpenAI API key validation
        if (config.key?.toUpperCase().includes('OPENAI') && config.key?.toUpperCase().includes('API_KEY')) {
          if (!value.startsWith('sk-')) {
            return {
              passed: false,
              message: 'OpenAI API key must start with "sk-"',
              severity: 'error'
            };
          }
          
          if (value.length < 51) { // sk- + 48 characters
            return {
              passed: false,
              message: 'OpenAI API key appears to be invalid length',
              severity: 'error'
            };
          }
          
          if (!/^sk-[a-zA-Z0-9]{48}$/.test(value)) {
            return {
              passed: false,
              message: 'OpenAI API key format is invalid',
              severity: 'error'
            };
          }
        }
        
        // JWT secrets should be hex or base64
        if (config.key.includes('JWT') && !/^[A-Fa-f0-9]+$|^[A-Za-z0-9+/]+=*$/.test(value)) {
          return {
            passed: false,
            message: 'JWT secret should be hex or base64 encoded',
            severity: 'warning'
          };
        }
        
        return { passed: true, severity: 'info' };
      }
    }
  ];

  /**
   * Validate a secret value against all applicable rules
   */
  static validateSecret(
    value: string, 
    config: SecretConfig, 
    validationConfig: SecretValidationConfig = {}
  ): ValidationResult[] {
    const rules = [
      ...this.DEFAULT_VALIDATION_RULES,
      ...(validationConfig.customRules || [])
    ];

    return rules.map(rule => {
      try {
        return rule.validate(value, config);
      } catch (error) {
        return {
          passed: false,
          message: `Validation rule '${rule.name}' failed: ${error}`,
          severity: 'error'
        };
      }
    });
  }

  /**
   * Calculate Shannon entropy for password strength estimation
   */
  private static calculateEntropy(text: string): number {
    const frequency: Record<string, number> = {};
    
    // Count character frequencies
    for (const char of text) {
      frequency[char] = (frequency[char] || 0) + 1;
    }
    
    // Calculate Shannon entropy
    let entropy = 0;
    const length = text.length;
    
    for (const count of Object.values(frequency)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  }

  /**
   * Check if secrets are reused across environments
   */
  static validateUniqueness(
    secretValues: Record<string, string>,
    environment: string
  ): ValidationResult {
    const values = Object.values(secretValues);
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    
    if (duplicates.length > 0) {
      return {
        passed: false,
        message: `${duplicates.length} secrets are reused in ${environment}`,
        severity: 'error'
      };
    }
    
    return { passed: true, severity: 'info' };
  }

  /**
   * Validate all secrets meet production requirements
   */
  static validateProductionReadiness(
    secrets: Record<string, SecretValue>,
    environment: string
  ): ValidationResult {
    if (environment !== 'production') {
      return { passed: true, severity: 'info' };
    }

    const issues: string[] = [];

    for (const [key, secret] of Object.entries(secrets)) {
      // Production secrets must come from secure sources
      if (secret.source === 'fallback') {
        issues.push(`${key}: using alternative source in production`);
      }

      // Check secret age
      const ageMs = Date.now() - secret.retrievedAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      
      if (ageDays > 90) {
        issues.push(`${key}: secret is ${Math.round(ageDays)} days old`);
      }
    }

    if (issues.length > 0) {
      return {
        passed: false,
        message: `Production readiness issues: ${issues.join('; ')}`,
        severity: 'error'
      };
    }

    return { passed: true, severity: 'info' };
  }

  /**
   * Test OpenAI API connectivity with the provided API key
   */
  static async validateOpenAIConnection(apiKey: string): Promise<ValidationResult> {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return {
        passed: false,
        message: 'Invalid OpenAI API key format',
        severity: 'error'
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Ectropy-Platform/1.0'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            passed: false,
            message: 'OpenAI API key authentication failed - key may be invalid or revoked',
            severity: 'error'
          };
        } else if (response.status === 429) {
          return {
            passed: true, // Key is valid but rate limited
            message: 'OpenAI API key valid but rate limited',
            severity: 'warning'
          };
        } else if (response.status === 403) {
          return {
            passed: false,
            message: 'OpenAI API key lacks required permissions',
            severity: 'error'
          };
        } else {
          return {
            passed: false,
            message: `OpenAI API returned status ${response.status}: ${response.statusText}`,
            severity: 'error'
          };
        }
      }

      const data = await response.json() as { data?: Array<unknown> };
      const modelCount = data?.data?.length || 0;

      return {
        passed: true,
        message: `OpenAI API connection successful (${modelCount} models available)`,
        severity: 'info'
      };

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            passed: false,
            message: 'OpenAI API connection timeout - check network connectivity',
            severity: 'error'
          };
        } else if (error.message.includes('fetch')) {
          return {
            passed: false,
            message: 'Network error connecting to OpenAI API',
            severity: 'error'
          };
        }
      }

      return {
        passed: false,
        message: `OpenAI API test failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      };
    }
  }

  /**
   * Validate critical secrets required for Ectropy Platform
   */
  static validateEctropySecrets(secrets: Record<string, string>): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    // Critical secrets for platform operation
    const criticalSecrets = [
      'OPENAI_API_KEY',
      'JWT_SECRET', 
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY'
    ];
    
    const optionalSecrets = [
      'DATABASE_URL',
      'REDIS_URL', 
      'POSTGRES_PASSWORD',
      'REDIS_PASSWORD'
    ];
    
    // Check critical secrets
    criticalSecrets.forEach(key => {
      const value = secrets[key];
      if (!value || value.trim() === '') {
        results.push({
          passed: false,
          message: `Critical secret ${key} is missing`,
          severity: 'error'
        });
      } else {
        const config: SecretConfig = { 
          key, 
          environment: 'development', 
          classification: 'critical'
        };
        const validationResults = this.validateSecret(value, config);
        results.push(...validationResults);
      }
    });
    
    // Check optional secrets (warnings only)
    optionalSecrets.forEach(key => {
      const value = secrets[key];
      if (!value || value.trim() === '') {
        results.push({
          passed: true, // Not a failure, just a warning
          message: `Optional secret ${key} is not configured`,
          severity: 'warning'
        });
      }
    });
    
    return results;
  }
}