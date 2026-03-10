/**
 * Platform Utilities for Cross-Platform Compatibility
 * Provides utilities for handling platform-specific operations
 */

export class PlatformUtils {
  static get isWindows(): boolean {
    return process.platform === 'win32';
  }

  static get isMac(): boolean {
    return process.platform === 'darwin';
  }

  static get isLinux(): boolean {
    return process.platform === 'linux';
  }

  static get platform(): string {
    return process.platform;
  }

  static setEnv(key: string, value: string): string {
    process.env[key] = value;
    
    // Platform-specific environment export
    if (this.isWindows) {
      return `set ${key}=${value}`;
    } else {
      return `export ${key}=${value}`;
    }
  }

  static getPathSeparator(): string {
    return this.isWindows ? ';' : ':';
  }

  static normalizePath(filepath: string): string {
    if (this.isWindows) {
      return filepath.replace(/\//g, '\\');
    }
    return filepath;
  }

  static getNodeCommand(script: string): string {
    const prefix = this.isWindows ? 'node' : '/usr/bin/env node';
    return `${prefix} ${script}`;
  }
}