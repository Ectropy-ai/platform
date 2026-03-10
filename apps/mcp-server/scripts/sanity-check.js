#!/usr/bin/env node
/**
 * MCP Validation Sanity Check
 * Quick verification that validation infrastructure is working
 * Runs without requiring a running MCP server
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 MCP Validation Sanity Check');
console.log('================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Test 1: Roadmap files exist
test('Product roadmap file exists', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  if (!fs.existsSync(roadmapPath)) {
    throw new Error('roadmap.json not found');
  }
});

test('Business roadmap file exists', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  if (!fs.existsSync(businessRoadmapPath)) {
    throw new Error('business-roadmap.json not found');
  }
});

// Test 2: Roadmap files are valid JSON
test('Product roadmap is valid JSON', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  const data = fs.readFileSync(roadmapPath, 'utf-8');
  JSON.parse(data);
});

test('Business roadmap is valid JSON', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const data = fs.readFileSync(businessRoadmapPath, 'utf-8');
  JSON.parse(data);
});

// Test 3: Roadmap versions and structure
test('Product roadmap version is 1.3.0', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf-8'));
  if (roadmap.version !== '1.3.0') {
    throw new Error(`Expected version 1.3.0, got ${roadmap.version}`);
  }
});

test('Product roadmap current phase is phase-5a', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf-8'));
  if (roadmap.currentPhase !== 'phase-5a') {
    throw new Error(`Expected phase-5a, got ${roadmap.currentPhase}`);
  }
});

test('Business roadmap version is 1.0.0', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  if (businessRoadmap.version !== '1.0.0') {
    throw new Error(`Expected version 1.0.0, got ${businessRoadmap.version}`);
  }
});

test('Business roadmap organization is Ectropy Technologies Group', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  if (businessRoadmap.organizationName !== 'Ectropy Technologies Group') {
    throw new Error(`Expected 'Ectropy Technologies Group', got ${businessRoadmap.organizationName}`);
  }
});

test('Business roadmap has 4 phases', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  if (businessRoadmap.phases.length !== 4) {
    throw new Error(`Expected 4 phases, got ${businessRoadmap.phases.length}`);
  }
});

test('Business roadmap current stage is pre-seed', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  if (businessRoadmap.currentStage !== 'pre-seed') {
    throw new Error(`Expected 'pre-seed', got ${businessRoadmap.currentStage}`);
  }
});

// Test 4: Cross-roadmap references
test('Product roadmap has businessRoadmapReference', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf-8'));
  if (!roadmap.businessRoadmapReference) {
    throw new Error('businessRoadmapReference not found');
  }
  if (roadmap.businessRoadmapReference.mcpAccess !== 'validated') {
    throw new Error(`Expected mcpAccess 'validated', got ${roadmap.businessRoadmapReference.mcpAccess}`);
  }
});

test('Business roadmap has productRoadmapReference', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  if (!businessRoadmap.productRoadmapReference) {
    throw new Error('productRoadmapReference not found');
  }
  if (businessRoadmap.productRoadmapReference.mcpAccess !== 'validated') {
    throw new Error(`Expected mcpAccess 'validated', got ${businessRoadmap.productRoadmapReference.mcpAccess}`);
  }
});

// Test 5: Strategic milestone alignment
test('Demo milestone dates match between roadmaps', () => {
  const roadmapPath = path.join(__dirname, '../data/roadmap.json');
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  
  const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf-8'));
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  
  const productDemo = roadmap.strategicMilestones?.demo;
  const businessDemo = businessRoadmap.strategicMilestones?.demo;
  
  if (!productDemo || !businessDemo) {
    throw new Error('Demo milestone not found in both roadmaps');
  }
  
  if (productDemo.date !== businessDemo.date) {
    throw new Error(`Demo dates don't match: product=${productDemo.date}, business=${businessDemo.date}`);
  }
});

// Test 6: Test files exist
test('Unit test file exists', () => {
  const testPath = path.join(__dirname, '../src/services/__tests__/mcp-business-roadmap-validation.spec.ts');
  if (!fs.existsSync(testPath)) {
    throw new Error('mcp-business-roadmap-validation.spec.ts not found');
  }
});

test('Integration script exists', () => {
  const scriptPath = path.join(__dirname, 'validate-mcp-integration.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error('validate-mcp-integration.js not found');
  }
});

test('Documentation exists', () => {
  const docPath = path.join(__dirname, 'README.md');
  if (!fs.existsSync(docPath)) {
    throw new Error('README.md not found');
  }
});

// Test 7: Business roadmap structure validation
test('Business roadmap has strategic milestones', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  
  if (!businessRoadmap.strategicMilestones) {
    throw new Error('strategicMilestones not found');
  }
  
  const required = ['demo', 'pilot', 'preSeedRaise', 'publicLaunch'];
  for (const milestone of required) {
    if (!businessRoadmap.strategicMilestones[milestone]) {
      throw new Error(`Missing milestone: ${milestone}`);
    }
  }
});

test('Business roadmap has current metrics', () => {
  const businessRoadmapPath = path.join(__dirname, '../data/business-roadmap.json');
  const businessRoadmap = JSON.parse(fs.readFileSync(businessRoadmapPath, 'utf-8'));
  
  if (!businessRoadmap.currentMetrics) {
    throw new Error('currentMetrics not found');
  }
  
  const required = ['team', 'financials', 'customers', 'community'];
  for (const metric of required) {
    if (!businessRoadmap.currentMetrics[metric]) {
      throw new Error(`Missing metric: ${metric}`);
    }
  }
});

// Summary
console.log('\n================================');
console.log('📊 Sanity Check Summary');
console.log('================================');
console.log(`Total Tests: ${passed + failed}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n❌ Sanity check FAILED');
  process.exit(1);
} else {
  console.log('\n✅ Sanity check PASSED');
  console.log('\nMCP validation infrastructure is ready!');
  console.log('Next steps:');
  console.log('1. Run unit tests: npm test -- apps/mcp-server/src/services/__tests__/mcp-business-roadmap-validation.spec.ts');
  console.log('2. Start MCP server: cd apps/mcp-server && npm run dev');
  console.log('3. Run integration validation: node scripts/validate-mcp-integration.js');
  process.exit(0);
}
