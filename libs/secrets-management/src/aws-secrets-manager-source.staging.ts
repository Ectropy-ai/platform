/**
 * AWS Secrets Manager Source - Staging Stub
 * This stub replaces the full AWS implementation for staging builds
 * where AWS SDK dependencies might not be available
 */

import { BaseSecretSource, SecretConfig, SecretValue } from './types.js';

export class AwsSecretsManagerSource extends BaseSecretSource {
  public readonly name = 'aws-secrets-manager-stub';

  constructor(config: any) {
    super();
  }

  async retrieveSecret(config: SecretConfig): Promise<SecretValue> {
    throw new Error('AWS Secrets Manager not available in staging environment');
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  supportsEnvironment(environment: string): boolean {
    return false;
  }

  supportsFips(): boolean {
    return false;
  }

  async getSecret(secretName: string): Promise<SecretValue | null> {
    throw new Error('AWS Secrets Manager not available in staging environment');
  }

  async setSecret(secretName: string, secretValue: string, config?: SecretConfig): Promise<void> {
    throw new Error('AWS Secrets Manager not available in staging environment');
  }

  async deleteSecret(secretName: string): Promise<void> {
    throw new Error('AWS Secrets Manager not available in staging environment');
  }

  async listSecrets(): Promise<string[]> {
    return [];
  }

  async rotateSecret(secretName: string): Promise<void> {
    throw new Error('AWS Secrets Manager not available in staging environment');
  }

  async validateConnection(): Promise<boolean> {
    return false;
  }
}