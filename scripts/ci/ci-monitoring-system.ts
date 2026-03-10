#!/usr/bin/env node

/**
 * Enterprise CI/CD Health Monitoring System
 * 
 * Provides comprehensive health checks, metrics collection, and alerting for CI/CD infrastructure.
 * Includes 10 critical infrastructure health checks, real-time metrics collection,
 * multiple export formats, and automated recommendation engine.
 * 
 * @author Ectropy Platform Team
 * @version 2.0.0
 * @enterprise true
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import * as crypto from 'crypto';

interface HealthCheckResult {
  name: string;
  category: 'infrastructure' | 'security' | 'performance' | 'dependencies' | 'configuration';
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  score: number; // 0-100
  message: string;
  details?: any;
  timestamp: string;
  duration: number;
  recommendations?: string[];
  metrics?: Record<string, number>;
}

interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
    available: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    latency: number;
    throughput: number;
    connectivity: boolean;
  };
  process: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

interface CIMetrics {
  buildDuration: number;
  testCoverage: number;
  securityScore: number;
  dependencyHealth: number;
  deploymentReadiness: number;
  cacheHitRate: number;
  errorRate: number;
  throughput: number;
}

interface MonitoringConfig {
  healthChecks: {
    enableAll: boolean;
    interval: number;
    timeout: number;
    retries: number;
  };
  metrics: {
    enabled: boolean;
    interval: number;
    retention: number;
    exportFormats: ('json' | 'prometheus' | 'csv' | 'influx')[];
  };
  alerting: {
    enabled: boolean;
    thresholds: Record<string, number>;
    channels: ('console' | 'file' | 'webhook' | 'email')[];
  };
  recommendations: {
    enabled: boolean;
    maxRecommendations: number;
    priorityThreshold: number;
  };
}

/**
 * Enterprise CI/CD Health Monitoring System
 */
class CIMonitoringSystem {
  private readonly config: MonitoringConfig;
  private readonly metricsDir: string;
  private readonly reportsDir: string;
  private readonly startTime: number;
  private readonly healthChecks: Map<string, () => Promise<HealthCheckResult>>;
  private readonly alertThresholds: Map<string, number>;
  private metricsHistory: SystemMetrics[] = [];
  private healthHistory: HealthCheckResult[] = [];

  constructor() {
    this.startTime = Date.now();
    this.config = this.loadConfiguration();
    this.metricsDir = path.join(process.cwd(), '.metrics', 'ci-monitoring');
    this.reportsDir = path.join(this.metricsDir, 'reports');
    this.healthChecks = this.initializeHealthChecks();
    this.alertThresholds = this.initializeAlertThresholds();
    this.ensureDirectories();
  }

