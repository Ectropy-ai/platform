/**
 * Node.js ESM utilities for handling __dirname and __filename equivalents
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Get the filename equivalent of __filename for ESM
 */
export function getFilename(importMetaUrl: string): string {
  return fileURLToPath(importMetaUrl);
}

/**
 * Get the directory equivalent of __dirname for ESM
 */
export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Create a path relative to the current module
 */
export function createPath(importMetaUrl: string, ...paths: string[]): string {
  return join(dirname(fileURLToPath(importMetaUrl)), ...paths);
}

/**
 * Get the current module's directory name (equivalent to __dirname)
 * Usage: const __dirname = getCurrentDirname(import.meta.url);
 */
export function getCurrentDirname(importMetaUrl: string): string {
  return getDirname(importMetaUrl);
}

/**
 * Get the current module's filename (equivalent to __filename)
 * Usage: const __filename = getCurrentFilename(import.meta.url);
 */
export function getCurrentFilename(importMetaUrl: string): string {
  return getFilename(importMetaUrl);
}