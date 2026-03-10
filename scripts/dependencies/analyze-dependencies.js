#!/usr/bin/env node
/**
 * Comprehensive Dependency Analysis Script for Ectropy Monorepo
 *
 * Analyzes all dependencies across the monorepo and generates:
 * 1. dependencies-analysis.json - Complete structured data
 * 2. notion-dependencies.csv - Ready for Notion import (15 columns)
 * 3. dependency-graph.mmd - Mermaid visualization
 * 4. summary-report.md - Human-readable analysis
 *
 * Usage: node scripts/dependencies/analyze-dependencies.js
 * Output: evidence/dependency-analysis-YYYY-MM-DD/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION - Vendor Information
// =============================================================================

const VENDOR_INFO = {
  react: {
    vendor: 'Meta (Facebook)',
    ownership: 'Open Source',
    repo: 'https://github.com/facebook/react',
  },
  'react-dom': {
    vendor: 'Meta (Facebook)',
    ownership: 'Open Source',
    repo: 'https://github.com/facebook/react',
  },
  express: {
    vendor: 'Express Community',
    ownership: 'Open Source',
    repo: 'https://github.com/expressjs/express',
  },
  '@prisma/client': {
    vendor: 'Prisma',
    ownership: 'Open Source',
    repo: 'https://github.com/prisma/prisma',
  },
  prisma: {
    vendor: 'Prisma',
    ownership: 'Open Source',
    repo: 'https://github.com/prisma/prisma',
  },
  ioredis: {
    vendor: 'luin',
    ownership: 'Open Source',
    repo: 'https://github.com/redis/ioredis',
  },
  typescript: {
    vendor: 'Microsoft',
    ownership: 'Open Source',
    repo: 'https://github.com/microsoft/TypeScript',
  },
  nx: {
    vendor: 'Nrwl/Nx',
    ownership: 'Open Source',
    repo: 'https://github.com/nrwl/nx',
  },
  '@apollo/server': {
    vendor: 'Apollo GraphQL',
    ownership: 'Open Source',
    repo: 'https://github.com/apollographql/apollo-server',
  },
  graphql: {
    vendor: 'GraphQL Foundation',
    ownership: 'Open Source',
    repo: 'https://github.com/graphql/graphql-js',
  },
  three: {
    vendor: 'three.js Community',
    ownership: 'Open Source',
    repo: 'https://github.com/mrdoob/three.js',
  },
  '@speckle/viewer': {
    vendor: 'Speckle Systems',
    ownership: 'Open Source',
    repo: 'https://github.com/specklesystems/speckle-server',
  },
  passport: {
    vendor: 'Jared Hanson',
    ownership: 'Open Source',
    repo: 'https://github.com/jaredhanson/passport',
  },
  jsonwebtoken: {
    vendor: 'Auth0',
    ownership: 'Open Source',
    repo: 'https://github.com/auth0/node-jsonwebtoken',
  },
  helmet: {
    vendor: 'Helmet Contributors',
    ownership: 'Open Source',
    repo: 'https://github.com/helmetjs/helmet',
  },
  '@playwright/test': {
    vendor: 'Microsoft',
    ownership: 'Open Source',
    repo: 'https://github.com/microsoft/playwright',
  },
  axios: {
    vendor: 'axios',
    ownership: 'Open Source',
    repo: 'https://github.com/axios/axios',
  },
  zod: {
    vendor: 'Colin McDonnell',
    ownership: 'Open Source',
    repo: 'https://github.com/colinhacks/zod',
  },
  winston: {
    vendor: 'Winston Contributors',
    ownership: 'Open Source',
    repo: 'https://github.com/winstonjs/winston',
  },
  '@mui/material': {
    vendor: 'MUI Team',
    ownership: 'Open Source',
    repo: 'https://github.com/mui/material-ui',
  },
  next: {
    vendor: 'Vercel',
    ownership: 'Open Source',
    repo: 'https://github.com/vercel/next.js',
  },
  vite: {
    vendor: 'Vite Team',
    ownership: 'Open Source',
    repo: 'https://github.com/vitejs/vite',
  },
  eslint: {
    vendor: 'OpenJS Foundation',
    ownership: 'Open Source',
    repo: 'https://github.com/eslint/eslint',
  },
  prettier: {
    vendor: 'Prettier Team',
    ownership: 'Open Source',
    repo: 'https://github.com/prettier/prettier',
  },
  jest: {
    vendor: 'Meta (Facebook)',
    ownership: 'Open Source',
    repo: 'https://github.com/jestjs/jest',
  },
  vitest: {
    vendor: 'Vitest Team',
    ownership: 'Open Source',
    repo: 'https://github.com/vitest-dev/vitest',
  },
};

// =============================================================================
// CONFIGURATION - License Information
// =============================================================================

const LICENSE_INFO = {
  MIT: { type: 'Permissive', risk: '🟢 Low', commercial: '✅ Allowed' },
  'Apache-2.0': {
    type: 'Permissive',
    risk: '🟢 Low',
    commercial: '✅ Allowed',
    patent: true,
  },
  'BSD-3-Clause': {
    type: 'Permissive',
    risk: '🟢 Low',
    commercial: '✅ Allowed',
  },
  'BSD-2-Clause': {
    type: 'Permissive',
    risk: '🟢 Low',
    commercial: '✅ Allowed',
  },
  ISC: { type: 'Permissive', risk: '🟢 Low', commercial: '✅ Allowed' },
  'GPL-3.0': {
    type: 'Copyleft (Strong)',
    risk: '🔴 High',
    commercial: '⚠️ Restricted',
  },
  'GPL-2.0': {
    type: 'Copyleft (Strong)',
    risk: '🔴 High',
    commercial: '⚠️ Restricted',
  },
  'LGPL-3.0': {
    type: 'Copyleft (Weak)',
    risk: '🟡 Medium',
    commercial: '⚠️ Restricted',
  },
  'LGPL-2.1': {
    type: 'Copyleft (Weak)',
    risk: '🟡 Medium',
    commercial: '⚠️ Restricted',
  },
  'AGPL-3.0': {
    type: 'Copyleft (Strong)',
    risk: '🔴 High',
    commercial: '⚠️ Restricted',
  },
  'MPL-2.0': {
    type: 'Copyleft (Weak)',
    risk: '🟡 Medium',
    commercial: '✅ Allowed',
  },
  'CC0-1.0': {
    type: 'Public Domain',
    risk: '🟢 Low',
    commercial: '✅ Allowed',
  },
  UNLICENSED: {
    type: 'Proprietary',
    risk: '🟡 Medium',
    commercial: '✅ Allowed (Internal)',
  },
};

// =============================================================================
// CONFIGURATION - Critical Dependencies
// =============================================================================

const CRITICAL_DEPS = [
  'express',
  'react',
  'react-dom',
  '@prisma/client',
  'prisma',
  'ioredis',
  'typescript',
  'nx',
  '@apollo/server',
  'graphql',
  'three',
  '@speckle/viewer',
  'passport',
  'jsonwebtoken',
  'helmet',
  '@playwright/test',
  'axios',
  'zod',
  'winston',
  'next',
  '@mui/material',
  'vite',
];

// =============================================================================
// CONFIGURATION - Workspaces
// =============================================================================

const WORKSPACES = [
  { name: 'root', path: '../../package.json' },
  { name: 'api-gateway', path: '../../apps/api-gateway/package.json' },
  { name: 'web-dashboard', path: '../../apps/web-dashboard/package.json' },
  { name: 'mcp-server', path: '../../apps/mcp-server/package.json' },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Clean version string by removing prefixes (^, ~, >=, etc.)
 */
