/**
 * Infisical Secret Source Implementation
 * Handles integration with Infisical for development and staging environments
 */

/// <reference types="node" />

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { BaseSecretSource, SecretConfig, SecretValue } from './types.js';

export class InfisicalSecretSource extends BaseSecretSource {
  public readonly name = 'infisical';
  private client: AxiosInstance;
  private token?: string;
  private clientId?: string;
  private clientSecret?: string;
  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor(
    private baseUrl: string,
    private auth: {
      token?: string;
      clientId?: string;
      clientSecret?: string;
    },
    private defaultProject?: string
  ) {
    super();
    this.token = auth.token;
    this.clientId = auth.clientId;
    this.clientSecret = auth.clientSecret;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async retrieveSecret(config: SecretConfig): Promise<SecretValue> {
    await this.ensureAuthenticated();

    const project = config.project || this.defaultProject;
    if (!project) {
      throw new Error('Project is required for Infisical secret retrieval');
    }

    try {
      const response = await this.client.get(
        `/api/v3/secrets/raw/${config.key}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          params: {
            workspaceId: project,
            environment: config.environment,
          },
        }
      );

      return {
        value: response.data.secret.secretValue,
        source: 'infisical',
        retrievedAt: new Date(),
        version: response.data.secret.version,
        metadata: {
          project,
          secretId: response.data.secret.id,
          createdAt: response.data.secret.createdAt,
          updatedAt: response.data.secret.updatedAt,
        },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Secret '${config.key}' not found in Infisical project '${project}'`);
      }
      throw new Error(`Failed to retrieve secret from Infisical: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.get('/api/v1/status');
      return true;
    } catch {
      return false;
    }
  }

  supportsEnvironment(environment: string): boolean {
    // Infisical supports all environments but is primarily for dev/staging
    return ['development', 'staging', 'production'].includes(environment);
  }

  supportsFips(): boolean {
    // Infisical doesn't provide FIPS 140-2 Level 2 compliance
    return false;
  }

  private async ensureAuthenticated(): Promise<void> {
    // If we have a service token, use it directly
    if (this.token) {
      this.accessToken = this.token;
      return;
    }

    // If we have client credentials, authenticate
    if (this.clientId && this.clientSecret) {
      if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
        return; // Token is still valid
      }

      await this.authenticateWithClientCredentials();
      return;
    }

    throw new Error('No authentication method configured for Infisical');
  }

  private async authenticateWithClientCredentials(): Promise<void> {
    try {
      const response = await this.client.post('/api/v1/auth/universal-auth/login', {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });

      this.accessToken = response.data.accessToken;
      // Set expiration to 5 minutes before actual expiry for safety
      this.tokenExpiresAt = new Date(Date.now() + (response.data.expiresIn - 300) * 1000);
    } catch (error: any) {
      throw new Error(`Failed to authenticate with Infisical: ${error.message}`);
    }
  }

  /**
   * Create a new secret in Infisical (for development/staging environments)
   */
  async createSecret(config: SecretConfig, value: string): Promise<void> {
    await this.ensureAuthenticated();

    const project = config.project || this.defaultProject;
    if (!project) {
      throw new Error('Project is required for Infisical secret creation');
    }

    try {
      await this.client.post(
        '/api/v3/secrets/raw',
        {
          secretName: config.key,
          secretValue: value,
          workspaceId: project,
          environment: config.environment,
          type: 'shared',
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );
    } catch (error: any) {
      throw new Error(`Failed to create secret in Infisical: ${error.message}`);
    }
  }

  /**
   * Update an existing secret in Infisical
   */
  async updateSecret(config: SecretConfig, value: string): Promise<void> {
    await this.ensureAuthenticated();

    const project = config.project || this.defaultProject;
    if (!project) {
      throw new Error('Project is required for Infisical secret update');
    }

    try {
      const response = await (this.client as any).patch(
        `/api/v3/secrets/raw/${config.key}`,
        {
          secretValue: value,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
          params: {
            workspaceId: project,
            environment: config.environment,
          },
        }
      );
    } catch (error: any) {
      throw new Error(`Failed to update secret in Infisical: ${error.message}`);
    }
  }
}