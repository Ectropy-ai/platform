/**
 * Speckle Stream Service
 * Handles Speckle stream creation, management, and operations
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { SpeckleConfig, SpeckleStream } from '../interfaces/speckle.types.js';
export class SpeckleStreamService extends EventEmitter {
  private db: Pool;
  private config: SpeckleConfig;
  constructor(db: Pool, config: SpeckleConfig) {
    super();
    this.db = db;
    this.config = config;
  }
  /**
   * Create a new Speckle stream for a construction project
   */
  async createStream(
    constructionProjectId: string,
    streamName: string
  ): Promise<string> {
    try {
      // GraphQL mutation to create stream
      const mutation = `
        mutation CreateStream($input: StreamCreateInput!) {
          streamCreate(stream: $input)
        }
      `;
      const variables = {
        input: {
          name: streamName,
          description: `Stream for construction project ${constructionProjectId}`,
          isPublic: false,
        },
      };
      const response = await this.executeGraphQL(mutation, variables);
      const streamId = response.data.streamCreate;
      // Store stream relationship in database
      await this.db.query(
        `
        INSERT INTO speckle_streams (id, construction_project_id, stream_id, stream_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (construction_project_id) DO UPDATE SET
          stream_id = $3,
          stream_name = $4,
          updated_at = NOW()
      `,
        [randomUUID(), constructionProjectId, streamId, streamName]
      );
      this.emit('streamCreated', {
        constructionProjectId,
        streamId,
        streamName,
      });
      return streamId;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get stream information
   * ENTERPRISE FIX: Speckle v2 renamed objectId to referencedObject on Commit type
   */
  async getStream(streamId: string): Promise<SpeckleStream> {
    const query = `
      query GetStream($id: String!) {
        stream(id: $id) {
          id
          name
          description
          isPublic
          commits(limit: 10) {
            items {
              id
              message
              authorId
              createdAt
              referencedObject
            }
          }
        }
      }
    `;
    const response = await this.executeGraphQL(query, { id: streamId });
    // Map referencedObject back to objectId for internal compatibility
    if (response.data.stream?.commits?.items) {
      response.data.stream.commits.items = response.data.stream.commits.items.map((commit: any) => ({
        ...commit,
        objectId: commit.referencedObject,
      }));
    }
    return response.data.stream;
  }

  /**
   * List all streams for a project
   */
  async getProjectStreams(
    constructionProjectId: string
  ): Promise<SpeckleStream[]> {
    const result = await this.db.query(
      `SELECT stream_id FROM speckle_streams WHERE construction_project_id = $1`,
      [constructionProjectId]
    );
    const streams: SpeckleStream[] = [];
    for (const row of result.rows) {
      try {
        const stream = await this.getStream(row.stream_id);
        streams.push(stream);
      } catch (error) {
        // ENTERPRISE FIX (2026-01-12): Don't fail entire request if one stream fails
        // ROOT CAUSE: Network errors, deleted streams, or permission issues on ONE stream
        // were causing ALL streams to fail loading, leaving viewer completely empty
        // SOLUTION: Skip failed streams, log the error, continue with others
        console.error(`Failed to load stream ${row.stream_id}:`, error);
        // Skip this stream and continue with others
      }
    }
    return streams;
  }

  /**
   * Delete a stream
   */
  async deleteStream(streamId: string): Promise<boolean> {
    const mutation = `
      mutation DeleteStream($id: String!) {
        streamDelete(id: $id)
      }
    `;
    await this.executeGraphQL(mutation, { id: streamId });
    // Remove from local database
    await this.db.query(`DELETE FROM speckle_streams WHERE stream_id = $1`, [
      streamId,
    ]);
    this.emit('streamDeleted', { streamId });
    return true;
  }

  /**
   * Execute GraphQL query/mutation against Speckle server
   */
  private async executeGraphQL(
    query: string,
    variables: any = {}
  ): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }
    const result = (await response.json()) as {
      data?: any;
      errors?: unknown[];
    };
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }
    return result;
  }
}