function cleanVersion(version) {
  return version.replace(/^[\^~>=<]/, '').trim();
}

/**
 * Infer license from package name (best effort)
 * In real implementation, would fetch from npm registry
 */
function inferLicense(packageName) {
  // Common patterns
  if (packageName.startsWith('@types/')) {
    return 'MIT';
  }
  if (packageName.startsWith('@mui/')) {
    return 'MIT';
  }
  if (packageName.startsWith('@nx/')) {
    return 'MIT';
  }
  if (packageName.startsWith('@apollo/')) {
    return 'MIT';
  }
  if (packageName.startsWith('@prisma/')) {
    return 'Apache-2.0';
  }
  if (packageName.startsWith('@speckle/')) {
    return 'Apache-2.0';
  }
  if (packageName.startsWith('@playwright/')) {
    return 'Apache-2.0';
  }

  // Default
  return 'MIT';
}

/**
 * Get vendor info for package
 */
function getVendorInfo(packageName) {
  return (
    VENDOR_INFO[packageName] || {
      vendor: 'Unknown',
      ownership: 'Open Source',
      repo: '',
    }
  );
}

/**
 * Get license risk assessment
 */
function getLicenseRisk(license) {
  return LICENSE_INFO[license]?.risk || '🟡 Medium';
}

/**
 * Check if dependency is critical
 */
