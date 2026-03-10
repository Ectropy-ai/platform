/**
 * Enterprise Secrets Management Type Definitions
 * Provides proper typing for secrets management interfaces
 */

export interface SecretConfig {
  type: 'string' | 'number' | 'boolean' | 'json';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  description?: string;
  environment?: 'development' | 'staging' | 'production' | 'all';
}

export interface SecretValue {
  value: string;
  encrypted?: boolean;
  source?: 'env' | 'vault' | 'file' | 'external';
  lastUpdated?: Date;
  expiresAt?: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  score?: number;
}

export interface SecretValidator {
  name: string;
  validate: (value: string, config: SecretConfig) => ValidationResult;
}

export interface SecretsSource {
  name: string;
  priority: number;
  isAvailable(): Promise<boolean>;
  getSecret(key: string): Promise<SecretValue | null>;
  setSecret(key: string, value: SecretValue): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
}

export {};