  /**
   * Load monitoring configuration with enterprise defaults
   */
  private loadConfiguration(): MonitoringConfig {
    const isCI = process.env.CI === 'true';
    const isProduction = process.env.NODE_ENV === 'production';

    const defaultConfig: MonitoringConfig = {
      healthChecks: {
        enableAll: true,
        interval: isCI ? 300000 : 60000, // 5 min in CI, 1 min locally
        timeout: 30000, // 30 seconds
        retries: 3
      },
      metrics: {
        enabled: true,
        interval: isCI ? 60000 : 30000, // 1 min in CI, 30s locally
        retention: isCI ? 86400000 : 3600000, // 24h in CI, 1h locally
        exportFormats: isProduction ? ['json', 'prometheus', 'csv'] : ['json']
      },
      alerting: {
        enabled: isCI || isProduction,
        thresholds: {
          cpu_usage: 80,
          memory_usage: 85,
          disk_usage: 90,
          error_rate: 5,
          response_time: 5000
        },
        channels: isCI ? ['console', 'file'] : ['console']
      },
      recommendations: {
        enabled: true,
        maxRecommendations: 10,
        priorityThreshold: 70
      }
    };

    // Load custom configuration if available
    const configPath = path.join(process.cwd(), '.ci-monitoring.json');
    if (fs.existsSync(configPath)) {
      try {
        const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return this.mergeConfigs(defaultConfig, customConfig);
      } catch (error) {
        console.warn('Failed to load custom monitoring config, using defaults');
      }
    }

    return defaultConfig;
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
   * Initialize health check functions
   */
  private initializeHealthChecks(): Map<string, () => Promise<HealthCheckResult>> {
    return new Map([
      ['node-environment', this.checkNodeEnvironment.bind(this)],
      ['package-manager', this.checkPackageManager.bind(this)],
      ['dependencies', this.checkDependencies.bind(this)],
      ['build-tools', this.checkBuildTools.bind(this)],
      ['security-baseline', this.checkSecurityBaseline.bind(this)],
      ['docker-environment', this.checkDockerEnvironment.bind(this)],
      ['network-connectivity', this.checkNetworkConnectivity.bind(this)],
      ['git-repository', this.checkGitRepository.bind(this)],
      ['cache-systems', this.checkCacheSystems.bind(this)],
      ['system-resources', this.checkSystemResources.bind(this)]
    ]);
  }

  /**
   * Initialize alert thresholds
   */
  private initializeAlertThresholds(): Map<string, number> {
    return new Map([
      ['cpu_usage', this.config.alerting.thresholds.cpu_usage],
      ['memory_usage', this.config.alerting.thresholds.memory_usage],
      ['disk_usage', this.config.alerting.thresholds.disk_usage],
      ['error_rate', this.config.alerting.thresholds.error_rate],
      ['response_time', this.config.alerting.thresholds.response_time],
      ['health_score', 70],
      ['security_score', 80],
      ['dependency_vulnerabilities', 0]
    ]);
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      this.metricsDir,
      this.reportsDir,
      path.join(this.metricsDir, 'health'),
      path.join(this.metricsDir, 'system'),
      path.join(this.metricsDir, 'alerts'),
      path.join(this.metricsDir, 'exports')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Collect comprehensive system metrics
   */
  public async collectSystemMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date().toISOString();

    // CPU metrics
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const cpuUsage = this.calculateCpuUsage();

    // Memory metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Disk metrics
    const diskInfo = await this.getDiskInfo();

    // Network metrics
    const networkInfo = await this.getNetworkInfo();

    // Process metrics
    const processInfo = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    const metrics: SystemMetrics = {
      timestamp,
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
        loadAverage: loadAvg,
        model: cpus[0]?.model || 'unknown'
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: (usedMem / totalMem) * 100,
        available: freeMem
      },
      disk: diskInfo,
      network: networkInfo,
      process: processInfo
    };

    // Store metrics
    this.metricsHistory.push(metrics);
    
    // Trim history based on retention policy
    const retentionTime = Date.now() - this.config.metrics.retention;
    this.metricsHistory = this.metricsHistory.filter(m => 
      new Date(m.timestamp).getTime() > retentionTime
    );

    return metrics;
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCpuUsage(): number {
    try {
      // Use load average as approximation of CPU usage
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      return Math.min((loadAvg / cpuCount) * 100, 100);
    } catch {
      return 0;
    }
  }

  /**
   * Get disk information
   */
  private async getDiskInfo(): Promise<{ total: number; used: number; free: number; percentage: number }> {
    try {
      if (process.platform === 'win32') {
        // Windows implementation
        const output = execSync('dir /-c', { encoding: 'utf8' });
        // Parse Windows dir output - simplified
        return { total: 0, used: 0, free: 0, percentage: 0 };
      } else {
        // Unix-like systems
        const output = execSync('df -k / 2>/dev/null | tail -1', { encoding: 'utf8' });
        const parts = output.trim().split(/\s+/);
        
        if (parts.length >= 4) {
          const total = parseInt(parts[1]) * 1024;
          const used = parseInt(parts[2]) * 1024;
          const free = parseInt(parts[3]) * 1024;
          const percentage = (used / total) * 100;
          
          return { total, used, free, percentage };
        }
      }
    } catch (error) {
      console.warn('Could not get disk information:', error);
    }
    
    return { total: 0, used: 0, free: 0, percentage: 0 };
  }

  /**
   * Get network information
   */
  private async getNetworkInfo(): Promise<{ latency: number; throughput: number; connectivity: boolean }> {
    let latency = -1;
    let connectivity = false;
    const throughput = 0; // Would need more sophisticated measurement

    try {
      // Test connectivity and latency to a reliable host
      const start = Date.now();
      
      if (process.platform === 'win32') {
        execSync('ping -n 1 8.8.8.8', { timeout: 5000, stdio: 'pipe' });
      } else {
        execSync('ping -c 1 8.8.8.8', { timeout: 5000, stdio: 'pipe' });
      }
      
      latency = Date.now() - start;
      connectivity = true;
    } catch {
      connectivity = false;
    }

    return { latency, throughput, connectivity };
  }

  /**
   * Health Check: Node.js Environment
   */
  private async checkNodeEnvironment(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      const expectedMajor = 20;

      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      let score = 100;
      const recommendations: string[] = [];

      if (majorVersion < expectedMajor) {
        status = majorVersion < 18 ? 'critical' : 'degraded';
        score = majorVersion < 18 ? 20 : 70;
        recommendations.push(`Upgrade to Node.js ${expectedMajor}+ for optimal performance`);
      }

      // Check Node.js features
      const features = {
        'Worker Threads': typeof Worker !== 'undefined',
        'ES Modules': true, // Always available in modern Node
        'Async Iteration': Symbol.asyncIterator !== undefined,
        'BigInt': typeof BigInt !== 'undefined'
      };

      const missingFeatures = Object.entries(features)
        .filter(([, available]) => !available)
        .map(([feature]) => feature);

      if (missingFeatures.length > 0) {
        status = 'degraded';
        score = Math.max(score - (missingFeatures.length * 15), 20);
        recommendations.push(`Missing features: ${missingFeatures.join(', ')}`);
      }

      return {
        name: 'Node.js Environment',
        category: 'infrastructure',
        status,
        score,
        message: `Node.js ${nodeVersion} with ${Object.keys(features).length - missingFeatures.length}/${Object.keys(features).length} features`,
        details: { 
          version: nodeVersion, 
          majorVersion, 
          features,
          missingFeatures 
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations
      };
    } catch (error: any) {
      return {
        name: 'Node.js Environment',
        category: 'infrastructure',
        status: 'critical',
        score: 0,
        message: `Node.js environment check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations: ['Check Node.js installation and configuration']
      };
    }
  }

  /**
   * Health Check: Package Manager
   */
  private async checkPackageManager(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Check pnpm
      let pnpmVersion = '';
      let pnpmAvailable = false;
      
      try {
        pnpmVersion = execSync('pnpm --version', { encoding: 'utf8', timeout: 5000 }).trim();
        pnpmAvailable = true;
      } catch {}

      // Check npm
      let npmVersion = '';
      let npmAvailable = false;
      
      try {
        npmVersion = execSync('npm --version', { encoding: 'utf8', timeout: 5000 }).trim();
        npmAvailable = true;
      } catch {}

      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      let score = 100;
      const recommendations: string[] = [];

      if (!pnpmAvailable && !npmAvailable) {
        status = 'critical';
        score = 0;
        recommendations.push('Install a package manager (npm or pnpm)');
      } else if (!pnpmAvailable) {
        status = 'degraded';
        score = 70;
        recommendations.push('Consider installing pnpm for better performance');
      }

      // Check lock file integrity
      let lockFileStatus = 'unknown';
      if (pnpmAvailable && fs.existsSync('pnpm-lock.yaml')) {
        try {
          execSync('pnpm install --frozen-lockfile --dry-run', { stdio: 'pipe', timeout: 10000 });
          lockFileStatus = 'valid';
        } catch {
          lockFileStatus = 'invalid';
          status = 'degraded';
          score = Math.min(score, 60);
          recommendations.push('Lock file is out of sync with package.json');
        }
      }

      return {
        name: 'Package Manager',
        category: 'infrastructure',
        status,
        score,
        message: `pnpm: ${pnpmAvailable ? pnpmVersion : 'not available'}, npm: ${npmAvailable ? npmVersion : 'not available'}`,
        details: {
          pnpm: { available: pnpmAvailable, version: pnpmVersion },
          npm: { available: npmAvailable, version: npmVersion },
          lockFile: lockFileStatus
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations
      };
    } catch (error: any) {
      return {
        name: 'Package Manager',
        category: 'infrastructure',
        status: 'critical',
        score: 0,
        message: `Package manager check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations: ['Check package manager installation']
      };
    }
  }

  /**
   * Health Check: Dependencies
   */
  private async checkDependencies(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const recommendations: string[] = [];
      let vulnerabilities = { critical: 0, high: 0, moderate: 0, low: 0 };
      let outdatedCount = 0;
      let score = 100;

      // Security audit
      try {
        const auditOutput = execSync('npm audit --json', { encoding: 'utf8', timeout: 30000 });
        const audit = JSON.parse(auditOutput);
        vulnerabilities = audit.metadata?.vulnerabilities || vulnerabilities;
      } catch {
        // Audit might fail but we continue
        recommendations.push('Could not perform security audit');
        score -= 10;
      }

      // Check for outdated packages
      try {
        const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf8', timeout: 15000 });
        const outdated = JSON.parse(outdatedOutput);
        outdatedCount = Object.keys(outdated).length;
      } catch {
        // No outdated packages or error (which is actually good for outdated check)
      }

      // Calculate status and score
      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      
      if (vulnerabilities.critical > 0) {
        status = 'critical';
        score = 20;
        recommendations.push(`${vulnerabilities.critical} critical vulnerabilities found - immediate action required`);
      } else if (vulnerabilities.high > 0) {
        status = 'degraded';
        score = 50;
        recommendations.push(`${vulnerabilities.high} high severity vulnerabilities found`);
      } else if (vulnerabilities.moderate > 5) {
        status = 'degraded';
        score = 70;
        recommendations.push(`${vulnerabilities.moderate} moderate vulnerabilities found`);
      }

      if (outdatedCount > 20) {
        score = Math.min(score, 60);
        recommendations.push(`${outdatedCount} outdated packages - consider updating`);
      }

      return {
        name: 'Dependencies',
        category: 'security',
        status,
        score,
        message: `${vulnerabilities.critical + vulnerabilities.high} critical/high vulnerabilities, ${outdatedCount} outdated packages`,
        details: { vulnerabilities, outdatedCount },
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations,
        metrics: {
          critical_vulnerabilities: vulnerabilities.critical,
          high_vulnerabilities: vulnerabilities.high,
          outdated_packages: outdatedCount
        }
      };
    } catch (error: any) {
      return {
        name: 'Dependencies',
        category: 'security',
        status: 'unknown',
        score: 50,
        message: `Dependency check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations: ['Check dependency management tools availability']
      };
    }
  }

  /**
   * Health Check: Build Tools
   */
  private async checkBuildTools(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const buildTools = [
      { name: 'gcc', command: 'gcc --version', required: false },
      { name: 'g++', command: 'g++ --version', required: false },
      { name: 'make', command: 'make --version', required: false },
      { name: 'python3', command: 'python3 --version', required: false },
      { name: 'git', command: 'git --version', required: true },
      { name: 'docker', command: 'docker --version', required: false }
    ];

    const results: Record<string, { available: boolean; version?: string }> = {};
    let availableCount = 0;
    let requiredMissing = 0;

    for (const tool of buildTools) {
      try {
        const output = execSync(tool.command, { encoding: 'utf8', timeout: 5000 }).trim();
        results[tool.name] = { available: true, version: output.split('\n')[0] };
        availableCount++;
      } catch {
        results[tool.name] = { available: false };
        if (tool.required) requiredMissing++;
      }
    }

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    let score = (availableCount / buildTools.length) * 100;
    const recommendations: string[] = [];

    if (requiredMissing > 0) {
      status = 'critical';
      score = 20;
      recommendations.push('Install required build tools: git');
    } else if (availableCount < 4) {
      status = 'degraded';
      recommendations.push('Install additional build tools for better compatibility');
    }

    return {
      name: 'Build Tools',
      category: 'infrastructure',
      status,
      score,
      message: `${availableCount}/${buildTools.length} build tools available`,
      details: { tools: results, availableCount, totalTools: buildTools.length },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      recommendations
    };
  }

  /**
   * Health Check: Security Baseline
   */
  private async checkSecurityBaseline(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const securityChecks = [
      { name: 'gitleaks_config', path: '.gitleaks.toml', weight: 20 },
      { name: 'security_md', path: 'SECURITY.md', weight: 15 },
      { name: 'github_workflows', path: '.github/workflows', weight: 15 },
      { name: 'nvmrc', path: '.nvmrc', weight: 10 },
      { name: 'gitignore', path: '.gitignore', weight: 10 },
      { name: 'npmrc_security', path: '.npmrc', weight: 10 },
      { name: 'dockerfile', path: 'Dockerfile', weight: 10 },
      { name: 'docker_ignore', path: '.dockerignore', weight: 5 },
      { name: 'husky_hooks', path: '.husky', weight: 5 }
    ];

    let totalScore = 0;
    let maxScore = 0;
    const results: Record<string, boolean> = {};
    const recommendations: string[] = [];

    for (const check of securityChecks) {
      const exists = fs.existsSync(check.path);
      results[check.name] = exists;
      if (exists) {
        totalScore += check.weight;
      } else {
        recommendations.push(`Add ${check.path} for improved security`);
      }
      maxScore += check.weight;
    }

    const score = (totalScore / maxScore) * 100;
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (score < 30) {
      status = 'critical';
    } else if (score < 60) {
      status = 'degraded';
    }

    return {
      name: 'Security Baseline',
      category: 'security',
      status,
      score,
      message: `${totalScore}/${maxScore} security controls in place`,
      details: { checks: results, score: totalScore, maxScore },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      recommendations: recommendations.slice(0, 5), // Top 5 recommendations
      metrics: {
        security_controls: totalScore,
        max_security_controls: maxScore
      }
    };
  }

  /**
   * Health Check: Docker Environment
   */
  private async checkDockerEnvironment(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Check Docker availability
      let dockerVersion = '';
      let dockerAvailable = false;
      
      try {
        dockerVersion = execSync('docker --version', { encoding: 'utf8', timeout: 5000 }).trim();
        dockerAvailable = true;
      } catch {}

      // Check Docker Compose
      let composeAvailable = false;
      let composeVersion = '';
      
      try {
        composeVersion = execSync('docker compose version', { encoding: 'utf8', timeout: 5000 }).trim();
        composeAvailable = true;
      } catch {
        try {
          composeVersion = execSync('docker-compose --version', { encoding: 'utf8', timeout: 5000 }).trim();
          composeAvailable = true;
        } catch {}
      }

      // Check Docker daemon
      let daemonRunning = false;
      if (dockerAvailable) {
        try {
          execSync('docker info', { stdio: 'pipe', timeout: 5000 });
          daemonRunning = true;
        } catch {}
      }

      let status: 'healthy' | 'degraded' | 'critical' | 'unknown' = 'unknown';
      let score = 0;
      const recommendations: string[] = [];

      if (!dockerAvailable) {
        status = 'degraded'; // Not critical since Docker is optional for many projects
        score = 30;
        recommendations.push('Install Docker for containerization support');
      } else {
        score = 70;
        if (!composeAvailable) {
          recommendations.push('Install Docker Compose for multi-container applications');
        } else {
          score = 85;
        }
        
        if (!daemonRunning) {
          status = 'degraded';
          score = Math.min(score, 50);
          recommendations.push('Start Docker daemon');
        } else {
          status = 'healthy';
          score = 100;
        }
      }

      return {
        name: 'Docker Environment',
        category: 'infrastructure',
        status,
        score,
        message: `Docker: ${dockerAvailable ? 'available' : 'not available'}, Compose: ${composeAvailable ? 'available' : 'not available'}, Daemon: ${daemonRunning ? 'running' : 'not running'}`,
        details: {
          docker: { available: dockerAvailable, version: dockerVersion },
          compose: { available: composeAvailable, version: composeVersion },
          daemon: { running: daemonRunning }
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations
      };
    } catch (error: any) {
      return {
        name: 'Docker Environment',
        category: 'infrastructure',
        status: 'unknown',
        score: 50,
        message: `Docker check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations: ['Check Docker installation']
      };
    }
  }