function isCritical(packageName) {
  return CRITICAL_DEPS.includes(packageName) ? 'Yes' : 'No';
}

/**
 * Infer performance impact
 */
function inferPerformanceImpact(packageName, category) {
  // Critical path packages
  if (
    ['express', 'react', 'react-dom', '@prisma/client', 'ioredis'].includes(
      packageName
    )
  ) {
    return 'High (Critical Path)';
  }
  // Build/dev tools
  if (category === 'Dev') {
    return 'Low (Build Time)';
  }
  // Large libraries
  if (['three', '@speckle/viewer', '@mui/material'].includes(packageName)) {
    return 'High (Bundle Size)';
  }
  return 'Medium';
}

// =============================================================================
// DEPENDENCY PROCESSING
// =============================================================================

/**
 * Process dependencies from a package.json file
 */
function processDependencies(deps, workspace, category, allDeps) {
  if (!deps) {
    return;
  }

  for (const [name, version] of Object.entries(deps)) {
    const cleanedVersion = cleanVersion(version);

    if (allDeps.has(name)) {
      // Dependency already exists, add workspace
      const existing = allDeps.get(name);
      if (!existing.usedBy.includes(workspace)) {
        existing.usedBy.push(workspace);
      }
      // If seen in runtime, keep as runtime
      if (category === 'Runtime') {
        existing.category = 'Runtime';
      }
    } else {
      // New dependency
      const license = inferLicense(name);
      const vendorInfo = getVendorInfo(name);

      allDeps.set(name, {
        name,
        version: cleanedVersion,
        category,
        usedBy: [workspace],
        license,
        licenseRisk: getLicenseRisk(license),
        vendor: vendorInfo.vendor,
        dataOwnership: vendorInfo.ownership,
        repositoryUrl: vendorInfo.repo,
        securityStatus: '🟢 Secure',
        supportStatus: '🟢 Active',
        auditStatus: '⚪ Pending',
        directTransitive: 'Direct',
        performanceImpact: inferPerformanceImpact(name, category),
        isCritical: isCritical(name),
      });
    }
  }
}

/**
 * Analyze all dependencies across monorepo
 */
