/**
 * @fileoverview IFCExtractionClient — TypeScript HTTP client for the
 * IFC Extraction Service (Python FastAPI microservice).
 *
 * Service endpoint: IFC_EXTRACTION_SERVICE_URL env var
 * Default (local dev): http://localhost:4010
 *
 * API contract:
 *   POST /extract    → ElementManifest | 422 (IFCParseError)
 *   GET  /cache/:sha → ElementManifest | 404
 *   PUT  /cache/:sha → 200
 *   GET  /health     → { status: 'ok', version: string }
 *
 * @see apps/api-gateway/src/intake/interfaces/ifc-extraction.interface.ts
 * @see INTAKE-ARCHITECTURE-2026-03-27.md — Part III
 */

import type {
  IIFCExtractionService,
  ElementManifest,
} from './interfaces/ifc-extraction.interface';
import {
  IFCParseError,
} from './interfaces/ifc-extraction.interface';
import type { IFCDiscipline } from './interfaces/bundle.types';

export interface IFCExtractionClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export function ifcExtractionConfigFromEnv(): IFCExtractionClientConfig {
  return {
    baseUrl: process.env.IFC_EXTRACTION_SERVICE_URL ?? 'http://localhost:4010',
    timeoutMs: parseInt(process.env.IFC_EXTRACTION_TIMEOUT_MS ?? '120000', 10),
  };
}

export class IFCExtractionClientError extends Error {
  constructor(
    public readonly operation: string,
    public readonly statusCode: number | undefined,
    public readonly body: string,
  ) {
    super(`IFCExtractionClient ${operation} failed (${statusCode ?? 'network'}): ${body}`);
    this.name = 'IFCExtractionClientError';
  }
}

export class IFCExtractionClient implements IIFCExtractionService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: IFCExtractionClientConfig) {
    const resolved = config ?? ifcExtractionConfigFromEnv();
    this.baseUrl = resolved.baseUrl.replace(/\/$/, '');
    this.timeoutMs = resolved.timeoutMs ?? 120_000;
  }

  async extract(ifcPath: string, discipline: IFCDiscipline): Promise<ElementManifest> {
    const body = JSON.stringify({ ifc_path: ifcPath, discipline });

    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (err) {
      if (err instanceof IFCParseError || err instanceof IFCExtractionClientError) throw err;
      throw new IFCExtractionClientError('extract', undefined, String(err));
    }

    const text = await response.text();

    if (response.status === 422) {
      let detail = text;
      try { detail = JSON.parse(text)?.detail ?? text; } catch { /* ignore */ }
      throw new IFCParseError(ifcPath, detail);
    }

    if (!response.ok) {
      throw new IFCExtractionClientError('extract', response.status, text);
    }

    try {
      return JSON.parse(text) as ElementManifest;
    } catch {
      throw new IFCExtractionClientError('extract', response.status, 'Response is not valid JSON');
    }
  }

  async getCachedManifest(sha256: string): Promise<ElementManifest | null> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/cache/${sha256}`, {
        method: 'GET',
      });
    } catch (err) {
      throw new IFCExtractionClientError('getCachedManifest', undefined, String(err));
    }

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new IFCExtractionClientError(
        'getCachedManifest',
        response.status,
        await response.text(),
      );
    }

    return JSON.parse(await response.text()) as ElementManifest;
  }

  async cacheManifest(sha256: string, manifest: ElementManifest): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/cache/${sha256}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest),
      });
    } catch (err) {
      throw new IFCExtractionClientError('cacheManifest', undefined, String(err));
    }

    if (!response.ok) {
      throw new IFCExtractionClientError(
        'cacheManifest',
        response.status,
        await response.text(),
      );
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new IFCExtractionClientError(
          init.method ?? 'GET',
          undefined,
          `Timeout after ${this.timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