  /**
   * Health Check: Network Connectivity
   */
  private async checkNetworkConnectivity(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const endpoints = [
      { name: 'npm_registry', url: 'registry.npmjs.org', port: 443 },
      { name: 'github', url: 'github.com', port: 443 },
      { name: 'google_dns', url: '8.8.8.8', port: 53 },
      { name: 'docker_hub', url: 'registry.hub.docker.com', port: 443 }
    ];

    const results: Record<string, { reachable: boolean; latency?: number }> = {};
    let reachableCount = 0;
    let totalLatency = 0;

    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        
        if (process.platform === 'win32') {
          execSync(`ping -n 1 ${endpoint.url}`, { timeout: 5000, stdio: 'pipe' });
        } else {
          execSync(`ping -c 1 ${endpoint.url}`, { timeout: 5000, stdio: 'pipe' });
        }
        
        const latency = Date.now() - startTime;
        results[endpoint.name] = { reachable: true, latency };
        reachableCount++;
        totalLatency += latency;
      } catch {
        results[endpoint.name] = { reachable: false };
      }
    }

    const score = (reachableCount / endpoints.length) * 100;
    const avgLatency = reachableCount > 0 ? totalLatency / reachableCount : 0;
    
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const recommendations: string[] = [];

    if (reachableCount === 0) {
      status = 'critical';
      recommendations.push('No network connectivity detected - check internet connection');
    } else if (reachableCount < endpoints.length) {
      status = 'degraded';
      recommendations.push('Some network endpoints unreachable - check firewall/proxy settings');
    } else if (avgLatency > 1000) {
      status = 'degraded';
      recommendations.push('High network latency detected - check network quality');
    }

    return {
      name: 'Network Connectivity',
      category: 'infrastructure',
      status,
      score,
      message: `${reachableCount}/${endpoints.length} endpoints reachable, avg latency: ${avgLatency.toFixed(0)}ms`,
      details: { endpoints: results, reachableCount, avgLatency },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      recommendations,
      metrics: {
        reachable_endpoints: reachableCount,
        total_endpoints: endpoints.length,
        average_latency: avgLatency
      }
    };
  }

  /**
   * Health Check: Git Repository
   */
  private async checkGitRepository(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Check if in git repository
      let isGitRepo = false;
      let currentBranch = '';
      let hasRemote = false;
      let hasCommits = false;
      let workingTreeClean = false;

      try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
        isGitRepo = true;
      } catch {}

      if (isGitRepo) {
        try {
          currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        } catch {}

        try {
          execSync('git remote -v', { stdio: 'pipe' });
          hasRemote = true;
        } catch {}

        try {
          execSync('git log -1', { stdio: 'pipe' });
          hasCommits = true;
        } catch {}

        try {
          const status = execSync('git status --porcelain', { encoding: 'utf8' });
          workingTreeClean = status.trim() === '';
        } catch {}
      }

      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      let score = 100;
      const recommendations: string[] = [];

      if (!isGitRepo) {
        status = 'critical';
        score = 0;
        recommendations.push('Initialize git repository');
      } else {
        if (!hasRemote) {
          status = 'degraded';
          score = 70;
          recommendations.push('Add git remote origin');
        }
        
        if (!hasCommits) {
          status = 'degraded';
          score = Math.min(score, 60);
          recommendations.push('Make initial commit');
        }
        
        if (!workingTreeClean) {
          recommendations.push('Commit or stash uncommitted changes');
        }
      }

      return {
        name: 'Git Repository',
        category: 'configuration',
        status,
        score,
        message: `Git repo: ${isGitRepo ? 'yes' : 'no'}, Branch: ${currentBranch || 'none'}, Clean: ${workingTreeClean ? 'yes' : 'no'}`,
        details: {
          isGitRepo,
          currentBranch,
          hasRemote,
          hasCommits,
          workingTreeClean
        },
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations
      };
    } catch (error: any) {
      return {
        name: 'Git Repository',
        category: 'configuration',
        status: 'unknown',
        score: 50,
        message: `Git check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        recommendations: ['Check git installation']
      };
    }
  }

  /**
   * Health Check: Cache Systems
   */
  private async checkCacheSystems(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const caches = [
      { name: 'npm_cache', path: '~/.npm', checkCommand: 'npm cache ls' },
      { name: 'pnpm_store', path: '~/.pnpm-store', checkCommand: 'pnpm store path' },
      { name: 'nx_cache', path: 'node_modules/.cache/nx', checkCommand: null },
      { name: 'docker_cache', path: '/var/lib/docker', checkCommand: 'docker system df' }
    ];

    const results: Record<string, { available: boolean; size?: string; error?: string }> = {};
    let availableCount = 0;

    for (const cache of caches) {
      try {
        if (cache.checkCommand) {
          const output = execSync(cache.checkCommand, { encoding: 'utf8', timeout: 10000 });
          results[cache.name] = { available: true, size: 'available' };
          availableCount++;
        } else {
          // Check if path exists
          const exists = cache.path.startsWith('~') 
            ? fs.existsSync(path.join(os.homedir(), cache.path.slice(2)))
            : fs.existsSync(cache.path);
          
          results[cache.name] = { available: exists };
          if (exists) availableCount++;
        }
      } catch (error: any) {
        results[cache.name] = { available: false, error: error.message };
      }
    }

    const score = (availableCount / caches.length) * 100;
    const status: 'healthy' | 'degraded' | 'critical' = score > 50 ? 'healthy' : 'degraded';
    const recommendations: string[] = [];

    if (score < 75) {
      recommendations.push('Initialize missing cache systems for better performance');
    }

    return {
      name: 'Cache Systems',
      category: 'performance',
      status,
      score,
      message: `${availableCount}/${caches.length} cache systems available`,
      details: { caches: results, availableCount },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      recommendations
    };
  }

  /**
   * Health Check: System Resources
   */
  private async checkSystemResources(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    const metrics = await this.collectSystemMetrics();
    
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    let score = 100;
    const recommendations: string[] = [];

    // CPU check
    if (metrics.cpu.usage > 90) {
      status = 'critical';
      score = 20;
      recommendations.push('High CPU usage detected - check running processes');
    } else if (metrics.cpu.usage > 80) {
      status = 'degraded';
      score = Math.min(score, 60);
      recommendations.push('Elevated CPU usage detected');
    }

    // Memory check
    if (metrics.memory.percentage > 95) {
      status = 'critical';
      score = Math.min(score, 10);
      recommendations.push('Critical memory usage - free memory immediately');
    } else if (metrics.memory.percentage > 85) {
      status = 'degraded';
      score = Math.min(score, 50);
      recommendations.push('High memory usage detected');
    }

    // Disk check
    if (metrics.disk.percentage > 95) {
      status = 'critical';
      score = Math.min(score, 10);
      recommendations.push('Critical disk usage - free disk space immediately');
    } else if (metrics.disk.percentage > 90) {
      status = 'degraded';
      score = Math.min(score, 60);
      recommendations.push('High disk usage detected');
    }

    // CPU cores check
    if (metrics.cpu.cores < 2) {
      score = Math.min(score, 70);
      recommendations.push('Multiple CPU cores recommended for better performance');
    }

    return {
      name: 'System Resources',
      category: 'performance',
      status,
      score,
      message: `CPU: ${metrics.cpu.usage.toFixed(1)}%, Memory: ${metrics.memory.percentage.toFixed(1)}%, Disk: ${metrics.disk.percentage.toFixed(1)}%`,
      details: {
        cpu: metrics.cpu,
        memory: metrics.memory,
        disk: metrics.disk
      },
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      recommendations,
      metrics: {
        cpu_usage: metrics.cpu.usage,
        memory_usage: metrics.memory.percentage,
        disk_usage: metrics.disk.percentage,
        cpu_cores: metrics.cpu.cores
      }
    };
  }

  /**
   * Run all health checks
   */
  public async runAllHealthChecks(): Promise<HealthCheckResult[]> {
    console.log('🔍 Running comprehensive health checks...\n');

    const results: HealthCheckResult[] = [];
    const healthCheckNames = Array.from(this.healthChecks.keys());

    for (const checkName of healthCheckNames) {
      try {
        console.log(`⏳ Running ${checkName}...`);
        const healthCheck = this.healthChecks.get(checkName)!;
        const result = await healthCheck();
        results.push(result);

        const statusIcon = this.getStatusIcon(result.status);
        console.log(`${statusIcon} ${result.name}: ${result.message} (${result.score}/100)`);
        
        if (result.recommendations && result.recommendations.length > 0) {
          console.log(`   💡 ${result.recommendations[0]}`);
        }
      } catch (error: any) {
        console.log(`❌ ${checkName}: Failed - ${error.message}`);
        results.push({
          name: checkName,
          category: 'infrastructure',
          status: 'critical',
          score: 0,
          message: `Health check failed: ${error.message}`,
          timestamp: new Date().toISOString(),
          duration: 0,
          recommendations: ['Check health check implementation']
        });
      }
    }

    // Store health check results
    this.healthHistory.push(...results);
    
    return results;
  }

  /**
   * Get status icon for display
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'critical': return '❌';
      default: return '❓';
    }
  }

  /**
   * Generate comprehensive system report
   */
  public async generateReport(): Promise<void> {
    console.log('\n📊 Generating comprehensive monitoring report...\n');

    // Run health checks
    const healthResults = await this.runAllHealthChecks();
    
    // Collect current metrics
    const currentMetrics = await this.collectSystemMetrics();

    // Calculate overall scores
    const overallHealth = this.calculateOverallHealth(healthResults);
    const recommendations = this.generateRecommendations(healthResults);

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      summary: {
        overallHealth,
        totalChecks: healthResults.length,
        healthyChecks: healthResults.filter(r => r.status === 'healthy').length,
        degradedChecks: healthResults.filter(r => r.status === 'degraded').length,
        criticalChecks: healthResults.filter(r => r.status === 'critical').length
      },
      systemMetrics: currentMetrics,
      healthChecks: healthResults,
      recommendations,
      configuration: this.config,
      alerts: this.generateAlerts(healthResults, currentMetrics)
    };

    // Save reports in multiple formats
    await this.saveReports(report);

    // Display summary
    this.displaySummary(report);
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallHealth(results: HealthCheckResult[]): { score: number; status: string; grade: string } {
    if (results.length === 0) {
      return { score: 0, status: 'unknown', grade: 'F' };
    }

    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const avgScore = totalScore / results.length;

    let status = 'healthy';
    if (avgScore < 30) status = 'critical';
    else if (avgScore < 70) status = 'degraded';

    let grade = 'A';
    if (avgScore < 60) grade = 'F';
    else if (avgScore < 70) grade = 'D';
    else if (avgScore < 80) grade = 'C';
    else if (avgScore < 90) grade = 'B';

    return { score: Math.round(avgScore), status, grade };
  }

  /**
   * Generate prioritized recommendations
   */
  private generateRecommendations(results: HealthCheckResult[]): Array<{ priority: 'high' | 'medium' | 'low'; category: string; recommendation: string; impact: string }> {
    const recommendations: Array<{ priority: 'high' | 'medium' | 'low'; category: string; recommendation: string; impact: string }> = [];

    results.forEach(result => {
      if (result.recommendations) {
        result.recommendations.forEach(rec => {
          let priority: 'high' | 'medium' | 'low' = 'medium';
          let impact = 'Moderate improvement expected';

          if (result.status === 'critical') {
            priority = 'high';
            impact = 'Critical for system stability';
          } else if (result.status === 'degraded' && result.score < 50) {
            priority = 'high';
            impact = 'Significant improvement expected';
          } else if (result.status === 'degraded') {
            priority = 'medium';
            impact = 'Moderate improvement expected';
          } else {
            priority = 'low';
            impact = 'Minor improvement expected';
          }

          recommendations.push({
            priority,
            category: result.category,
            recommendation: rec,
            impact
          });
        });
      }
    });

    // Sort by priority and limit results
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return recommendations
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, this.config.recommendations.maxRecommendations);
  }

  /**
   * Generate alerts based on thresholds
   */
  private generateAlerts(healthResults: HealthCheckResult[], metrics: SystemMetrics): Array<{ level: 'warning' | 'critical'; message: string; threshold: number; actual: number }> {
    const alerts: Array<{ level: 'warning' | 'critical'; message: string; threshold: number; actual: number }> = [];

    // System resource alerts
    const cpuThreshold = this.alertThresholds.get('cpu_usage') || 80;
    if (metrics.cpu.usage > cpuThreshold) {
      alerts.push({
        level: metrics.cpu.usage > 90 ? 'critical' : 'warning',
        message: 'High CPU usage detected',
        threshold: cpuThreshold,
        actual: metrics.cpu.usage
      });
    }

    const memoryThreshold = this.alertThresholds.get('memory_usage') || 85;
    if (metrics.memory.percentage > memoryThreshold) {
      alerts.push({
        level: metrics.memory.percentage > 95 ? 'critical' : 'warning',
        message: 'High memory usage detected',
        threshold: memoryThreshold,
        actual: metrics.memory.percentage
      });
    }

    const diskThreshold = this.alertThresholds.get('disk_usage') || 90;
    if (metrics.disk.percentage > diskThreshold) {
      alerts.push({
        level: metrics.disk.percentage > 95 ? 'critical' : 'warning',
        message: 'High disk usage detected',
        threshold: diskThreshold,
        actual: metrics.disk.percentage
      });
    }

    // Health check alerts
    const criticalChecks = healthResults.filter(r => r.status === 'critical');
    if (criticalChecks.length > 0) {
      alerts.push({
        level: 'critical',
        message: `${criticalChecks.length} critical health check(s) failed`,
        threshold: 0,
        actual: criticalChecks.length
      });
    }

    return alerts;
  }

  /**
   * Save reports in multiple formats
   */
  private async saveReports(report: any): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // JSON format (always generated)
    const jsonPath = path.join(this.reportsDir, `ci-monitoring-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Generate additional formats if configured
    if (this.config.metrics.exportFormats.includes('csv')) {
      await this.generateCSVReport(report, timestamp);
    }

    if (this.config.metrics.exportFormats.includes('prometheus')) {
      await this.generatePrometheusMetrics(report, timestamp);
    }

    console.log(`📄 Reports saved to ${this.reportsDir}`);
  }

  /**
   * Generate CSV report
   */
  private async generateCSVReport(report: any, timestamp: string): Promise<void> {
    const csvPath = path.join(this.metricsDir, 'exports', `health-checks-${timestamp}.csv`);
    
    const csvLines = [
      'name,category,status,score,message,duration,timestamp'
    ];

    report.healthChecks.forEach((check: HealthCheckResult) => {
      csvLines.push(`"${check.name}","${check.category}","${check.status}",${check.score},"${check.message}",${check.duration},"${check.timestamp}"`);
    });

    fs.writeFileSync(csvPath, csvLines.join('\n'));
  }

  /**
   * Generate Prometheus metrics
   */
  private async generatePrometheusMetrics(report: any, timestamp: string): Promise<void> {
    const prometheusPath = path.join(this.metricsDir, 'exports', `metrics-${timestamp}.prom`);
    
    const metrics: string[] = [
      '# HELP ci_health_check_score Health check scores',
      '# TYPE ci_health_check_score gauge'
    ];

    report.healthChecks.forEach((check: HealthCheckResult) => {
      metrics.push(`ci_health_check_score{name="${check.name}",category="${check.category}",status="${check.status}"} ${check.score}`);
    });

    metrics.push('');
    metrics.push('# HELP ci_system_cpu_usage CPU usage percentage');
    metrics.push('# TYPE ci_system_cpu_usage gauge');
    metrics.push(`ci_system_cpu_usage ${report.systemMetrics.cpu.usage}`);

    metrics.push('');
    metrics.push('# HELP ci_system_memory_usage Memory usage percentage');
    metrics.push('# TYPE ci_system_memory_usage gauge');
    metrics.push(`ci_system_memory_usage ${report.systemMetrics.memory.percentage}`);

    fs.writeFileSync(prometheusPath, metrics.join('\n'));
  }

  /**
   * Display summary in console
   */
  private displaySummary(report: any): void {
    console.log('\n🎯 CI/CD Monitoring System Report');
    console.log('==================================');
    console.log(`📊 Overall Health: ${report.summary.overallHealth.score}/100 (${report.summary.overallHealth.grade})`);
    console.log(`✅ Healthy: ${report.summary.healthyChecks}/${report.summary.totalChecks}`);
    console.log(`⚠️  Degraded: ${report.summary.degradedChecks}`);
    console.log(`❌ Critical: ${report.summary.criticalChecks}`);

    console.log('\n📈 System Metrics:');
    console.log(`  CPU: ${report.systemMetrics.cpu.usage.toFixed(1)}% (${report.systemMetrics.cpu.cores} cores)`);
    console.log(`  Memory: ${report.systemMetrics.memory.percentage.toFixed(1)}% (${(report.systemMetrics.memory.total / 1024 / 1024 / 1024).toFixed(1)}GB total)`);
    console.log(`  Disk: ${report.systemMetrics.disk.percentage.toFixed(1)}%`);
    console.log(`  Network: ${report.systemMetrics.network.connectivity ? 'Connected' : 'Disconnected'}`);

    if (report.alerts.length > 0) {
      console.log('\n🚨 Active Alerts:');
      report.alerts.slice(0, 3).forEach((alert: any) => {
        const icon = alert.level === 'critical' ? '🔴' : '🟡';
        console.log(`  ${icon} ${alert.message}`);
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      report.recommendations.slice(0, 3).forEach((rec: any, index: number) => {
        const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`  ${index + 1}. ${icon} ${rec.recommendation}`);
      });
    }

    console.log(`\n📁 Full report: ${this.reportsDir}`);
    console.log(`⏱️  Total duration: ${report.duration}ms`);
  }

  /**
   * Main execution function
   */
  public async run(): Promise<void> {
    console.log('🚀 Enterprise CI/CD Monitoring System v2.0');
    console.log('==========================================\n');

    try {
      await this.generateReport();
      
      console.log('\n✅ Monitoring system completed successfully!');
      process.exit(0);
    } catch (error: any) {
      console.error('\n❌ Monitoring system failed:', error.message);
      process.exit(1);
    }
  }
}

// Execute if run directly (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new CIMonitoringSystem();
  monitor.run().catch(error => {
    console.error('Unhandled error in CI Monitoring System:', error);
    process.exit(1);
  });
}

export { CIMonitoringSystem };