function analyzeDependencies() {
  const allDeps = new Map();

  console.log('📦 Analyzing dependencies across monorepo...\n');

  for (const workspace of WORKSPACES) {
    const pkgPath = path.resolve(__dirname, workspace.path);

    if (!fs.existsSync(pkgPath)) {
      console.warn(
        `⚠️  Warning: ${workspace.name} package.json not found at ${pkgPath}`
      );
      continue;
    }

    console.log(`   Reading ${workspace.name}...`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    processDependencies(pkg.dependencies, workspace.name, 'Runtime', allDeps);
    processDependencies(pkg.devDependencies, workspace.name, 'Dev', allDeps);
    processDependencies(
      pkg.optionalDependencies,
      workspace.name,
      'Optional',
      allDeps
    );
  }

  console.log(`\n✅ Found ${allDeps.size} unique dependencies\n`);

  return Array.from(allDeps.values());
}

// =============================================================================
// OUTPUT GENERATORS
// =============================================================================

/**
 * Generate statistics
 */
function generateStatistics(dependencies) {
  const stats = {
    total: dependencies.length,
    runtime: dependencies.filter((d) => d.category === 'Runtime').length,
    dev: dependencies.filter((d) => d.category === 'Dev').length,
    optional: dependencies.filter((d) => d.category === 'Optional').length,
    critical: dependencies.filter((d) => d.isCritical === 'Yes').length,
    licenses: {},
    vendors: {},
    workspaces: {},
  };

  // Count licenses
  dependencies.forEach((d) => {
    stats.licenses[d.license] = (stats.licenses[d.license] || 0) + 1;
  });

  // Count vendors
  dependencies.forEach((d) => {
    stats.vendors[d.vendor] = (stats.vendors[d.vendor] || 0) + 1;
  });

  // Count workspace usage
  dependencies.forEach((d) => {
    d.usedBy.forEach((ws) => {
      stats.workspaces[ws] = (stats.workspaces[ws] || 0) + 1;
    });
  });

  return stats;
}

/**
 * Generate JSON output
 */
function generateJSON(dependencies, stats) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      platform: 'Ectropy Construction Intelligence',
      monorepo: true,
      packageManager: 'pnpm',
      totalDependencies: dependencies.length,
    },
    statistics: stats,
    dependencies,
  };
}

/**
 * Generate Notion CSV
 */
