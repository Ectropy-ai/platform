/**
 * ENTERPRISE UNIT TESTS - Platform Utilities
 *
 * Purpose: Comprehensive testing of cross-platform utility functions
 * Scope: Platform detection, path normalization, environment variables
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - AAA pattern (Arrange, Act, Assert)
 * - Cross-platform compatibility (Windows, Mac, Linux)
 * - Edge case coverage (empty strings, special characters)
 * - Environment variable handling
 * - Path separator validation
 *
 * NOTE: Some tests mock process.platform for cross-platform validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlatformUtils } from '../platform-utils';

describe('PlatformUtils - Enterprise Unit Tests', () => {
  let originalPlatform: NodeJS.Platform;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original values
    originalPlatform = process.platform;
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    process.env = originalEnv;
  });

  describe('1. Platform Detection', () => {
    it('should detect Windows platform', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act & Assert
      expect(PlatformUtils.isWindows).toBe(true);
      expect(PlatformUtils.isMac).toBe(false);
      expect(PlatformUtils.isLinux).toBe(false);
      expect(PlatformUtils.platform).toBe('win32');
    });

    it('should detect macOS platform', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      // Act & Assert
      expect(PlatformUtils.isWindows).toBe(false);
      expect(PlatformUtils.isMac).toBe(true);
      expect(PlatformUtils.isLinux).toBe(false);
      expect(PlatformUtils.platform).toBe('darwin');
    });

    it('should detect Linux platform', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act & Assert
      expect(PlatformUtils.isWindows).toBe(false);
      expect(PlatformUtils.isMac).toBe(false);
      expect(PlatformUtils.isLinux).toBe(true);
      expect(PlatformUtils.platform).toBe('linux');
    });

    it('should return raw platform string', () => {
      // Act
      const platform = PlatformUtils.platform;

      // Assert
      expect(platform).toBe(process.platform);
      expect(typeof platform).toBe('string');
    });

    it('should handle consecutive platform checks', () => {
      // Act - Multiple reads should return same value
      const check1 = PlatformUtils.isWindows;
      const check2 = PlatformUtils.isWindows;
      const check3 = PlatformUtils.platform;
      const check4 = PlatformUtils.platform;

      // Assert
      expect(check1).toBe(check2);
      expect(check3).toBe(check4);
    });
  });

  describe('2. setEnv - Environment Variable Management', () => {
    it('should set environment variable on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('TEST_VAR', 'test_value');

      // Assert
      expect(process.env.TEST_VAR).toBe('test_value');
      expect(command).toBe('set TEST_VAR=test_value');
    });

    it('should set environment variable on Unix (Mac)', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('TEST_VAR', 'test_value');

      // Assert
      expect(process.env.TEST_VAR).toBe('test_value');
      expect(command).toBe('export TEST_VAR=test_value');
    });

    it('should set environment variable on Linux', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('TEST_VAR', 'test_value');

      // Assert
      expect(process.env.TEST_VAR).toBe('test_value');
      expect(command).toBe('export TEST_VAR=test_value');
    });

    it('should handle empty variable name', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('', 'value');

      // Assert
      expect(process.env['']).toBe('value');
      expect(command).toBe('set =value');
    });

    it('should handle empty value', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('TEST_VAR', '');

      // Assert
      expect(process.env.TEST_VAR).toBe('');
      expect(command).toBe('export TEST_VAR=');
    });

    it('should handle special characters in values', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('PATH_VAR', '/usr/local/bin:$PATH');

      // Assert
      expect(process.env.PATH_VAR).toBe('/usr/local/bin:$PATH');
      expect(command).toBe('export PATH_VAR=/usr/local/bin:$PATH');
    });

    it('should handle spaces in values', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('MSG', 'Hello World');

      // Assert
      expect(process.env.MSG).toBe('Hello World');
      expect(command).toBe('set MSG=Hello World');
    });

    it('should overwrite existing environment variables', () => {
      // Arrange
      process.env.EXISTING_VAR = 'old_value';
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('EXISTING_VAR', 'new_value');

      // Assert
      expect(process.env.EXISTING_VAR).toBe('new_value');
      expect(command).toBe('export EXISTING_VAR=new_value');
    });
  });

  describe('3. getPathSeparator - Path Separator Detection', () => {
    it('should return semicolon for Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const separator = PlatformUtils.getPathSeparator();

      // Assert
      expect(separator).toBe(';');
    });

    it('should return colon for macOS', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      // Act
      const separator = PlatformUtils.getPathSeparator();

      // Assert
      expect(separator).toBe(':');
    });

    it('should return colon for Linux', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const separator = PlatformUtils.getPathSeparator();

      // Assert
      expect(separator).toBe(':');
    });

    it('should return consistent separator for same platform', () => {
      // Act
      const sep1 = PlatformUtils.getPathSeparator();
      const sep2 = PlatformUtils.getPathSeparator();

      // Assert
      expect(sep1).toBe(sep2);
    });
  });

  describe('4. normalizePath - Path Normalization', () => {
    it('should convert forward slashes to backslashes on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('src/components/Header.tsx');

      // Assert
      expect(normalized).toBe('src\\components\\Header.tsx');
    });

    it('should leave path unchanged on macOS', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('src/components/Header.tsx');

      // Assert
      expect(normalized).toBe('src/components/Header.tsx');
    });

    it('should leave path unchanged on Linux', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('src/components/Header.tsx');

      // Assert
      expect(normalized).toBe('src/components/Header.tsx');
    });

    it('should handle paths with multiple slashes on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('C:/Users/Admin/Documents/file.txt');

      // Assert
      expect(normalized).toBe('C:\\Users\\Admin\\Documents\\file.txt');
    });

    it('should handle empty path', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('');

      // Assert
      expect(normalized).toBe('');
    });

    it('should handle path with only slashes on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('///');

      // Assert
      expect(normalized).toBe('\\\\\\');
    });

    it('should handle absolute Unix path on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('/usr/local/bin');

      // Assert
      expect(normalized).toBe('\\usr\\local\\bin');
    });

    it('should handle relative paths on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('./src/index.ts');

      // Assert
      expect(normalized).toBe('.\\src\\index.ts');
    });

    it('should handle paths with mixed slashes on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('C:\\Users/Admin\\Documents/file.txt');

      // Assert
      expect(normalized).toBe('C:\\Users\\Admin\\Documents\\file.txt');
    });

    it('should not modify backslashes on Unix systems', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('path\\with\\backslashes');

      // Assert
      expect(normalized).toBe('path\\with\\backslashes');
    });
  });

  describe('5. getNodeCommand - Node.js Command Generation', () => {
    it('should return simple node command on Windows', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('script.js');

      // Assert
      expect(command).toBe('node script.js');
    });

    it('should return env-based command on macOS', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('script.js');

      // Assert
      expect(command).toBe('/usr/bin/env node script.js');
    });

    it('should return env-based command on Linux', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('script.js');

      // Assert
      expect(command).toBe('/usr/bin/env node script.js');
    });

    it('should handle script with path', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('./scripts/build.js');

      // Assert
      expect(command).toBe('/usr/bin/env node ./scripts/build.js');
    });

    it('should handle script with arguments', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('script.js --production');

      // Assert
      expect(command).toBe('node script.js --production');
    });

    it('should handle empty script name', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('');

      // Assert
      expect(command).toBe('/usr/bin/env node ');
    });

    it('should handle script with spaces in path (no quotes added)', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.getNodeCommand('C:/My Scripts/build.js');

      // Assert
      expect(command).toBe('node C:/My Scripts/build.js');
      // Note: Caller should handle quoting if needed
    });
  });

  describe('6. Cross-Platform Consistency', () => {
    it('should provide consistent API across platforms', () => {
      // All platforms should have these methods
      expect(typeof PlatformUtils.isWindows).toBe('boolean');
      expect(typeof PlatformUtils.isMac).toBe('boolean');
      expect(typeof PlatformUtils.isLinux).toBe('boolean');
      expect(typeof PlatformUtils.platform).toBe('string');
      expect(typeof PlatformUtils.setEnv).toBe('function');
      expect(typeof PlatformUtils.getPathSeparator).toBe('function');
      expect(typeof PlatformUtils.normalizePath).toBe('function');
      expect(typeof PlatformUtils.getNodeCommand).toBe('function');
    });

    it('should have exactly one platform flag as true', () => {
      // Arrange & Act
      const flags = [
        PlatformUtils.isWindows,
        PlatformUtils.isMac,
        PlatformUtils.isLinux,
      ];

      // Assert - Exactly one should be true
      const trueCount = flags.filter((flag) => flag === true).length;
      expect(trueCount).toBe(1);
    });

    it('should handle real current platform correctly', () => {
      // This test runs on actual platform
      const platform = process.platform;

      if (platform === 'win32') {
        expect(PlatformUtils.isWindows).toBe(true);
      } else if (platform === 'darwin') {
        expect(PlatformUtils.isMac).toBe(true);
      } else if (platform === 'linux') {
        expect(PlatformUtils.isLinux).toBe(true);
      }
    });
  });

  describe('7. Edge Cases and Security', () => {
    it('should handle unicode characters in paths', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('文件夹/文件.txt');

      // Assert
      expect(normalized).toBe('文件夹\\文件.txt');
    });

    it('should handle special characters in environment variable names', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('VAR_123', 'value');

      // Assert
      expect(process.env.VAR_123).toBe('value');
      expect(command).toBe('export VAR_123=value');
    });

    it('should handle very long paths', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
      const longPath = 'a/'.repeat(100) + 'file.txt';

      // Act
      const normalized = PlatformUtils.normalizePath(longPath);

      // Assert
      expect(normalized).toContain('\\');
      expect(normalized).not.toContain('/');
    });

    it('should handle path traversal attempts', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });

      // Act
      const normalized = PlatformUtils.normalizePath('../../../etc/passwd');

      // Assert
      expect(normalized).toBe('..\\..\\..\\etc\\passwd');
      // Note: Path traversal prevention should be handled at higher levels
    });

    it('should handle null bytes in environment values gracefully', () => {
      // Arrange
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });

      // Act
      const command = PlatformUtils.setEnv('TEST', 'value\x00malicious');

      // Assert
      expect(process.env.TEST).toBe('value\x00malicious');
      // Note: Null byte handling is Node.js behavior
    });
  });
});
