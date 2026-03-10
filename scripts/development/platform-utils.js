import { execSync  } from 'child_process';

class PlatformUtils {
  static get isWindows() {
    return process.platform === 'win32';
  }

  static get isMac() {
    return process.platform === 'darwin';
  }

  static get isLinux() {
    return process.platform === 'linux';
  }

  static get platform() {
    return process.platform;
  }

  static setEnv(key, value) {
    process.env[key] = value;
    
    // Platform-specific environment export
    if (this.isWindows) {
      return `set ${key}=${value}`;
    } else {
      return `export ${key}=${value}`;
    }
  }

  static getPathSeparator() {
    return this.isWindows ? ';' : ':';
  }

  static normalizePath(filepath) {
    if (this.isWindows) {
      return filepath.replace(/\//g, '\\');
    }
    return filepath;
  }

  static async exec(command, options = {}) {
    const shell = this.isWindows ? 'cmd.exe' : '/bin/bash';
    return execSync(command, {
      shell,
      stdio: 'inherit',
      ...options
    });
  }

  static getNodeCommand(script) {
    const prefix = this.isWindows ? 'node' : '/usr/bin/env node';
    return `${prefix} ${script}`;
  }
}

export default PlatformUtils;