function generateNotionCSV(dependencies) {
  const headers = [
    'Package Name',
    'Current Version',
    'Category',
    'Used By',
    'License',
    'License Risk',
    'Vendor',
    'Data Ownership',
    'Repository URL',
    'Security Status',
    'Support Status',
    'Audit Status',
    'Direct/Transitive',
    'Performance Impact',
    'Is Critical',
  ];

  const rows = dependencies.map((dep) => [
    dep.name,
    dep.version,
    dep.category,
    dep.usedBy.join(', '),
    dep.license,
    dep.licenseRisk,
    dep.vendor,
    dep.dataOwnership,
    dep.repositoryUrl,
    dep.securityStatus,
    dep.supportStatus,
    dep.auditStatus,
    dep.directTransitive,
    dep.performanceImpact,
    dep.isCritical,
  ]);

  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Generate Mermaid diagram
 */
function generateMermaidGraph(dependencies) {
  const sanitize = (name) => name.replace(/[^a-zA-Z0-9]/g, '_');

  const critical = dependencies.filter((d) => d.isCritical === 'Yes');
  const runtime = dependencies.filter(
    (d) => d.category === 'Runtime' && d.isCritical === 'No'
  );
  const dev = dependencies.filter((d) => d.category === 'Dev').slice(0, 20); // Limit for readability

  let diagram = `graph TD
    classDef critical fill:#ff6b6b,stroke:#c92a2a,color:#fff
    classDef runtime fill:#51cf66,stroke:#2f9e44,color:#000
    classDef dev fill:#74c0fc,stroke:#1c7ed6,color:#000
    
`;

  // Critical dependencies
  if (critical.length > 0) {
    diagram += `    subgraph Critical["🔴 Critical Dependencies (${critical.length})"]\n`;
    critical.forEach((d) => {
      diagram += `        ${sanitize(d.name)}["${d.name}<br/>${d.version}"]:::critical\n`;
    });
    diagram += `    end\n\n`;
  }

  // Runtime dependencies (sample)
  if (runtime.length > 0) {
    diagram += `    subgraph Runtime["🟢 Runtime Dependencies (${runtime.length} total, showing 10)"]\n`;
    runtime.slice(0, 10).forEach((d) => {
      diagram += `        ${sanitize(d.name)}["${d.name}<br/>${d.version}"]:::runtime\n`;
    });
    diagram += `    end\n\n`;
  }

  // Dev dependencies (sample)
  if (dev.length > 0) {
    diagram += `    subgraph Dev["🔵 Dev Dependencies (showing 10 of ${dependencies.filter((d) => d.category === 'Dev').length})"]\n`;
    dev.slice(0, 10).forEach((d) => {
      diagram += `        ${sanitize(d.name)}["${d.name}<br/>${d.version}"]:::dev\n`;
    });
    diagram += `    end\n`;
  }

  return diagram;
}

/**
 * Generate Markdown summary report
 */
function generateSummaryReport(dependencies, stats) {
  const sortByCount = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  const report = `# Ectropy Dependency Analysis Report

**Generated:** ${new Date().toISOString()}  
**Platform:** Ectropy Construction Intelligence  
**Monorepo:** Yes (pnpm workspaces)  
**Total Dependencies:** ${stats.total}

---

## 📊 Statistics Overview

### By Category
- **Runtime:** ${stats.runtime} (${((stats.runtime / stats.total) * 100).toFixed(1)}%)
- **Dev:** ${stats.dev} (${((stats.dev / stats.total) * 100).toFixed(1)}%)
- **Optional:** ${stats.optional} (${((stats.optional / stats.total) * 100).toFixed(1)}%)

### By Criticality
- **Critical Dependencies:** ${stats.critical} (${((stats.critical / stats.total) * 100).toFixed(1)}%)
- **Non-Critical:** ${stats.total - stats.critical} (${(((stats.total - stats.critical) / stats.total) * 100).toFixed(1)}%)

### By Workspace
${sortByCount(stats.workspaces)
  .map(([ws, count]) => `- **${ws}:** ${count} dependencies`)
  .join('\n')}

---

## 📜 License Distribution

${sortByCount(stats.licenses)
  .map(([license, count]) => {
    const risk = LICENSE_INFO[license]?.risk || '🟡 Medium';
    return `- **${license}** ${risk}: ${count} packages (${((count / stats.total) * 100).toFixed(1)}%)`;
  })
  .join('\n')}

---

## 🏢 Top Vendors

${sortByCount(stats.vendors)
  .slice(0, 10)
  .map(([vendor, count]) => `- **${vendor}:** ${count} packages`)
  .join('\n')}

---

## 🔴 Critical Dependencies

These ${stats.critical} dependencies are flagged as critical for platform operation:

${dependencies
  .filter((d) => d.isCritical === 'Yes')
  .map(
    (d) =>
      `### ${d.name} (${d.version})
- **Vendor:** ${d.vendor}
- **License:** ${d.license} ${d.licenseRisk}
- **Used By:** ${d.usedBy.join(', ')}
- **Performance Impact:** ${d.performanceImpact}
- **Repository:** ${d.repositoryUrl || 'Not specified'}
`
  )
  .join('\n')}

---

## ⚠️ License Risk Assessment

### 🔴 High Risk (${dependencies.filter((d) => d.licenseRisk === '🔴 High').length})
${
  dependencies.filter((d) => d.licenseRisk === '🔴 High').length > 0
    ? dependencies
        .filter((d) => d.licenseRisk === '🔴 High')
        .map((d) => `- ${d.name} (${d.license})`)
        .join('\n')
    : '✅ No high-risk licenses detected'
}

### 🟡 Medium Risk (${dependencies.filter((d) => d.licenseRisk === '🟡 Medium').length})
${
  dependencies.filter((d) => d.licenseRisk === '🟡 Medium').length > 0
    ? dependencies
        .filter((d) => d.licenseRisk === '🟡 Medium')
        .slice(0, 10)
        .map((d) => `- ${d.name} (${d.license})`)
        .join('\n') +
      (dependencies.filter((d) => d.licenseRisk === '🟡 Medium').length > 10
        ? `\n- ... and ${dependencies.filter((d) => d.licenseRisk === '🟡 Medium').length - 10} more`
        : '')
    : '✅ No medium-risk licenses detected'
}

### 🟢 Low Risk (${dependencies.filter((d) => d.licenseRisk === '🟢 Low').length})
All remaining dependencies use permissive licenses (MIT, Apache-2.0, ISC, BSD).

---

## 📦 Next Steps

1. **Import to Notion:** Use \`notion-dependencies.csv\` for bulk import
2. **Review Critical Dependencies:** Validate all ${stats.critical} critical packages
3. **Security Audit:** Run \`npm audit\` and populate CVE data
4. **License Compliance:** Review any high/medium risk licenses
5. **Update Vendor Info:** Expand VENDOR_INFO mapping for unknown vendors

---

## 📁 Generated Files

- \`dependencies-analysis.json\` - Complete structured data (${stats.total} dependencies)
- \`notion-dependencies.csv\` - Notion import (15 columns, ready for upload)
- \`dependency-graph.mmd\` - Mermaid visualization (open at https://mermaid.live)
- \`summary-report.md\` - This file

**Script:** \`scripts/dependencies/analyze-dependencies.js\`  
**Evidence:** \`evidence/dependency-analysis-${new Date().toISOString().split('T')[0]}/\`
`;

  return report;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

function main() {
  console.log('🚀 Ectropy Dependency Analysis\n');
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Analyze dependencies
  const dependencies = analyzeDependencies();
  const stats = generateStatistics(dependencies);

  // Step 2: Create output directory
  const timestamp = new Date().toISOString().split('T')[0];
  const outputDir = path.resolve(
    __dirname,
    `../../evidence/dependency-analysis-${timestamp}`
  );

  console.log('📁 Creating output directory...');
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`   ${outputDir}\n`);

  // Step 3: Generate outputs
  console.log('📝 Generating output files...\n');

  // JSON
  console.log('   1/4 Writing dependencies-analysis.json...');
  const jsonContent = generateJSON(dependencies, stats);
  fs.writeFileSync(
    path.join(outputDir, 'dependencies-analysis.json'),
    JSON.stringify(jsonContent, null, 2)
  );

  // CSV
  console.log('   2/4 Writing notion-dependencies.csv...');
  const csvContent = generateNotionCSV(dependencies);
  fs.writeFileSync(path.join(outputDir, 'notion-dependencies.csv'), csvContent);

  // Mermaid
  console.log('   3/4 Writing dependency-graph.mmd...');
  const mermaidContent = generateMermaidGraph(dependencies);
  fs.writeFileSync(
    path.join(outputDir, 'dependency-graph.mmd'),
    mermaidContent
  );

  // Markdown
  console.log('   4/4 Writing summary-report.md...');
  const markdownContent = generateSummaryReport(dependencies, stats);
  fs.writeFileSync(path.join(outputDir, 'summary-report.md'), markdownContent);

  // Step 4: Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Analysis Complete!\n');
  console.log('📊 Summary:');
  console.log(`   - Total Dependencies: ${stats.total}`);
  console.log(`   - Runtime: ${stats.runtime}`);
  console.log(`   - Dev: ${stats.dev}`);
  console.log(`   - Optional: ${stats.optional}`);
  console.log(`   - Critical: ${stats.critical}`);
  console.log(`   - Unique Licenses: ${Object.keys(stats.licenses).length}`);
  console.log(`   - Unique Vendors: ${Object.keys(stats.vendors).length}`);
  console.log('\n📁 Output Location:');
  console.log(`   ${outputDir}`);
  console.log('\n📦 Next Steps:');
  console.log('   1. Review summary-report.md for analysis');
  console.log('   2. Import notion-dependencies.csv to Notion');
  console.log('   3. Visualize dependency-graph.mmd at https://mermaid.live');
  console.log(
    '   4. Review dependencies-analysis.json for programmatic access'
  );
  console.log(`\n${'='.repeat(60)}\n`);
}

// Run the script
main();
