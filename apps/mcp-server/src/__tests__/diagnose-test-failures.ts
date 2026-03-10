/**
 * Diagnostic script to understand agent-guidance test failures
 *
 * Run with: pnpm tsx apps/mcp-server/src/__tests__/diagnose-test-failures.ts
 */

import { AgentGuidance } from '../services/agent-guidance.js';
import { WorkPlanValidator } from '../services/work-plan-validator.js';

const agentGuidance = new AgentGuidance();
const workPlanValidator = new WorkPlanValidator();

console.log('='.repeat(80));
console.log('TEST FAILURE #1: "should provide guidance that passes validation"');
console.log('='.repeat(80));
console.log();

// Test case 1: Add API endpoint
const guidance1 = agentGuidance.getGuidance({
  query: 'Add new API endpoint',
});

console.log('GUIDANCE OUTPUT:');
console.log(JSON.stringify(guidance1, null, 2));
console.log();

const workPlan1 = {
  taskDescription: 'Add user profile endpoint',
  proposedApproach: guidance1.approvedApproach,
  filesImpacted: ['apps/api/src/routes/users.ts'],
  estimatedComplexity: guidance1.estimatedComplexity,
  requiresTests: true,
  requiresDocumentation: false,
};

console.log('WORK PLAN INPUT:');
console.log(JSON.stringify(workPlan1, null, 2));
console.log();

const validation1 = workPlanValidator.validate(workPlan1);

console.log('VALIDATION RESULT:');
console.log(JSON.stringify(validation1, null, 2));
console.log();
console.log(`SCORE: ${validation1.score} (expected > 50)`);
console.log(`RECOMMENDATION: ${validation1.recommendation}`);
console.log();

console.log('='.repeat(80));
console.log('TEST FAILURE #2: "should handle build failure scenario end-to-end"');
console.log('='.repeat(80));
console.log();

// Test case 2: Build failure
const guidance2 = agentGuidance.getGuidance({
  query: 'Build failing in mcp-server',
  context: 'TypeScript compilation errors',
});

console.log('GUIDANCE OUTPUT:');
console.log(JSON.stringify(guidance2, null, 2));
console.log();

const workPlan2 = {
  taskDescription: 'Fix TypeScript build errors',
  proposedApproach: 'Step 1: Query MCP health. Step 2: Analyze build failure. Step 3: Apply fix. Step 4: Verify with tests.',
  filesImpacted: ['apps/mcp-server/tsconfig.json'],
  estimatedComplexity: 'moderate' as const,
  requiresTests: true,
  requiresDocumentation: true,
};

console.log('WORK PLAN INPUT:');
console.log(JSON.stringify(workPlan2, null, 2));
console.log();

const validation2 = workPlanValidator.validate(workPlan2);

console.log('VALIDATION RESULT:');
console.log(JSON.stringify(validation2, null, 2));
console.log();
console.log(`SCORE: ${validation2.score}`);
console.log(`RECOMMENDATION: ${validation2.recommendation} (expected NOT 'reject')`);
console.log();

console.log('='.repeat(80));
console.log('ROOT CAUSE ANALYSIS');
console.log('='.repeat(80));
console.log();

if (validation1.score <= 50) {
  console.log('TEST 1 FAILURE CAUSES:');
  console.log('Concerns raised:');
  validation1.concerns.forEach(concern => {
    console.log(`  - [${concern.severity}] ${concern.category}: ${concern.description}`);
  });
  console.log();
}

if (validation2.recommendation === 'reject') {
  console.log('TEST 2 FAILURE CAUSES:');
  console.log('Concerns raised:');
  validation2.concerns.forEach(concern => {
    console.log(`  - [${concern.severity}] ${concern.category}: ${concern.description}`);
  });
  console.log();
}

console.log('='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
