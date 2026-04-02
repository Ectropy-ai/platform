/**
 * Speckle Service
 * Enterprise service layer for Speckle BIM integration
 * Handles API communication, authentication, and data transformation
 */

import { config } from './config';

export interface SpeckleStream {
  id: string;
  stream_id: string;
  stream_name: string;
  construction_project_id: string;
  last_commit_date: string | null;
  latest_object_id: string | null; // Object ID from latest commit for viewer rendering
  created_at: string;
  viewer_token?: string; // DEC-015: Stream-scoped VST for geometry proxy auth
}

export interface SpeckleImportResult {
  success: boolean;
  projectId: string;
  elementsProcessed: number; // Matches backend field name
  elementsImported: number; // Matches backend field name
  speckleStreamId: string | null; // Stream ID created/used for the import
  errors: string[];
  warnings?: string[]; // Backend also returns warnings
  uploadedFile?: string; // Original filename
}

export interface SpeckleInitializeResult {
  success: boolean;
  projectId: string;
  streamId: string;
  message: string;
}

export interface SpeckleStreamDetails {
  success: boolean;
  stream: {
    id: string;
    name: string;
    description?: string;
    commits: Array<{
      id: string;
      message: string;
      authorName: string;
      createdAt: string;
    }>;
  };
}

/**
 * Speckle Service Class
 * Provides methods for interacting with Speckle BIM backend
 */
export class SpeckleService {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || config.apiBaseUrl || 'http://localhost:4000';
  }

  /**
   * Set authentication token for API requests
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Initialize a construction project with Speckle integration
   * Creates a new Speckle stream for the project
   */
  async initializeProject(projectId: string): Promise<SpeckleInitializeResult> {
    const response = await fetch(`${this.baseUrl}/api/speckle/projects/${projectId}/initialize`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookie for authentication
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to initialize project');
    }

    return response.json();
  }

  /**
   * Get all Speckle streams for a project
   */
  async getProjectStreams(projectId: string): Promise<SpeckleStream[]> {
    const response = await fetch(`${this.baseUrl}/api/speckle/projects/${projectId}/streams`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookie for authentication
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch streams');
    }

    const data = await response.json();

    // ENTERPRISE FIX (2026-01-12): Handle missing or undefined streams array
    // ROOT CAUSE: Backend may return { success: true, streams: undefined } if no streams exist
    // SOLUTION: Defensive array handling with fallback to empty array
    const streams = data.streams || data || [];

    // Ensure we always return an array
    if (!Array.isArray(streams)) {
      console.warn('Unexpected streams response format:', data);
      return [];
    }

    // ENTERPRISE FIX (2026-01-13): Transform backend Speckle GraphQL format to frontend format
    // ROOT CAUSE: Backend returns { id, name, description, commits: {items: []} }
    //             Frontend expects { id, stream_id, stream_name, last_commit_date }
    // SOLUTION: Map backend format to frontend SpeckleStream interface
    // CRITICAL FIX (2026-01-13): Extract objectId from latest commit for viewer rendering
    return streams.map((stream: any) => {
      const latestCommit = stream.commits?.items?.[0];
      const objectId = latestCommit?.objectId || latestCommit?.referencedObject || null;

      return {
        id: stream.id,
        stream_id: stream.id, // Use id as stream_id for consistency
        stream_name: stream.name || 'Unnamed Stream',
        construction_project_id: projectId,
        last_commit_date: latestCommit?.createdAt || null,
        latest_object_id: objectId, // CRITICAL: Extract objectId for viewer
        created_at: stream.createdAt || new Date().toISOString(),
        viewer_token: stream.viewer_token, // DEC-015: Pass through VST from server
      };
    });
  }

  /**
   * Get detailed information about a specific stream
   */
  async getStreamDetails(streamId: string): Promise<SpeckleStreamDetails> {
    const response = await fetch(`${this.baseUrl}/api/speckle/streams/${streamId}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookie for authentication
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch stream details');
    }

    return response.json();
  }

  /**
   * Import IFC file to Speckle and sync to database
   */
  async importIFCFile(
    projectId: string,
    file: File,
    options?: {
      filterByTemplate?: boolean;
      templateIds?: string[];
      onProgress?: (progress: number) => void;
    },
  ): Promise<SpeckleImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    if (options?.filterByTemplate) {
      formData.append('filterByTemplate', 'true');
    }

    if (options?.templateIds && options.templateIds.length > 0) {
      formData.append('templateIds', JSON.stringify(options.templateIds));
    }

    // Create XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable && options?.onProgress) {
          const progress = (event.loaded / event.total) * 100;
          options.onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch (error) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', `${this.baseUrl}/api/speckle/projects/${projectId}/import-ifc`);

      // Include credentials (session cookie) for authentication
      xhr.withCredentials = true;

      // Set auth header
      if (this.authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.authToken}`);
      }

      xhr.send(formData);
    });
  }

  /**
   * Export construction elements to Speckle
   */
  async exportElementsToSpeckle(
    projectId: string,
    elementIds: string[],
  ): Promise<SpeckleImportResult> {
    const response = await fetch(`${this.baseUrl}/api/speckle/projects/${projectId}/export`, {
      method: 'POST',
      headers: this.getHeaders(),
      credentials: 'include', // Include session cookie for authentication
      body: JSON.stringify({ elementIds }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to export elements');
    }

    return response.json();
  }

  /**
   * Delete the Speckle stream for a project
   */
  async deleteProjectStream(
    projectId: string,
  ): Promise<{ success: boolean; deleted: boolean; message: string }> {
    // ENTERPRISE FIX (2026-01-13): Add ?confirm=true query parameter required by backend
    const response = await fetch(
      `${this.baseUrl}/api/speckle/projects/${projectId}/stream?confirm=true`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
        credentials: 'include', // Include session cookie for authentication
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete stream');
    }

    return response.json();
  }

  /**
   * Get Speckle server URL from configuration
   */
  getSpeckleServerUrl(): string {
    return config.speckleServerUrl || 'http://localhost:8080';
  }

  /**
   * Validate IFC file before upload
   */
  validateIFCFile(file: File): { valid: boolean; error?: string } {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      return { valid: false, error: 'Only IFC files are supported' };
    }

    // Check file size (1GB max)
    const maxSize = 1000 * 1024 * 1024; // 1000MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${maxSize / (1024 * 1024)}MB`,
      };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const speckleService = new SpeckleService();

export default speckleService;
