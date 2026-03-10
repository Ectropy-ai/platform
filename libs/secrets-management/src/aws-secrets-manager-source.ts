/**
 * AWS Secrets Manager Source Implementation
 * Handles integration with AWS Secrets Manager for critical production credentials
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  RotateSecretCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { BaseSecretSource, SecretConfig, SecretValue } from './types.js';

export class AwsSecretsManagerSource extends BaseSecretSource {
  public readonly name = 'aws-secrets-manager';
  private client: SecretsManagerClient;

  constructor(
    private config: {
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
      endpoint?: string;
    }
  ) {
    super();

    this.client = new SecretsManagerClient({
      region: this.config.region,
      endpoint: this.config.endpoint,
      credentials: this.config.accessKeyId
        ? {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey!,
            sessionToken: this.config.sessionToken,
          }
        : undefined, // Use default credential chain if not provided
    });
  }

  async retrieveSecret(config: SecretConfig): Promise<SecretValue> {
    const secretId = this.buildSecretId(config);

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretId,
        VersionStage: 'AWSCURRENT',
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret '${secretId}' has no string value`);
      }

      // Parse JSON secrets or return raw string
      let secretValue: string;
      try {
        const parsed = JSON.parse(response.SecretString);
        // If it's a JSON object, look for common key patterns
        secretValue = parsed[config.key] || parsed.password || parsed.secret || response.SecretString;
      } catch {
        // Not JSON, use raw value
        secretValue = response.SecretString;
      }

      const respAny = response as any;
      return {
        value: secretValue,
        source: 'aws-secrets-manager',
        retrievedAt: new Date(),
        version: respAny.VersionId,
        expiresAt: respAny.NextRotationDate,
        metadata: {
          arn: respAny.ARN || respAny.Arn,
          name: respAny.Name,
          createdDate: respAny.CreatedDate,
          lastAccessedDate: respAny.LastAccessedDate,
          lastChangedDate: respAny.LastChangedDate,
          nextRotationDate: respAny.NextRotationDate,
          rotationEnabled: !!respAny.RotationEnabled,
          versionStage: 'AWSCURRENT',
        },
      };
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        throw new Error(`Secret '${secretId}' not found in AWS Secrets Manager`);
      }
      throw new Error(`Failed to retrieve secret from AWS Secrets Manager: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple operation to test connectivity
      const command = new DescribeSecretCommand({
        SecretId: 'non-existent-secret-test',
      });
      
      await this.client.send(command);
      return true; // Shouldn't reach here, but if it does, service is available
    } catch (error: any) {
      // ResourceNotFoundException means the service is available but secret doesn't exist
      // Any other error might indicate service unavailability
      return error.name === 'ResourceNotFoundException';
    }
  }

  supportsEnvironment(environment: string): boolean {
    // AWS Secrets Manager supports all environments but is primarily for production
    return ['development', 'staging', 'production'].includes(environment);
  }

  supportsFips(): boolean {
    // AWS Secrets Manager provides FIPS 140-2 Level 2 compliance
    return true;
  }

  /**
   * Create a new secret in AWS Secrets Manager
   */
  async createSecret(config: SecretConfig, value: string, description?: string): Promise<void> {
    const secretId = this.buildSecretId(config);

    try {
      const command = new CreateSecretCommand({
        Name: secretId,
        SecretString: value,
        Description: description || `Ectropy ${config.environment} secret: ${config.key}`,
        Tags: [
          {
            Key: 'Environment',
            Value: config.environment,
          },
          {
            Key: 'Project',
            Value: config.project || 'ectropy',
          },
          {
            Key: 'Classification',
            Value: config.classification,
          },
          {
            Key: 'ManagedBy',
            Value: 'ectropy-secrets-management',
          },
        ],
      });

      await this.client.send(command);
    } catch (error: any) {
      throw new Error(`Failed to create secret in AWS Secrets Manager: ${error.message}`);
    }
  }

  /**
   * Update an existing secret in AWS Secrets Manager
   */
  async updateSecret(config: SecretConfig, value: string): Promise<void> {
    const secretId = this.buildSecretId(config);

    try {
      const command = new UpdateSecretCommand({
        SecretId: secretId,
        SecretString: value,
      });

      await this.client.send(command);
    } catch (error: any) {
      throw new Error(`Failed to update secret in AWS Secrets Manager: ${error.message}`);
    }
  }

  /**
   * Rotate a secret in AWS Secrets Manager
   */
  async rotateSecret(config: SecretConfig): Promise<boolean> {
    const secretId = this.buildSecretId(config);

    try {
      // RotateSecretCommand input does not accept ForceRotateSecrets in some SDK versions.
      // Use the basic rotate command and rely on AWS defaults.
      const command = new RotateSecretCommand({
        SecretId: secretId,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  private buildSecretId(config: SecretConfig): string {
    // Build hierarchical secret ID for AWS
    const project = config.project || 'ectropy';
    return `${project}/${config.environment}/${config.key}`;
  }

  /**
   * List all secrets with optional filtering
   */
  async listSecrets(environment?: string, project?: string): Promise<string[]> {
    try {
      const secrets: string[] = [];
      let nextToken: string | undefined;

      do {
        const { SecretList, NextToken } = await this.client.send(
          new (await import('@aws-sdk/client-secrets-manager')).ListSecretsCommand({
            NextToken: nextToken,
            MaxResults: 100,
            Filters: environment || project ? [
              ...(environment ? [{
                Key: 'tag-key' as const,
                Values: ['Environment'],
              }, {
                Key: 'tag-value' as const,
                Values: [environment],
              }] : []),
              ...(project ? [{
                Key: 'tag-key' as const,
                Values: ['Project'],
              }, {
                Key: 'tag-value' as const,
                Values: [project],
              }] : []),
            ] : undefined,
          })
        );

        if (SecretList) {
          secrets.push(...SecretList.map((secret: any) => secret.Name!).filter(Boolean));
        }
        nextToken = NextToken;
      } while (nextToken);

      return secrets;
    } catch (error: any) {
      throw new Error(`Failed to list secrets from AWS Secrets Manager: ${error.message}`);
    }
  }
}