/**
 * Speckle Integration Interfaces
 * Common type definitions for the Speckle service modules
 */

export interface SpeckleConfig {
  serverUrl: string;
  token?: string;
  projectId?: string;
  streamId?: string;
}

export interface SpeckleObject {
  id: string;
  speckle_type: string;
  properties?: any;
  geometry?: any;
  children?: SpeckleObject[];
}

export interface SpeckleSyncResult {
  success: boolean;
  objectsProcessed: number;
  objectsSuccessful: number;
  objectsFailed: number;
  errors: string[];
  streamId?: string; // Speckle stream ID where data was imported/exported
}

export interface SpeckleStream {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  commits?: SpeckleCommit[];
}

export interface SpeckleCommit {
  message: string;
  authorId: string;
  createdAt: string;
  objectId: string;
}

export interface SpeckleWebhookPayload {
  streamId: string;
  userId: string;
  event: string;
  data: any;
}
