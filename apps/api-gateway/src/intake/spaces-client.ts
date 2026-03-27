/**
 * @fileoverview SpacesClient — thin wrapper around the S3-compatible
 * DigitalOcean Spaces API for bundle storage operations.
 *
 * DO Spaces is S3-compatible. Endpoint: {region}.digitaloceanspaces.com
 * Bucket: ectropy-config (from DO_SPACES_BUCKET env var)
 * Region: nyc3 (from DO_SPACES_REGION env var)
 *
 * Used by:
 *   - SpacesBundleLoader: reads bundle descriptors and ref files
 *   - IFCExtractionService: reads IFC files and writes manifest cache
 *   - Stage 7: future — writes seppa_context snapshots to Spaces audit log
 *
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part VII (DO Spaces structure)
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Readable } from 'stream';

export interface SpacesClientConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
}

export class SpacesClientError extends Error {
  constructor(
    public readonly operation: string,
    public readonly key: string,
    public readonly cause?: unknown,
  ) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Spaces ${operation} failed for '${key}': ${causeMsg}`);
    this.name = 'SpacesClientError';
  }
}

export class SpacesKeyNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Spaces key not found: '${key}'`);
    this.name = 'SpacesKeyNotFoundError';
  }
}

/**
 * Creates a SpacesClientConfig from environment variables.
 * Throws if required credentials are missing.
 */
export function spacesConfigFromEnv(): SpacesClientConfig {
  const accessKeyId = process.env.DO_SPACES_ACCESS_KEY ?? '';
  const secretAccessKey = process.env.DO_SPACES_SECRET_KEY ?? '';
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'SpacesClient: missing env vars DO_SPACES_ACCESS_KEY and/or DO_SPACES_SECRET_KEY',
    );
  }
  return {
    accessKeyId,
    secretAccessKey,
    bucket: process.env.DO_SPACES_BUCKET ?? 'ectropy-config',
    region: process.env.DO_SPACES_REGION ?? 'nyc3',
  };
}

export class SpacesClient {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: SpacesClientConfig) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      endpoint: `https://${config.region}.digitaloceanspaces.com`,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  /** Download an object as a UTF-8 string. */
  async getText(key: string): Promise<string> {
    try {
      const response: GetObjectCommandOutput = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new SpacesClientError('getText', key, 'Response body is empty');
      }
      return await this.streamToString(response.Body as Readable);
    } catch (err) {
      if (this.isNoSuchKey(err)) throw new SpacesKeyNotFoundError(key);
      if (err instanceof SpacesKeyNotFoundError) throw err;
      throw new SpacesClientError('getText', key, err);
    }
  }

  /** Download an object as a Buffer (for binary files e.g. IFC). */
  async getBuffer(key: string): Promise<Buffer> {
    try {
      const response: GetObjectCommandOutput = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        throw new SpacesClientError('getBuffer', key, 'Response body is empty');
      }
      return await this.streamToBuffer(response.Body as Readable);
    } catch (err) {
      if (this.isNoSuchKey(err)) throw new SpacesKeyNotFoundError(key);
      if (err instanceof SpacesKeyNotFoundError) throw err;
      throw new SpacesClientError('getBuffer', key, err);
    }
  }

  /** Download an object and compute its SHA256 hash. */
  async getSHA256(key: string): Promise<string> {
    const buffer = await this.getBuffer(key);
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Upload a UTF-8 string as a Spaces object. */
  async putText(key: string, content: string): Promise<void> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ContentType: 'application/json',
        }),
      );
    } catch (err) {
      throw new SpacesClientError('putText', key, err);
    }
  }

  /** Check whether a key exists without downloading the object. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (this.isNoSuchKey(err) || this.isNotFound(err)) return false;
      throw new SpacesClientError('exists', key, err);
    }
  }

  /** List all keys under a prefix. */
  async listKeys(prefix: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of response.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
      return keys;
    } catch (err) {
      throw new SpacesClientError('listKeys', prefix, err);
    }
  }

  private isNoSuchKey(err: unknown): boolean {
    return (
      err instanceof Error &&
      (err.name === 'NoSuchKey' ||
        (err as { Code?: string }).Code === 'NoSuchKey')
    );
  }

  private isNotFound(err: unknown): boolean {
    return (
      err instanceof Error &&
      (err.name === 'NotFound' ||
        (err as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404)
    );
  }

  private async streamToString(stream: Readable): Promise<string> {
    const buf = await this.streamToBuffer(stream);
    return buf.toString('utf-8');
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
