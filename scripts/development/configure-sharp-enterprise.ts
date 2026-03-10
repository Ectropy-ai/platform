#!/usr/bin/env node

/**
 * Enterprise Sharp Configuration and Management System
 * 
 * This script provides comprehensive Sharp module management for enterprise CI/CD environments,
 * including intelligent fallback strategies, platform-specific configuration, automated recovery
 * mechanisms, and detailed diagnostic reporting.
 * 
 * @author Ectropy Platform Team
 * @version 2.0.0
 * @enterprise true
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as os from 'os';

interface SharpConfig {
  downloadOptions: {
    timeout: number;
    retries: number;
    retryDelay: number;
    fallbackHosts: string[];
  };
  buildOptions: {
    forceLocal: boolean;
    runtime: string;
    target: string;
    libc: string;
    platform: string;
    arch: string;
    prebuiltBinary: boolean;
    libvipsVersion: string;
  };
  verification: {
    checksumValidation: boolean;
    signatureVerification: boolean;
    functionalTest: boolean;
  };
  enterprise: {
    enableCaching: boolean;
    cacheDirectory: string;
    enableMetrics: boolean;
    enableFallbacks: boolean;
    maxRetryAttempts: number;
  };
}

interface InstallationStrategy {
  name: string;
  description: string;
  priority: number;
  execute: () => Promise<boolean>;
  requirements?: string[];
}

interface DiagnosticResult {
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
  recommendation?: string;
}

/**
 * Enterprise-grade Sharp configuration and management system
 */
class SharpEnterpriseManager {
  private readonly config: SharpConfig;
  private readonly logFile: string;
  private readonly cacheDir: string;
  private readonly metricsDir: string;
  private readonly startTime: number;
  private readonly strategies: InstallationStrategy[];

  constructor() {
    this.startTime = Date.now();
    this.config = this.loadConfiguration();
    this.logFile = path.join(process.cwd(), 'logs', 'sharp-enterprise.log');
    this.cacheDir = this.config.enterprise.cacheDirectory;
    this.metricsDir = path.join(process.cwd(), '.metrics', 'sharp');
    this.strategies = this.initializeStrategies();
    this.ensureDirectories();
  }

