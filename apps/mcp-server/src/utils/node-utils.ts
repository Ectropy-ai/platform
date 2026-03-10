/**
 * Local Node.js ESM utilities for MCP Server
 * Temporary fix for shared library import issues
 */
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Get the current module's directory name (equivalent to __dirname)
 * Usage: const __dirname = getCurrentDirname(import.meta.url);
 */
export function getCurrentDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Get the current module's filename (equivalent to __filename)
 * Usage: const __filename = getCurrentFilename(import.meta.url);
 */
export function getCurrentFilename(importMetaUrl: string): string {
  return fileURLToPath(importMetaUrl);
}
