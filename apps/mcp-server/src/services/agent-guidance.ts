/**
 * Agent Guidance Service
 * Provides proactive recommendations to AI agents based on common patterns
 */

export interface GuidanceRequest {
  query: string; // What the AI wants to do
  context?: string; // Current situation
  previousAttempts?: string[]; // What was tried before
}

export interface GuidanceResponse {
  recommendation: string;
  approvedApproach: string;
  checklistItems: string[];
  commonMistakes: string[];
  validationSteps: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  estimatedTime: string;
  timestamp: string;
}

interface GuidancePattern {
  name: string;
  keywords: RegExp[];
  recommendation: string;
  approvedApproach: string;
  checklistItems: string[];
  commonMistakes: string[];
  validationSteps: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTime: string;
}

export class AgentGuidance {
  private patterns: GuidancePattern[];

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Get guidance for a query
   */
  getGuidance(request: GuidanceRequest): GuidanceResponse {
    const pattern = this.matchPattern(request.query, request.context);
    
    if (!pattern) {
      return this.getDefaultGuidance(request);
    }

    return {
      recommendation: pattern.recommendation,
      approvedApproach: pattern.approvedApproach,
      checklistItems: pattern.checklistItems,
      commonMistakes: pattern.commonMistakes,
      validationSteps: pattern.validationSteps,
      estimatedComplexity: pattern.complexity,
      estimatedTime: pattern.estimatedTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Match query to a guidance pattern
   */
  private matchPattern(query: string, context?: string): GuidancePattern | null {
    const combinedText = `${query} ${context || ''}`.toLowerCase();

    for (const pattern of this.patterns) {
      const matches = pattern.keywords.some(keyword => keyword.test(combinedText));
      if (matches) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Get default guidance when no pattern matches
   */
  private getDefaultGuidance(request: GuidanceRequest): GuidanceResponse {
    return {
      recommendation: 'Use MCP guidance endpoints to validate your approach',
      approvedApproach: '1. Query MCP health. 2. Submit work plan for validation. 3. Follow approved approach with tests.',
      checklistItems: [
        'Query MCP health: curl localhost:3001/health',
        'Validate work plan: POST /api/mcp/validate-work-plan',
        'Check strategy alignment: POST /api/mcp/check-strategy',
        'Implement with tests',
        'Verify changes work',
        'Update CURRENT_TRUTH.md if needed',
      ],
      commonMistakes: [
        'Skipping MCP health check',
        'Not validating work plan first',
        'Creating new documentation files',
        'Using workarounds or shortcuts',
      ],
      validationSteps: [
        'curl localhost:3001/health | jq .score',
        'Run relevant tests',
        'Verify build succeeds',
      ],
      estimatedComplexity: 'moderate',
      estimatedTime: '1-2 hours',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Initialize all guidance patterns
   */
  private initializePatterns(): GuidancePattern[] {
    return [
      // Pattern 1: Build Failures
      {
        name: 'Build Failures',
        keywords: [
          /build.*fail/i,
          /build.*error/i,
          /compilation.*error/i,
          /typescript.*error/i,
          /webpack.*error/i,
        ],
        recommendation: 'Use MCP build analyzer to identify root cause',
        approvedApproach: '1. Analyze with /api/mcp/analyze-build-failure. 2. Apply suggested fix. 3. Verify build succeeds.',
        checklistItems: [
          'Query MCP health first',
          'Run build and capture error output',
          'POST error to /api/mcp/analyze-build-failure',
          'Review suggested fixes',
          'Apply recommended solution',
          'Verify build: pnpm nx build <project>',
          'Update CURRENT_TRUTH.md with solution',
        ],
        commonMistakes: [
          'Using sed/awk instead of proper config changes',
          'Commenting out imports instead of fixing paths',
          'Using @ts-ignore instead of fixing type errors',
          'Modifying node_modules directly',
        ],
        validationSteps: [
          'pnpm nx build <project>',
          'Check exit code is 0',
          'Verify no compilation errors in output',
        ],
        complexity: 'moderate',
        estimatedTime: '30-60 minutes',
      },

      // Pattern 2: Module Resolution
      {
        name: 'Module Resolution',
        keywords: [
          /module.*not.*found/i,
          /cannot.*find.*module/i,
          /import.*error/i,
          /resolve.*module/i,
          /path.*mapping/i,
        ],
        recommendation: 'Check tsconfig path mappings and verify dist/ exists',
        approvedApproach: '1. Verify dist/ directory exists. 2. Check tsconfig paths. 3. Rebuild affected projects. 4. Update imports if needed.',
        checklistItems: [
          'Check if dist/ directory exists for imported package',
          'Build dependency: pnpm nx build <dependency>',
          'Verify tsconfig.base.json path mappings',
          'Check package.json exports field',
          'Update import paths if needed',
          'Rebuild consuming project',
          'Run tests to verify',
        ],
        commonMistakes: [
          'Changing imports instead of fixing build config',
          'Using relative paths across packages',
          'Not building dependencies first',
          'Modifying tsconfig.json instead of tsconfig.base.json',
        ],
        validationSteps: [
          'ls -la dist/<package>',
          'cat tsconfig.base.json | grep paths',
          'pnpm nx build <project>',
          'pnpm nx test <project>',
        ],
        complexity: 'moderate',
        estimatedTime: '20-40 minutes',
      },

      // Pattern 3: Documentation Needed
      {
        name: 'Documentation Needed',
        keywords: [
          /how.*document/i,
          /add.*documentation/i,
          /write.*docs/i,
          /create.*guide/i,
          /need.*readme/i,
        ],
        recommendation: 'Use inline comments in code, update CURRENT_TRUTH.md for platform changes',
        approvedApproach: '1. Add WHY comments inline in code for complex logic. 2. Update CURRENT_TRUTH.md for platform changes. 3. Do NOT create new .md files.',
        checklistItems: [
          'Add inline comments explaining WHY, not WHAT',
          'Update CURRENT_TRUTH.md with platform state changes',
          'Document decisions and tradeoffs inline',
          'Add examples in comments if helpful',
          'Do NOT create TROUBLESHOOTING.md or other guides',
        ],
        commonMistakes: [
          'Creating TROUBLESHOOTING.md',
          'Creating separate guide files',
          'Writing WHAT instead of WHY',
          'Over-documenting obvious code',
          'Not updating CURRENT_TRUTH.md',
        ],
        validationSteps: [
          'grep -r "TROUBLESHOOTING" . (should find nothing new)',
          'git diff docs/CURRENT_TRUTH.md',
          'Verify inline comments explain WHY',
        ],
        complexity: 'simple',
        estimatedTime: '10-20 minutes',
      },

      // Pattern 4: Test Failures
      {
        name: 'Test Failures',
        keywords: [
          /test.*fail/i,
          /test.*error/i,
          /spec.*fail/i,
          /jest.*error/i,
          /assertion.*fail/i,
        ],
        recommendation: 'Fix the test, do not skip it. Debug root cause and update test properly.',
        approvedApproach: '1. Debug why test is failing. 2. Fix root cause. 3. Update test if needed. 4. Do NOT use it.skip().',
        checklistItems: [
          'Run test in isolation: pnpm nx test <project> --testFile=<file>',
          'Read error message carefully',
          'Debug with console.log or debugger',
          'Identify root cause of failure',
          'Fix the code or update test expectations',
          'Verify test passes',
          'Do NOT skip test with it.skip()',
        ],
        commonMistakes: [
          'Using it.skip() to hide failures',
          'Commenting out assertions',
          'Changing test without understanding why it failed',
          'Not running tests after fix',
        ],
        validationSteps: [
          'pnpm nx test <project> --testFile=<file>',
          'Verify all tests pass',
          'grep -r "it.skip\\|test.skip" . (should find nothing new)',
        ],
        complexity: 'moderate',
        estimatedTime: '20-45 minutes',
      },

      // Pattern 5: Configuration Changes
      {
        name: 'Configuration Changes',
        keywords: [
          /config.*change/i,
          /update.*config/i,
          /environment.*variable/i,
          /settings?.*change/i,
        ],
        recommendation: 'Use proper config files, update CURRENT_TRUTH.md, avoid hardcoding',
        approvedApproach: '1. Update config file (not inline code). 2. Use environment variables. 3. Document in CURRENT_TRUTH.md. 4. Test in all environments.',
        checklistItems: [
          'Update config file or .env template',
          'Use environment variables, not hardcoded values',
          'Add validation for required config',
          'Update CURRENT_TRUTH.md with config changes',
          'Test in dev, staging, production scenarios',
          'Verify fallback values work',
        ],
        commonMistakes: [
          'Hardcoding values instead of using env vars',
          'Committing secrets to git',
          'Not documenting config changes',
          'Breaking backward compatibility',
        ],
        validationSteps: [
          'grep -r "password\\|api.?key\\|secret" src/ (check for hardcoded secrets)',
          'Test with missing env vars',
          'Verify config loads correctly',
        ],
        complexity: 'simple',
        estimatedTime: '15-30 minutes',
      },

      // Pattern 6: API Endpoint Changes
      {
        name: 'API Endpoint Changes',
        keywords: [
          /api.*endpoint/i,
          /route.*change/i,
          /add.*endpoint/i,
          /rest.*api/i,
        ],
        recommendation: 'Add endpoint with proper error handling, validation, and tests',
        approvedApproach: '1. Define route and request/response types. 2. Add validation middleware. 3. Implement with try-catch. 4. Write tests first. 5. Test with curl.',
        checklistItems: [
          'Define TypeScript interfaces for request/response',
          'Add input validation middleware',
          'Implement with proper error handling (try-catch)',
          'Write tests before implementing',
          'Add to OpenAPI/Swagger docs if used',
          'Test with curl commands',
          'Update CURRENT_TRUTH.md with new endpoint',
        ],
        commonMistakes: [
          'No input validation',
          'Missing error handling',
          'Not writing tests',
          'Returning 200 for errors',
          'Using "any" types',
        ],
        validationSteps: [
          'curl -X POST localhost:3001/api/... -d \'{"test": "data"}\'',
          'Test with invalid input',
          'Test with missing fields',
          'Verify error responses have proper status codes',
        ],
        complexity: 'moderate',
        estimatedTime: '45-90 minutes',
      },
    ];
  }
}