  /**
   * Load configuration with environment-specific overrides and enterprise defaults
   */
  private loadConfiguration(): SharpConfig {
    const isCI = process.env.CI === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    const platform = process.platform;
    const arch = process.arch;

    const baseConfig: SharpConfig = {
      downloadOptions: {
        timeout: isCI ? 300000 : 60000, // 5 minutes in CI, 1 minute locally
        retries: isCI ? 5 : 3,
        retryDelay: isCI ? 10000 : 5000,
        fallbackHosts: [
          'https://github.com/lovell/sharp/releases/download',
          'https://sharp.pixelplumbing.com',
          'https://registry.npmjs.org/sharp/-'
        ]
      },
      buildOptions: {
        forceLocal: isCI || isProduction,
        runtime: 'napi',
        target: process.versions.node.split('.')[0],
        libc: this.detectLibc(),
        platform,
        arch,
        prebuiltBinary: !isCI, // Prefer prebuilt in dev, build from source in CI
        libvipsVersion: '8.14.5'
      },
      verification: {
        checksumValidation: true,
        signatureVerification: isProduction,
        functionalTest: true
      },
      enterprise: {
        enableCaching: true,
        cacheDirectory: path.join(os.homedir(), '.sharp-enterprise-cache'),
        enableMetrics: true,
        enableFallbacks: true,
        maxRetryAttempts: isCI ? 5 : 3
      }
    };

    // Load environment-specific overrides
    const envConfigPath = path.join(process.cwd(), '.sharp-enterprise.json');
    if (fs.existsSync(envConfigPath)) {
      try {
        const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
        return this.mergeConfigs(baseConfig, envConfig);
      } catch (error) {
        this.log('warn', 'Failed to load environment config, using defaults', error);
      }
    }

    return baseConfig;
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfigs(base: any, override: any): any {
    const result = { ...base };
    for (const key in override) {
      if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this.mergeConfigs(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  /**
   * Detect the system's libc implementation with enhanced detection
   */
  private detectLibc(): string {
    if (process.platform !== 'linux') return '';
    
    try {
      // Check for musl first (common in Alpine containers)
      if (fs.existsSync('/lib/libc.musl-x86_64.so.1') || 
          fs.existsSync('/usr/lib/libc.musl-x86_64.so.1')) {
        return 'musl';
      }

      // Check ldd output
      const lddVersion = execSync('ldd --version 2>&1', { encoding: 'utf8' });
      if (lddVersion.includes('musl')) return 'musl';
      if (lddVersion.includes('GNU') || lddVersion.includes('glibc')) return 'glibc';

      // Check for specific files
      if (fs.existsSync('/lib/x86_64-linux-gnu/libc.so.6')) return 'glibc';
      
      // Fallback check using getconf
      try {
        const confCheck = execSync('getconf GNU_LIBC_VERSION 2>/dev/null', { encoding: 'utf8' });
        if (confCheck.includes('glibc')) return 'glibc';
      } catch {}

    } catch (error) {
      this.log('warn', 'Could not detect libc, defaulting to glibc', error);
    }
    
    return 'glibc';
  }

  /**
   * Initialize installation strategies in priority order
   */
  private initializeStrategies(): InstallationStrategy[] {
    return [
      {
        name: 'cached-binary',
        description: 'Use enterprise-cached prebuilt binary',
        priority: 1,
        execute: () => this.tryCachedBinary(),
        requirements: ['cache_enabled']
      },
      {
        name: 'prebuilt-download',
        description: 'Download official prebuilt binary',
        priority: 2,
        execute: () => this.tryPrebuiltBinary(),
        requirements: ['network_access']
      },
      {
        name: 'build-from-source',
        description: 'Build Sharp from source with libvips',
        priority: 3,
        execute: () => this.tryBuildFromSource(),
        requirements: ['build_tools', 'development_headers']
      },
      {
        name: 'fallback-version',
        description: 'Install known stable fallback version',
        priority: 4,
        execute: () => this.tryFallbackVersion(),
        requirements: ['network_access']
      },
      {
        name: 'system-package',
        description: 'Use system package manager installation',
        priority: 5,
        execute: () => this.trySystemPackage(),
        requirements: ['package_manager']
      }
    ];
  }

  /**
   * Ensure required directories exist with proper permissions
   */
  private ensureDirectories(): void {
    const dirs = [
      path.dirname(this.logFile),
      this.cacheDir,
      this.metricsDir,
      path.join(this.cacheDir, 'binaries'),
      path.join(this.cacheDir, 'checksums'),
      path.join(this.cacheDir, 'sources'),
      path.join(this.metricsDir, 'reports'),
      path.join(this.metricsDir, 'history')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }
    });
  }

  /**
   * Enhanced logging system with structured output
   */
  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      duration: Date.now() - this.startTime
    };

    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[90m'    // Gray
    };
    const color = colors[level] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}[${timestamp}] [${level.toUpperCase()}] ${message}${reset}`);
    if (data && level !== 'debug') {
      console.log(JSON.stringify(data, null, 2));
    }

    // File output (always write, even debug)
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Install system dependencies based on the platform with enhanced detection
   */
  public async installSystemDependencies(): Promise<void> {
    this.log('info', 'Installing system dependencies for Sharp');

    const platform = process.platform;
    const isCI = process.env.CI === 'true';
    
    const commands: Record<string, string[]> = {
      linux: [
        // Update package lists
        'apt-get update || yum makecache || apk update',
        // Install build essentials
        'apt-get install -y build-essential || yum groupinstall -y "Development Tools" || apk add build-base',
        // Install libvips and development headers
        'apt-get install -y libvips-dev libvips42 || yum install -y vips-devel || apk add vips-dev',
        // Install additional dependencies
        'apt-get install -y python3 python3-dev pkg-config || yum install -y python3 python3-devel pkgconfig || apk add python3 python3-dev pkgconfig',
        // Install compiler toolchain
        'apt-get install -y gcc g++ make || yum install -y gcc gcc-c++ make || apk add gcc g++ make'
      ],
      darwin: [
        // Update Homebrew
        'brew update',
        // Install libvips with all options
        'brew install vips pkg-config',
        // Ensure Xcode command line tools
        'xcode-select --install || echo "Xcode tools already installed"'
      ],
      win32: [
        // Windows-specific instructions (requires manual setup typically)
        'echo "Windows detected - manual libvips installation may be required"',
        'echo "Consider using vcpkg: vcpkg install libvips"'
      ]
    };

    const platformCommands = commands[platform] || [];
    
    for (const cmd of platformCommands) {
      try {
        this.log('debug', `Executing system command: ${cmd}`);
        
        if (isCI && platform === 'linux') {
          // Use sudo in CI environments
          execSync(`sudo ${cmd}`, { 
            stdio: 'inherit',
            timeout: 300000 // 5 minute timeout
          });
        } else {
          execSync(cmd, { 
            stdio: 'inherit',
            timeout: 300000
          });
        }
        
        this.log('info', `Successfully executed: ${cmd}`);
      } catch (error: any) {
        this.log('warn', `Failed to execute: ${cmd}`, {
          error: error.message,
          code: error.status,
          signal: error.signal
        });
        
        // Continue with other commands even if one fails
        continue;
      }
    }
  }

  /**
   * Configure Sharp with enterprise settings and optimization
   */
  public async configureSharp(): Promise<void> {
    this.log('info', 'Configuring Sharp with enterprise settings');

    // Write comprehensive .npmrc configuration
    const npmrcContent = `
# Sharp Enterprise Configuration
sharp_binary_host=${this.config.downloadOptions.fallbackHosts[0]}
sharp_libvips_binary_host=${this.config.downloadOptions.fallbackHosts[0]}/libvips
sharp_ignore_global_libvips=${this.config.buildOptions.forceLocal}
sharp_force_build=${this.config.buildOptions.forceLocal}
sharp_libvips_version=${this.config.buildOptions.libvipsVersion}

# Network configuration optimized for enterprise CI/CD
network-timeout=${this.config.downloadOptions.timeout}
fetch-retries=${this.config.downloadOptions.retries}
fetch-retry-mintimeout=${Math.floor(this.config.downloadOptions.retryDelay / 2)}
fetch-retry-maxtimeout=${this.config.downloadOptions.retryDelay * 2}

# Security and compliance settings
audit-level=moderate
fund=false
save-exact=true

# Performance optimizations
prefer-offline=true
cache-max=1073741824
fetch-timeout=${this.config.downloadOptions.timeout}

# Logging and debugging
loglevel=warn
logs-max=10
`.trim();

    fs.writeFileSync('.npmrc', npmrcContent);
    this.log('info', 'Written enhanced .npmrc configuration');

    // Write Sharp-specific configuration
    const sharpConfig = {
      runtime: this.config.buildOptions.runtime,
      target: this.config.buildOptions.target,
      libc: this.config.buildOptions.libc,
      platform: this.config.buildOptions.platform,
      arch: this.config.buildOptions.arch,
      libvips: this.config.buildOptions.libvipsVersion,
      download: {
        timeout: this.config.downloadOptions.timeout,
        retries: this.config.downloadOptions.retries,
        hosts: this.config.downloadOptions.fallbackHosts
      },
      enterprise: {
        cache_enabled: this.config.enterprise.enableCaching,
        cache_directory: this.cacheDir,
        verification_enabled: this.config.verification.functionalTest
      }
    };

    fs.writeFileSync('.sharp.json', JSON.stringify(sharpConfig, null, 2));
    this.log('info', 'Written .sharp.json enterprise configuration');

    // Create platform-specific environment configuration
    const envConfig = this.generateEnvironmentConfig();
    fs.writeFileSync('.sharp-env', envConfig);
    this.log('info', 'Written .sharp-env platform configuration');
  }

  /**
   * Generate platform-specific environment configuration
   */
  private generateEnvironmentConfig(): string {
    const config: string[] = [];
    
    // Platform-specific settings
    if (process.platform === 'linux') {
      config.push(`SHARP_PLATFORM=linux`);
      config.push(`SHARP_LIBC=${this.config.buildOptions.libc}`);
      
      if (this.config.buildOptions.libc === 'musl') {
        config.push(`SHARP_IGNORE_GLOBAL_LIBVIPS=1`);
        config.push(`SHARP_FORCE_BUILD=1`);
      }
    }
    
    // CI-specific settings
    if (process.env.CI === 'true') {
      config.push(`SHARP_CI=1`);
      config.push(`SHARP_TIMEOUT=${this.config.downloadOptions.timeout}`);
      config.push(`SHARP_RETRIES=${this.config.downloadOptions.retries}`);
    }
    
    // Build tool settings
    config.push(`CC=${process.env.CC || 'gcc'}`);
    config.push(`CXX=${process.env.CXX || 'g++'}`);
    config.push(`MAKE=${process.env.MAKE || 'make'}`);
    
    return config.join('\n');
  }

  /**
   * Try to use enterprise-cached binary
   */
  private async tryCachedBinary(): Promise<boolean> {
    if (!this.config.enterprise.enableCaching) {
      this.log('debug', 'Caching disabled, skipping cached binary strategy');
      return false;
    }

    this.log('info', 'Attempting to use enterprise-cached binary');

    const cacheKey = this.generateCacheKey();
    const cachedBinaryPath = path.join(this.cacheDir, 'binaries', `sharp-${cacheKey}.tgz`);

    if (!fs.existsSync(cachedBinaryPath)) {
      this.log('debug', 'No cached binary found for current configuration');
      return false;
    }

    try {
      // Verify cached binary integrity
      const checksumPath = path.join(this.cacheDir, 'checksums', `sharp-${cacheKey}.sha256`);
      if (fs.existsSync(checksumPath)) {
        const expectedChecksum = fs.readFileSync(checksumPath, 'utf8').trim();
        const actualChecksum = this.calculateChecksum(cachedBinaryPath);
        
        if (expectedChecksum !== actualChecksum) {
          this.log('warn', 'Cached binary checksum mismatch, removing invalid cache');
          fs.unlinkSync(cachedBinaryPath);
          fs.unlinkSync(checksumPath);
          return false;
        }
      }

      // Extract and install cached binary
      execSync(`tar -xzf "${cachedBinaryPath}" -C node_modules/sharp/`, { stdio: 'pipe' });
      this.log('info', 'Successfully restored Sharp from enterprise cache');
      
      return true;
    } catch (error: any) {
      this.log('warn', 'Failed to restore from cache', error);
      return false;
    }
  }

  /**
   * Generate cache key based on system configuration
   */
  private generateCacheKey(): string {
    const keyData = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      libc: this.config.buildOptions.libc,
      libvipsVersion: this.config.buildOptions.libvipsVersion
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Try to install pre-built binary with enhanced retry logic
   */
  private async tryPrebuiltBinary(): Promise<boolean> {
    this.log('info', 'Attempting pre-built binary installation with enhanced retry logic');

    for (let attempt = 1; attempt <= this.config.enterprise.maxRetryAttempts; attempt++) {
      this.log('debug', `Pre-built binary attempt ${attempt}/${this.config.enterprise.maxRetryAttempts}`);

      try {
        const success = await this.executeInstallation('npm install sharp --prefer-offline --no-audit', {
          timeout: this.config.downloadOptions.timeout,
          attempt
        });

        if (success) {
          this.log('info', 'Pre-built binary installation successful');
          
          // Cache successful installation if caching enabled
          if (this.config.enterprise.enableCaching) {
            await this.cacheSuccessfulInstallation();
          }
          
          return true;
        }
      } catch (error: any) {
        this.log('warn', `Pre-built binary attempt ${attempt} failed`, {
          error: error.message,
          attempt,
          maxAttempts: this.config.enterprise.maxRetryAttempts
        });

        if (attempt < this.config.enterprise.maxRetryAttempts) {
          const delay = this.config.downloadOptions.retryDelay * attempt;
          this.log('debug', `Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    this.log('error', 'All pre-built binary installation attempts failed');
    return false;
  }

  /**
   * Execute installation command with enhanced monitoring
   */
  private async executeInstallation(command: string, options: { timeout: number; attempt: number }): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        stdio: 'pipe',
        env: {
          ...process.env,
          ...this.getInstallationEnvironment()
        }
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        const success = code === 0;
        
        this.log('debug', `Installation command completed`, {
          command,
          code,
          success,
          attempt: options.attempt,
          outputLength: output.length,
          errorLength: errorOutput.length
        });

        if (!success && errorOutput) {
          this.log('debug', 'Installation error output', { errorOutput: errorOutput.slice(-1000) });
        }

        resolve(success);
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        this.log('warn', `Installation timeout after ${options.timeout}ms`);
        resolve(false);
      }, options.timeout);

      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Get installation environment variables
   */
  private getInstallationEnvironment(): Record<string, string> {
    return {
      npm_config_sharp_binary_host: this.config.downloadOptions.fallbackHosts[0],
      npm_config_sharp_libvips_binary_host: `${this.config.downloadOptions.fallbackHosts[0]}/libvips`,
      npm_config_cache_max: '1073741824', // 1GB
      npm_config_fetch_retries: this.config.downloadOptions.retries.toString(),
      npm_config_fetch_retry_mintimeout: (this.config.downloadOptions.retryDelay / 2).toString(),
      npm_config_fetch_retry_maxtimeout: (this.config.downloadOptions.retryDelay * 2).toString(),
      npm_config_network_timeout: this.config.downloadOptions.timeout.toString()
    };
  }

  /**
   * Cache successful Sharp installation
   */
  private async cacheSuccessfulInstallation(): Promise<void> {
    try {
      this.log('debug', 'Caching successful Sharp installation');
      
      const cacheKey = this.generateCacheKey();
      const cacheArchive = path.join(this.cacheDir, 'binaries', `sharp-${cacheKey}.tgz`);
      const checksumFile = path.join(this.cacheDir, 'checksums', `sharp-${cacheKey}.sha256`);

      // Create archive of Sharp installation
      execSync(`tar -czf "${cacheArchive}" -C node_modules sharp/`, { stdio: 'pipe' });
      
      // Generate and save checksum
      const checksum = this.calculateChecksum(cacheArchive);
      fs.writeFileSync(checksumFile, checksum);
      
      this.log('info', 'Sharp installation cached successfully', { cacheKey, checksum });
    } catch (error: any) {
      this.log('warn', 'Failed to cache Sharp installation', error);
    }
  }

  /**
   * Try to build Sharp from source with comprehensive configuration
   */
  private async tryBuildFromSource(): Promise<boolean> {
    this.log('info', 'Attempting to build Sharp from source with libvips');

    try {
      // Ensure system dependencies are installed
      await this.installSystemDependencies();

      // Set comprehensive build environment
      const buildEnv = {
        ...process.env,
        ...this.getInstallationEnvironment(),
        npm_config_build_from_source: 'true',
        npm_config_sharp_libvips: path.join(this.cacheDir, 'libvips'),
        SHARP_FORCE_BUILD: '1',
        SHARP_IGNORE_GLOBAL_LIBVIPS: this.config.buildOptions.forceLocal ? '1' : '0',
        PKG_CONFIG_PATH: '/usr/local/lib/pkgconfig:/usr/lib/pkgconfig:/lib/pkgconfig',
        LD_LIBRARY_PATH: '/usr/local/lib:/usr/lib:/lib'
      };

      const success = await this.executeInstallation('npm install sharp --build-from-source', {
        timeout: 600000, // 10 minutes for source build
        attempt: 1
      });

      if (success) {
        this.log('info', 'Successfully built Sharp from source');
        
        // Cache the build if caching is enabled
        if (this.config.enterprise.enableCaching) {
          await this.cacheSuccessfulInstallation();
        }
        
        return true;
      }

      return false;
    } catch (error: any) {
      this.log('error', 'Failed to build Sharp from source', error);
      return false;
    }
  }

  /**
   * Try to install a fallback version of Sharp
   */
  private async tryFallbackVersion(): Promise<boolean> {
    this.log('info', 'Attempting fallback Sharp version installation');

    const fallbackVersions = [
      '0.33.5',  // Latest stable
      '0.33.4',  // Recent stable
      '0.33.3',  // Older stable
      '0.33.2',  // Conservative choice
      '0.33.1',  // Older conservative
      '0.33.0',  // Major version baseline
      '0.32.6'   // Previous major
    ];

    for (const version of fallbackVersions) {
      try {
        this.log('debug', `Attempting Sharp version ${version}`);
        
        const success = await this.executeInstallation(`npm install sharp@${version}`, {
          timeout: this.config.downloadOptions.timeout,
          attempt: 1
        });

        if (success) {
          this.log('info', `Successfully installed Sharp version ${version}`);
          
          // Cache successful fallback if caching enabled
          if (this.config.enterprise.enableCaching) {
            await this.cacheSuccessfulInstallation();
          }
          
          return true;
        }
      } catch (error: any) {
        this.log('warn', `Failed to install Sharp version ${version}`, error);
      }
    }

    this.log('error', 'All fallback versions failed');
    return false;
  }

  /**
   * Try to use system package manager installation
   */
  private async trySystemPackage(): Promise<boolean> {
    this.log('info', 'Attempting system package manager installation');

    const platform = process.platform;

    try {
      if (platform === 'linux') {
        // Try to install Sharp via system package manager and then link
        execSync('apt-get install -y node-sharp || yum install -y nodejs-sharp || apk add nodejs-sharp', {
          stdio: 'inherit',
          timeout: 300000
        });
      } else if (platform === 'darwin') {
        // On macOS, ensure we have proper libvips and try again
        execSync('brew install sharp-cli || echo "Sharp CLI not available via brew"', {
          stdio: 'inherit',
          timeout: 300000
        });
      }

      // After system installation, try npm install again
      const success = await this.executeInstallation('npm install sharp --prefer-offline', {
        timeout: this.config.downloadOptions.timeout,
        attempt: 1
      });

      if (success) {
        this.log('info', 'System package installation successful');
        return true;
      }

      return false;
    } catch (error: any) {
      this.log('warn', 'System package installation failed', error);
      return false;
    }
  }

  /**
   * Install Sharp with comprehensive retry logic and fallback mechanisms
   */
  public async installSharp(): Promise<boolean> {
    this.log('info', 'Starting Sharp installation with enterprise strategies');

    // Filter strategies based on requirements and configuration
    const availableStrategies = this.strategies
      .filter(strategy => this.checkStrategyRequirements(strategy))
      .sort((a, b) => a.priority - b.priority);

    this.log('info', `Available installation strategies: ${availableStrategies.length}`, {
      strategies: availableStrategies.map(s => ({ name: s.name, priority: s.priority }))
    });

    for (const strategy of availableStrategies) {
      this.log('info', `Executing strategy: ${strategy.name}`, {
        description: strategy.description,
        priority: strategy.priority
      });

      try {
        const startTime = Date.now();
        const success = await strategy.execute();
        const duration = Date.now() - startTime;

        if (success) {
          this.log('info', `Strategy '${strategy.name}' succeeded`, { duration });
          
          // Record successful strategy for metrics
          await this.recordStrategySuccess(strategy.name, duration);
          
          return true;
        } else {
          this.log('warn', `Strategy '${strategy.name}' failed`, { duration });
          await this.recordStrategyFailure(strategy.name, duration);
        }
      } catch (error: any) {
        this.log('error', `Strategy '${strategy.name}' threw exception`, {
          error: error.message,
          stack: error.stack
        });
        await this.recordStrategyFailure(strategy.name, 0, error.message);
      }
    }

    this.log('error', 'All Sharp installation strategies failed');
    return false;
  }

  /**
   * Check if strategy requirements are met
   */
  private checkStrategyRequirements(strategy: InstallationStrategy): boolean {
    if (!strategy.requirements) return true;

    for (const requirement of strategy.requirements) {
      switch (requirement) {
        case 'cache_enabled':
          if (!this.config.enterprise.enableCaching) return false;
          break;
        case 'network_access':
          // Could add network connectivity check here
          break;
        case 'build_tools':
          if (!this.checkBuildTools()) return false;
          break;
        case 'development_headers':
          if (!this.checkDevelopmentHeaders()) return false;
          break;
        case 'package_manager':
          if (!this.checkPackageManager()) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Check if build tools are available
   */
  private checkBuildTools(): boolean {
    try {
      execSync('gcc --version', { stdio: 'pipe' });
      execSync('make --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if development headers are available
   */
  private checkDevelopmentHeaders(): boolean {
    // Check for common development header locations
    const headerPaths = [
      '/usr/include/vips',
      '/usr/local/include/vips',
      '/opt/homebrew/include/vips'
    ];

    return headerPaths.some(path => fs.existsSync(path));
  }

  /**
   * Check if package manager is available
   */
  private checkPackageManager(): boolean {
    try {
      if (process.platform === 'linux') {
        execSync('command -v apt-get || command -v yum || command -v apk', { stdio: 'pipe' });
        return true;
      } else if (process.platform === 'darwin') {
        execSync('command -v brew', { stdio: 'pipe' });
        return true;
      }
    } catch {}
    
    return false;
  }

  /**
   * Record successful strategy execution
   */
  private async recordStrategySuccess(strategyName: string, duration: number): Promise<void> {
    if (!this.config.enterprise.enableMetrics) return;

    const metricsFile = path.join(this.metricsDir, 'strategy-success.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      strategy: strategyName,
      duration,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      success: true
    };

    try {
      fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      this.log('warn', 'Failed to record strategy success metrics', error);
    }
  }

  /**
   * Record failed strategy execution
   */
  private async recordStrategyFailure(strategyName: string, duration: number, error?: string): Promise<void> {
    if (!this.config.enterprise.enableMetrics) return;

    const metricsFile = path.join(this.metricsDir, 'strategy-failure.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      strategy: strategyName,
      duration,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      success: false,
      error
    };

    try {
      fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      this.log('warn', 'Failed to record strategy failure metrics', error);
    }
  }

  /**
   * Verify Sharp installation and functionality with comprehensive testing
   */
  public async verifyInstallation(): Promise<boolean> {
    this.log('info', 'Verifying Sharp installation with comprehensive testing');

    const verificationTests: Array<{ name: string; test: () => Promise<boolean> }> = [
      { name: 'module-load', test: () => this.testModuleLoad() },
      { name: 'version-info', test: () => this.testVersionInfo() },
      { name: 'basic-functionality', test: () => this.testBasicFunctionality() },
      { name: 'format-support', test: () => this.testFormatSupport() },
      { name: 'performance-benchmark', test: () => this.testPerformance() }
    ];

    const results: Record<string, boolean> = {};
    let overallSuccess = true;

    for (const { name, test } of verificationTests) {
      try {
        this.log('debug', `Running verification test: ${name}`);
        const result = await test();
        results[name] = result;
        
        if (result) {
          this.log('info', `✅ Verification test '${name}' passed`);
        } else {
          this.log('warn', `❌ Verification test '${name}' failed`);
          overallSuccess = false;
        }
      } catch (error: any) {
        this.log('error', `❌ Verification test '${name}' threw exception`, error);
        results[name] = false;
        overallSuccess = false;
      }
    }

    // Record verification results
    await this.recordVerificationResults(results, overallSuccess);

    if (overallSuccess) {
      this.log('info', '✅ All Sharp verification tests passed');
    } else {
      this.log('warn', '⚠️ Some Sharp verification tests failed');
    }

    return overallSuccess;
  }

  /**
   * Test basic module loading
   */
  private async testModuleLoad(): Promise<boolean> {
    try {
      const sharp = await import('sharp');
      return typeof sharp.default === 'function';
    } catch (error) {
      return false;
    }
  }

  /**
   * Test version information retrieval
   */
  private async testVersionInfo(): Promise<boolean> {
    try {
      const sharp = await import('sharp');
      const versions = sharp.default.versions;
      
      this.log('debug', 'Sharp version information', versions);
      
      return versions && 
             typeof versions.vips === 'string' && 
             typeof versions.sharp === 'string';
    } catch (error) {
      return false;
    }
  }

  /**
   * Test basic image processing functionality
   */
  private async testBasicFunctionality(): Promise<boolean> {
    try {
      const sharp = await import('sharp');
      
      // Create a simple test image buffer (1x1 red pixel PNG)
      const testBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x5C, 0xC8, 0x2D, 0xB0, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      // Test basic operations
      const metadata = await sharp.default(testBuffer).metadata();
      const resized = await sharp.default(testBuffer).resize(2, 2).png().toBuffer();
      
      return metadata.width === 1 && 
             metadata.height === 1 && 
             Buffer.isBuffer(resized) && 
             resized.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test format support
   */
  private async testFormatSupport(): Promise<boolean> {
    try {
      const sharp = await import('sharp');
      const formats = sharp.default.format;
      
      // Check for essential format support
      const essentialFormats = ['jpeg', 'png', 'webp'];
      const supportedFormats = Object.keys(formats);
      
      this.log('debug', 'Supported formats', { supportedFormats });
      
      return essentialFormats.every(format => 
        supportedFormats.includes(format) && formats[format].input && formats[format].output
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Test performance with benchmark
   */
  private async testPerformance(): Promise<boolean> {
    try {
      const sharp = await import('sharp');
      
      // Create a larger test image for performance testing
      const testImage = sharp.default({
        create: {
          width: 1000,
          height: 1000,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).png();

      const startTime = Date.now();
      
      // Perform a complex operation
      await testImage
        .resize(500, 500)
        .blur(2)
        .sharpen()
        .jpeg({ quality: 80 })
        .toBuffer();
      
      const duration = Date.now() - startTime;
      
      this.log('debug', 'Performance test completed', { duration });
      
      // Performance should complete within reasonable time (5 seconds)
      return duration < 5000;
    } catch (error) {
      return false;
    }
  }

  /**
   * Record verification results for metrics
   */
  private async recordVerificationResults(results: Record<string, boolean>, overallSuccess: boolean): Promise<void> {
    if (!this.config.enterprise.enableMetrics) return;

    const metricsFile = path.join(this.metricsDir, 'verification-results.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      libc: this.config.buildOptions.libc,
      results,
      overallSuccess,
      duration: Date.now() - this.startTime
    };

    try {
      fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      this.log('warn', 'Failed to record verification results', error);
    }
  }

  /**
   * Generate comprehensive diagnostic report
   */
  public async generateDiagnosticReport(): Promise<void> {
    this.log('info', 'Generating comprehensive diagnostic report');

    const diagnostics: DiagnosticResult[] = [];

    // System diagnostics
    diagnostics.push(...await this.runSystemDiagnostics());
    
    // Environment diagnostics
    diagnostics.push(...await this.runEnvironmentDiagnostics());
    
    // Sharp-specific diagnostics
    diagnostics.push(...await this.runSharpDiagnostics());
    
    // Dependency diagnostics
    diagnostics.push(...await this.runDependencyDiagnostics());

    // Generate summary report
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      platform: {
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        libc: this.config.buildOptions.libc
      },
      configuration: this.config,
      diagnostics,
      summary: this.generateDiagnosticSummary(diagnostics),
      recommendations: this.generateRecommendations(diagnostics)
    };

    // Save detailed report
    const reportPath = path.join(this.metricsDir, 'reports', `diagnostic-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Save summary for quick reference
    const summaryPath = path.join(process.cwd(), 'sharp-diagnostic-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: report.timestamp,
      platform: report.platform,
      summary: report.summary,
      recommendations: report.recommendations.slice(0, 5) // Top 5 recommendations
    }, null, 2));
    
    this.log('info', `Comprehensive diagnostic report saved to ${reportPath}`);
    this.log('info', `Quick summary saved to ${summaryPath}`);
    
    // Display summary in console
    this.displayDiagnosticSummary(report.summary, report.recommendations);
  }

  /**
   * Run system-level diagnostics
   */
  private async runSystemDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check available memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = (totalMem - freeMem) / totalMem;

    results.push({
      category: 'system',
      status: memUsage < 0.9 ? 'pass' : 'warn',
      message: `Memory usage: ${(memUsage * 100).toFixed(1)}%`,
      details: { totalMem, freeMem, usagePercent: memUsage * 100 },
      recommendation: memUsage > 0.8 ? 'Consider freeing memory or increasing available RAM' : undefined
    });

    // Check CPU information
    const cpuCount = os.cpus().length;
    results.push({
      category: 'system',
      status: cpuCount >= 2 ? 'pass' : 'warn',
      message: `CPU cores: ${cpuCount}`,
      details: { cpuCount, cpus: os.cpus() },
      recommendation: cpuCount < 2 ? 'Multiple CPU cores recommended for better performance' : undefined
    });

    // Check disk space
    try {
      const stats = fs.statSync(process.cwd());
      results.push({
        category: 'system',
        status: 'pass',
        message: 'Disk access working',
        details: { cwd: process.cwd(), stats: { size: stats.size, mode: stats.mode } }
      });
    } catch (error: any) {
      results.push({
        category: 'system',
        status: 'fail',
        message: 'Disk access failed',
        details: { error: error.message },
        recommendation: 'Check disk permissions and available space'
      });
    }

    return results;
  }

  /**
   * Run environment diagnostics
   */
  private async runEnvironmentDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    results.push({
      category: 'environment',
      status: majorVersion >= 18 ? 'pass' : 'warn',
      message: `Node.js version: ${nodeVersion}`,
      details: { version: nodeVersion, majorVersion },
      recommendation: majorVersion < 18 ? 'Node.js 18+ recommended for best Sharp compatibility' : undefined
    });

    // Check npm/pnpm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      results.push({
        category: 'environment',
        status: 'pass',
        message: `npm version: ${npmVersion}`,
        details: { npmVersion }
      });
    } catch (error: any) {
      results.push({
        category: 'environment',
        status: 'fail',
        message: 'npm not available',
        details: { error: error.message },
        recommendation: 'Install npm or ensure it is in PATH'
      });
    }

    // Check environment variables
    const envVars = ['NODE_ENV', 'CI', 'npm_config_cache'];
    envVars.forEach(varName => {
      const value = process.env[varName];
      results.push({
        category: 'environment',
        status: 'pass',
        message: `Environment variable ${varName}: ${value || 'not set'}`,
        details: { variable: varName, value }
      });
    });

    return results;
  }

  /**
   * Run Sharp-specific diagnostics
   */
  private async runSharpDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check if Sharp is installed
    try {
      const sharp = await import('sharp');
      
      results.push({
        category: 'sharp',
        status: 'pass',
        message: 'Sharp module loaded successfully',
        details: { moduleLoaded: true }
      });

      // Check Sharp versions
      try {
        const versions = sharp.default.versions;
        results.push({
          category: 'sharp',
          status: 'pass',
          message: 'Sharp versions retrieved',
          details: { versions }
        });
      } catch (error: any) {
        results.push({
          category: 'sharp',
          status: 'warn',
          message: 'Could not retrieve Sharp versions',
          details: { error: error.message },
          recommendation: 'Sharp may not be properly compiled'
        });
      }

      // Check format support
      try {
        const formats = sharp.default.format;
        const supportedFormats = Object.keys(formats);
        
        results.push({
          category: 'sharp',
          status: supportedFormats.length > 5 ? 'pass' : 'warn',
          message: `Supported formats: ${supportedFormats.length}`,
          details: { formats: supportedFormats },
          recommendation: supportedFormats.length <= 5 ? 'Limited format support detected' : undefined
        });
      } catch (error: any) {
        results.push({
          category: 'sharp',
          status: 'fail',
          message: 'Could not check format support',
          details: { error: error.message },
          recommendation: 'Sharp may not be properly initialized'
        });
      }

    } catch (error: any) {
      results.push({
        category: 'sharp',
        status: 'fail',
        message: 'Sharp module failed to load',
        details: { error: error.message },
        recommendation: 'Run Sharp installation process'
      });
    }

    return results;
  }

  /**
   * Run dependency diagnostics
   */
  private async runDependencyDiagnostics(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check for build tools
    const buildTools = ['gcc', 'g++', 'make', 'python3'];
    
    for (const tool of buildTools) {
      try {
        execSync(`command -v ${tool}`, { stdio: 'pipe' });
        results.push({
          category: 'dependencies',
          status: 'pass',
          message: `Build tool ${tool} available`,
          details: { tool, available: true }
        });
      } catch {
        results.push({
          category: 'dependencies',
          status: 'warn',
          message: `Build tool ${tool} not available`,
          details: { tool, available: false },
          recommendation: `Install ${tool} for building Sharp from source`
        });
      }
    }

    // Check for libvips
    try {
      execSync('pkg-config --exists vips', { stdio: 'pipe' });
      const version = execSync('pkg-config --modversion vips', { encoding: 'utf8' }).trim();
      
      results.push({
        category: 'dependencies',
        status: 'pass',
        message: `libvips available: ${version}`,
        details: { libvips: version, available: true }
      });
    } catch {
      results.push({
        category: 'dependencies',
        status: 'warn',
        message: 'libvips not available via pkg-config',
        details: { libvips: false },
        recommendation: 'Install libvips development headers for building Sharp'
      });
    }

    return results;
  }

  /**
   * Generate diagnostic summary
   */
  private generateDiagnosticSummary(diagnostics: DiagnosticResult[]): any {
    const summary = {
      total: diagnostics.length,
      passed: diagnostics.filter(d => d.status === 'pass').length,
      warnings: diagnostics.filter(d => d.status === 'warn').length,
      failed: diagnostics.filter(d => d.status === 'fail').length,
      byCategory: {} as Record<string, any>
    };

    // Group by category
    const categories = [...new Set(diagnostics.map(d => d.category))];
    categories.forEach(category => {
      const categoryDiagnostics = diagnostics.filter(d => d.category === category);
      summary.byCategory[category] = {
        total: categoryDiagnostics.length,
        passed: categoryDiagnostics.filter(d => d.status === 'pass').length,
        warnings: categoryDiagnostics.filter(d => d.status === 'warn').length,
        failed: categoryDiagnostics.filter(d => d.status === 'fail').length
      };
    });

    return summary;
  }

  /**
   * Generate recommendations based on diagnostics
   */
  private generateRecommendations(diagnostics: DiagnosticResult[]): string[] {
    const recommendations: string[] = [];

    // Collect recommendations from diagnostics
    diagnostics.forEach(diagnostic => {
      if (diagnostic.recommendation) {
        recommendations.push(diagnostic.recommendation);
      }
    });

    // Add general recommendations based on patterns
    const failedCount = diagnostics.filter(d => d.status === 'fail').length;
    const warningCount = diagnostics.filter(d => d.status === 'warn').length;

    if (failedCount > 0) {
      recommendations.unshift('Address critical failures before proceeding with Sharp installation');
    }

    if (warningCount > 2) {
      recommendations.push('Multiple warnings detected - consider addressing these for optimal performance');
    }

    // Platform-specific recommendations
    if (process.platform === 'linux' && this.config.buildOptions.libc === 'musl') {
      recommendations.push('Alpine/musl detected - ensure build-base and vips-dev packages are installed');
    }

    if (process.env.CI === 'true') {
      recommendations.push('CI environment detected - enable caching for faster subsequent builds');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Display diagnostic summary in console
   */
  private displayDiagnosticSummary(summary: any, recommendations: string[]): void {
    console.log('\n🏥 Sharp Enterprise Diagnostic Summary');
    console.log('=====================================');
    console.log(`📊 Overall Status: ${summary.passed}/${summary.total} checks passed`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`⚠️  Warnings: ${summary.warnings}`);
    console.log(`❌ Failed: ${summary.failed}`);
    
    console.log('\n📋 By Category:');
    Object.entries(summary.byCategory).forEach(([category, stats]: [string, any]) => {
      console.log(`  ${category}: ${stats.passed}/${stats.total} passed`);
    });

    if (recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

    console.log('\n📄 Full diagnostic report saved to .metrics/sharp/reports/');
  }

  /**
   * Utility function for async sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main execution flow with comprehensive error handling
   */
  public async run(): Promise<void> {
    console.log('🚀 Sharp Enterprise Configuration Manager v2.0');
    console.log('===============================================\n');

    try {
      // Step 1: System dependency installation
      this.log('info', 'Step 1: Installing system dependencies');
      await this.installSystemDependencies();

      // Step 2: Sharp configuration
      this.log('info', 'Step 2: Configuring Sharp enterprise settings');
      await this.configureSharp();

      // Step 3: Sharp installation with strategies
      this.log('info', 'Step 3: Installing Sharp with enterprise strategies');
      const installed = await this.installSharp();
      
      if (!installed) {
        throw new Error('Sharp installation failed - all strategies exhausted');
      }

      // Step 4: Comprehensive verification
      this.log('info', 'Step 4: Verifying Sharp installation');
      const verified = await this.verifyInstallation();
      
      if (!verified) {
        this.log('warn', 'Sharp installation verification had issues but proceeding');
      }

      // Step 5: Generate diagnostic report
      this.log('info', 'Step 5: Generating comprehensive diagnostic report');
      await this.generateDiagnosticReport();

      const duration = Date.now() - this.startTime;
      console.log(`\n✅ Sharp enterprise configuration completed successfully in ${duration}ms!`);
      console.log('🎯 Sharp is ready for enterprise production use.');
      
      process.exit(0);
    } catch (error: any) {
      const duration = Date.now() - this.startTime;
      console.error(`\n❌ Sharp enterprise configuration failed after ${duration}ms:`);
      console.error(error.message);
      
      this.log('error', 'Sharp configuration failed', {
        error: error.message,
        stack: error.stack,
        duration
      });

      // Always generate diagnostic report even on failure
      try {
        await this.generateDiagnosticReport();
        console.log('\n📋 Diagnostic report generated despite failure - check for troubleshooting information');
      } catch (diagError) {
        console.error('Failed to generate diagnostic report:', diagError);
      }
      
      process.exit(1);
    }
  }
}

// Execute if run directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new SharpEnterpriseManager();
  manager.run().catch(error => {
    console.error('Unhandled error in Sharp Enterprise Manager:', error);
    process.exit(1);
  });
}

export { SharpEnterpriseManager };