// Enterprise Performance Benchmark Script
// Phase 2 - Comprehensive performance testing and monitoring

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

class EnterprisePerformanceBenchmark {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      buildPerformance: {},
      bundleSize: {},
      runtimePerformance: {},
      compliance: {
        passed: [],
        failed: [],
        warnings: [],
      },
    };

    this.thresholds = {
      buildTime: {
        development: 60000, // 60 seconds
        production: 600000, // 10 minutes
      },
      bundleSize: {
        'api-gateway': 15 * 1024 * 1024, // 15MB
        'web-dashboard': 10 * 1024 * 1024, // 10MB
        libs: 5 * 1024 * 1024, // 5MB
      },
      runtime: {
        apiResponseTime: 500, // 500ms P95
        memoryUsage: 512 * 1024 * 1024, // 512MB
        databaseQueryTime: 100, // 100ms
      },
    };
  }

  async runBenchmarks() {
    console.log('🚀 Enterprise Performance Benchmark Suite');
    console.log('=========================================');

    try {
      await this.benchmarkBuildPerformance();
      await this.analyzeBundleSize();
      await this.benchmarkRuntimePerformance();
      await this.generateReport();

      console.log('\n✅ Performance benchmark completed successfully');
      return this.results;
    } catch (_error) {
      console.error('❌ Performance benchmark failed:', _error.message);
      throw _error;
    }
  }

  async benchmarkBuildPerformance() {
    console.log('\n📊 Build Performance Analysis');
    console.log('-----------------------------');

    // Clean build test
    const cleanBuildTime = await this.measureBuildTime('clean');
    this.results.buildPerformance.cleanBuild = cleanBuildTime;

    // Incremental build test
    const incrementalBuildTime = await this.measureBuildTime('incremental');
    this.results.buildPerformance.incrementalBuild = incrementalBuildTime;

    // Type checking performance
    const typeCheckTime = await this.measureTypeCheck();
    this.results.buildPerformance.typeCheck = typeCheckTime;

    this.validateBuildPerformance();
  }

  async measureBuildTime(buildType) {
    console.log(`   Measuring ${buildType} build time...`);

    const startTime = Date.now();

    try {
      if (buildType === 'clean') {
        // Clean build: remove dist and node_modules/.cache, then build
        await this.runCommand('rm', ['-rf', 'dist', 'node_modules/.cache']);
        await this.runCommand('npm', ['run', 'build']);
      } else {
        // Incremental build: just build
        await this.runCommand('npm', ['run', 'build']);
      }

      const buildTime = Date.now() - startTime;
      console.log(`   ✅ ${buildType} build completed in ${buildTime}ms`);

      return {
        duration: buildTime,
        passed: buildTime < this.thresholds.buildTime.development,
        threshold: this.thresholds.buildTime.development,
      };
    } catch (_error) {
      console.log(`   ❌ ${buildType} build failed: ${_error.message}`);
      return {
        duration: -1,
        passed: false,
        error: _error.message,
      };
    }
  }

  async measureTypeCheck() {
    console.log('   Measuring TypeScript type checking...');

    const startTime = Date.now();

    try {
      await this.runCommand('npm', ['run', 'type-check']);
      const typeCheckTime = Date.now() - startTime;

      console.log(`   ✅ Type checking completed in ${typeCheckTime}ms`);

      return {
        duration: typeCheckTime,
        passed: typeCheckTime < 30000, // 30 seconds threshold
        threshold: 30000,
      };
    } catch (_error) {
      console.log(`   ❌ Type checking failed: ${_error.message}`);
      return {
        duration: -1,
        passed: false,
        error: _error.message,
      };
    }
  }

  async analyzeBundleSize() {
    console.log('\n📦 Bundle Size Analysis');
    console.log('-----------------------');

    const apps = ['api-gateway', 'web-dashboard'];

    for (const app of apps) {
      const bundleInfo = await this.measureBundleSize(app);
      this.results.bundleSize[app] = bundleInfo;
    }

    // Analyze libs bundle size
    const libsBundleInfo = await this.measureLibsBundleSize();
    this.results.bundleSize.libs = libsBundleInfo;

    this.validateBundleSize();
  }

  async measureBundleSize(app) {
    console.log(`   Analyzing ${app} bundle size...`);

    try {
      const distPath = path.join(process.cwd(), 'dist', app);

      if (!fs.existsSync(distPath)) {
        console.log(`   ⚠️  ${app} dist directory not found, skipping...`);
        return { size: 0, passed: false, reason: 'dist_not_found' };
      }

      const size = await this.calculateDirectorySize(distPath);
      const threshold = this.thresholds.bundleSize[app] || 20 * 1024 * 1024; // 20MB default
      const passed = size <= threshold;

      console.log(
        `   ${passed ? '✅' : '❌'} ${app}: ${this.formatBytes(size)} (threshold: ${this.formatBytes(threshold)})`
      );

      return {
        size,
        sizeFormatted: this.formatBytes(size),
        threshold,
        thresholdFormatted: this.formatBytes(threshold),
        passed,
      };
    } catch (_error) {
      console.log(`   ❌ Failed to analyze ${app} bundle: ${_error.message}`);
      return { size: -1, passed: false, error: _error.message };
    }
  }

  async measureLibsBundleSize() {
    console.log('   Analyzing libs bundle size...');

    try {
      const libsPath = path.join(process.cwd(), 'libs');
      const size = await this.calculateDirectorySize(libsPath, [
        '.ts',
        '.js',
        '.json',
      ]);
      const threshold = this.thresholds.bundleSize.libs;
      const passed = size <= threshold;

      console.log(
        `   ${passed ? '✅' : '❌'} libs: ${this.formatBytes(size)} (threshold: ${this.formatBytes(threshold)})`
      );

      return {
        size,
        sizeFormatted: this.formatBytes(size),
        threshold,
        thresholdFormatted: this.formatBytes(threshold),
        passed,
      };
    } catch (_error) {
      console.log(`   ❌ Failed to analyze libs bundle: ${_error.message}`);
      return { size: -1, passed: false, error: _error.message };
    }
  }

  async benchmarkRuntimePerformance() {
    console.log('\n⚡ Runtime Performance Analysis');
    console.log('-------------------------------');

    // Memory usage benchmark
    const memoryUsage = await this.measureMemoryUsage();
    this.results.runtimePerformance.memory = memoryUsage;

    // API response time simulation
    const apiPerformance = await this.simulateApiPerformance();
    this.results.runtimePerformance.api = apiPerformance;

    this.validateRuntimePerformance();
  }

  async measureMemoryUsage() {
    console.log('   Measuring memory usage...');

    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;
    const rss = memoryUsage.rss;

    const heapPassed = heapUsed <= this.thresholds.runtime.memoryUsage;
    const rssPassed = rss <= this.thresholds.runtime.memoryUsage * 2; // RSS can be 2x heap

    console.log(
      `   ${heapPassed ? '✅' : '❌'} Heap usage: ${this.formatBytes(heapUsed)}`
    );
    console.log(
      `   ${rssPassed ? '✅' : '❌'} RSS usage: ${this.formatBytes(rss)}`
    );

    return {
      heap: {
        used: heapUsed,
        usedFormatted: this.formatBytes(heapUsed),
        threshold: this.thresholds.runtime.memoryUsage,
        passed: heapPassed,
      },
      rss: {
        used: rss,
        usedFormatted: this.formatBytes(rss),
        threshold: this.thresholds.runtime.memoryUsage * 2,
        passed: rssPassed,
      },
    };
  }

  async simulateApiPerformance() {
    console.log('   Simulating API performance...');

    // Simulate different API response scenarios
    const scenarios = [
      { name: 'Simple GET', duration: 50 },
      { name: 'Database Query', duration: 150 },
      { name: 'Complex Calculation', duration: 300 },
      { name: 'File Upload', duration: 800 },
    ];

    const results = {};

    for (const scenario of scenarios) {
      const passed =
        scenario.duration <= this.thresholds.runtime.apiResponseTime;
      console.log(
        `   ${passed ? '✅' : '❌'} ${scenario.name}: ${scenario.duration}ms`
      );

      results[scenario.name.toLowerCase().replace(/\s+/g, '_')] = {
        duration: scenario.duration,
        passed,
        threshold: this.thresholds.runtime.apiResponseTime,
      };
    }

    return results;
  }

  validateBuildPerformance() {
    const { cleanBuild, incrementalBuild, typeCheck } =
      this.results.buildPerformance;

    if (cleanBuild.passed) {
      this.results.compliance.passed.push('Clean build time within threshold');
    } else {
      this.results.compliance.failed.push(
        `Clean build time exceeded: ${cleanBuild.duration}ms > ${cleanBuild.threshold}ms`
      );
    }

    if (incrementalBuild.passed) {
      this.results.compliance.passed.push(
        'Incremental build time within threshold'
      );
    } else {
      this.results.compliance.failed.push(
        `Incremental build time exceeded: ${incrementalBuild.duration}ms > ${incrementalBuild.threshold}ms`
      );
    }

    if (typeCheck.passed) {
      this.results.compliance.passed.push(
        'TypeScript type checking time within threshold'
      );
    } else {
      this.results.compliance.failed.push(
        `Type checking time exceeded: ${typeCheck.duration}ms > ${typeCheck.threshold}ms`
      );
    }
  }

  validateBundleSize() {
    Object.entries(this.results.bundleSize).forEach(([name, bundle]) => {
      if (bundle.passed) {
        this.results.compliance.passed.push(
          `${name} bundle size within threshold`
        );
      } else if (bundle.size > 0) {
        this.results.compliance.failed.push(
          `${name} bundle size exceeded: ${bundle.sizeFormatted} > ${bundle.thresholdFormatted}`
        );
      } else {
        this.results.compliance.warnings.push(
          `${name} bundle analysis failed or not found`
        );
      }
    });
  }

  validateRuntimePerformance() {
    const { memory, api } = this.results.runtimePerformance;

    if (memory.heap.passed) {
      this.results.compliance.passed.push('Heap memory usage within threshold');
    } else {
      this.results.compliance.failed.push(
        `Heap memory usage exceeded: ${memory.heap.usedFormatted} > ${this.formatBytes(memory.heap.threshold)}`
      );
    }

    if (memory.rss.passed) {
      this.results.compliance.passed.push('RSS memory usage within threshold');
    } else {
      this.results.compliance.failed.push(
        `RSS memory usage exceeded: ${memory.rss.usedFormatted} > ${this.formatBytes(memory.rss.threshold)}`
      );
    }

    Object.entries(api).forEach(([scenario, result]) => {
      if (result.passed) {
        this.results.compliance.passed.push(
          `API ${scenario} response time within threshold`
        );
      } else {
        this.results.compliance.failed.push(
          `API ${scenario} response time exceeded: ${result.duration}ms > ${result.threshold}ms`
        );
      }
    });
  }

  async generateReport() {
    console.log('\n📋 Performance Report Generation');
    console.log('---------------------------------');

    const reportDir = path.join(process.cwd(), 'reports', 'performance');

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `performance-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));

    console.log(`   📄 Report saved to: ${reportPath}`);

    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 Performance Summary');
    console.log('======================');

    console.log(`✅ Passed: ${this.results.compliance.passed.length}`);
    console.log(`❌ Failed: ${this.results.compliance.failed.length}`);
    console.log(`⚠️  Warnings: ${this.results.compliance.warnings.length}`);

    if (this.results.compliance.failed.length > 0) {
      console.log('\n❌ Failed Checks:');
      this.results.compliance.failed.forEach((item) => {
        console.log(`   • ${item}`);
      });
    }

    if (this.results.compliance.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.results.compliance.warnings.forEach((item) => {
        console.log(`   • ${item}`);
      });
    }

    const totalChecks =
      this.results.compliance.passed.length +
      this.results.compliance.failed.length;
    const successRate =
      totalChecks > 0
        ? (this.results.compliance.passed.length / totalChecks) * 100
        : 0;

    console.log(`\n🎯 Overall Performance Score: ${successRate.toFixed(1)}%`);

    if (successRate >= 90) {
      console.log('🎉 Excellent! Meets enterprise performance standards');
    } else if (successRate >= 75) {
      console.log('⚠️  Good, but improvements needed for optimal performance');
    } else {
      console.log(
        '❌ Below enterprise standards - performance optimization required'
      );
    }
  }

  // Utility methods
  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  async calculateDirectorySize(dirPath, extensions = null) {
    let totalSize = 0;

    const calculateSize = (filePath) => {
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        const files = fs.readdirSync(filePath);
        files.forEach((file) => {
          calculateSize(path.join(filePath, file));
        });
      } else {
        if (!extensions || extensions.some((ext) => filePath.endsWith(ext))) {
          totalSize += stats.size;
        }
      }
    };

    if (fs.existsSync(dirPath)) {
      calculateSize(dirPath);
    }

    return totalSize;
  }

  formatBytes(bytes) {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

// Main execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const benchmark = new EnterprisePerformanceBenchmark();
  benchmark
    .runBenchmarks()
    .then(() => {
      console.log('\n🎉 Performance benchmark completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance benchmark failed:', error);
      process.exit(1);
    });
}

export default EnterprisePerformanceBenchmark;
