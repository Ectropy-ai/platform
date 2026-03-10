/**
 * Speckle Client Service for User Synchronization
 * Enables SSO between Ectropy OAuth and self-hosted Speckle server
 */

import axios from 'axios';
import { logger } from '@ectropy/shared/utils';

export interface SpeckleUserData {
  email: string;
  name: string;
  externalId: string;
}

export class SpeckleClient {
  private baseUrl: string;
  private serverToken: string;

  constructor() {
    this.baseUrl = process.env.SPECKLE_SERVER_URL || 'http://speckle-server:3000';
    this.serverToken = process.env.SPECKLE_SERVER_TOKEN || '';
    
    if (!this.serverToken) {
      logger.warn('SPECKLE_SERVER_TOKEN not configured - user sync will fail');
    }
  }

  /**
   * Create or update user in Speckle server
   */
  async createOrUpdateUser(userData: SpeckleUserData): Promise<any> {
    try {
      // Check if user exists
      const existingUser = await this.getUserByEmail(userData.email);
      
      if (existingUser) {
        logger.info('User already exists in Speckle', {
          email: userData.email,
          speckleId: existingUser.id
        });
        // Update existing user
        return await this.updateUser(existingUser.id, userData);
      } else {
        // Create new user
        return await this.createUser(userData);
      }
    } catch (error) {
      logger.error('Failed to sync user to Speckle', {
        email: userData.email,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get user by email from Speckle server
   */
  private async getUserByEmail(email: string): Promise<any | null> {
    const query = `
      query GetUser($email: String!) {
        user(email: $email) {
          id
          email
          name
        }
      }
    `;
    
    try {
      const response = await axios.post(`${this.baseUrl}/graphql`, {
        query,
        variables: { email }
      }, {
        headers: { 
          'Authorization': `Bearer ${this.serverToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data?.user || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create new user in Speckle server
   */
  private async createUser(userData: SpeckleUserData): Promise<any> {
    const mutation = `
      mutation CreateUser($input: UserCreateInput!) {
        userCreate(input: $input) {
          id
          email
        }
      }
    `;
    
    const response = await axios.post(`${this.baseUrl}/graphql`, {
      query: mutation,
      variables: {
        input: {
          email: userData.email,
          name: userData.name,
          bio: `Ectropy user: ${userData.externalId}`
        }
      }
    }, {
      headers: { 
        'Authorization': `Bearer ${this.serverToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info('User created in Speckle', {
      email: userData.email,
      speckleId: response.data.data.userCreate.id
    });

    return response.data.data.userCreate;
  }

  /**
   * Update existing user in Speckle server
   */
  private async updateUser(userId: string, userData: SpeckleUserData): Promise<any> {
    const mutation = `
      mutation UpdateUser($id: ID!, $input: UserUpdateInput!) {
        userUpdate(id: $id, input: $input)
      }
    `;
    
    const response = await axios.post(`${this.baseUrl}/graphql`, {
      query: mutation,
      variables: {
        id: userId,
        input: { 
          name: userData.name,
          bio: `Ectropy user: ${userData.externalId}`
        }
      }
    }, {
      headers: { 
        'Authorization': `Bearer ${this.serverToken}`,
        'Content-Type': 'application/json'
      }
    });

    logger.info('User updated in Speckle', {
      email: userData.email,
      speckleId: userId
    });

    return response.data.data.userUpdate;
  }

  /**
   * Upload IFC file to Speckle server
   */
  async uploadIFC(userEmail: string, fileBuffer: Buffer, filename: string): Promise<any> {
    const streamName = filename.replace('.ifc', '');
    const createStreamMutation = `
      mutation CreateStream($input: StreamCreateInput!) {
        streamCreate(stream: $input)
      }
    `;
    
    const streamResponse = await this.graphqlRequest(createStreamMutation, {
      input: { name: streamName, description: 'IFC upload' }
    });
    
    const streamId = streamResponse.data.streamCreate;

    // Upload file
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileBuffer, filename);

    const uploadResponse = await axios.post(
      `${this.baseUrl}/api/file/${streamId}`,
      form,
      { headers: { ...form.getHeaders(), 'Authorization': `Bearer ${this.serverToken}` } }
    );

    logger.info('IFC file uploaded to Speckle', {
      streamId,
      filename,
      userEmail
    });

    return {
      streamId,
      commitId: uploadResponse.data.commitId
    };
  }

  /**
   * Get user streams from Speckle server
   */
  async getUserStreams(userEmail: string): Promise<any[]> {
    const query = `
      query GetUserStreams($email: String!) {
        user(email: $email) {
          streams(limit: 50) {
            items {
              id
              name
              description
              createdAt
            }
          }
        }
      }
    `;
    
    const response = await this.graphqlRequest(query, { email: userEmail });
    return response.data.user.streams.items;
  }

  /**
   * Get stream data from Speckle server
   */
  async getStreamData(streamId: string): Promise<any> {
    const query = `
      query GetStream($id: String!) {
        stream(id: $id) {
          id
          name
          description
          createdAt
          commits(limit: 1) {
            items {
              id
              referencedObject
            }
          }
        }
      }
    `;
    
    const response = await this.graphqlRequest(query, { id: streamId });
    return response.data.stream;
  }

  /**
   * Helper method for GraphQL requests
   */
  private async graphqlRequest(query: string, variables: any): Promise<any> {
    const response = await axios.post(`${this.baseUrl}/graphql`, {
      query,
      variables
    }, {
      headers: { 
        'Authorization': `Bearer ${this.serverToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return response.data;
  }
}
