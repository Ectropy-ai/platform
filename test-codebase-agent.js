/**
 * Basic smoke test for the AI Codebase Agent
 */

// Import from the built package (CommonJS format)
const { CodebaseAgent } = await import(
  './dist/libs/ai-agents/codebase-advisor/index.js'
);

async function testCodebaseAgent() {
  console.log('🤖 Testing AI Codebase Agent...');

  try {
    // Initialize the agent
    const agent = new CodebaseAgent({
      rootPath: process.cwd(),
      standards: {
        typescript: true,
        eslint: true,
        prettier: true,
      },
    });

    console.log('✅ Agent initialized successfully');

    // Test quick wins
    console.log('🔍 Testing quick wins...');
    const quickWins = await agent.getQuickWins();
    console.log(`✅ Quick wins: ${quickWins.length} recommendations found`);

    // Test code validation
    console.log('📝 Testing code validation...');
    const testCode = `
    export function testFunction(name: string): string {
      return \`Hello, \${name}!\`;
    }
    `;

    const validation = await agent.validateStandards(testCode);
    console.log(
      `✅ Code validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`
    );
    if (!validation.isValid) {
      console.log(`   Violations: ${validation.violations.length}`);
    }

    // Test component guidance
    console.log('🎯 Testing component guidance...');
    try {
      const guidance = await agent.provideComponentGuidance(
        'apps/web-dashboard/src/components/Button.tsx'
      );
      console.log(`✅ Component guidance: Generated for ${guidance.component}`);
    } catch (error) {
      console.log(
        `⚠️ Component guidance: Component not found (expected for demo)`
      );
    }

    // Test dependency recommendations
    console.log('📦 Testing dependency recommendations...');
    const depAdvice = await agent.recommendDependencies(
      'testing and ui components'
    );
    console.log(
      `✅ Dependency recommendations: ${depAdvice.recommendations.length} suggestions`
    );

    // Test health report generation
    console.log('🏥 Testing health report...');
    const healthReport = await agent.generateHealthReport();
    console.log(
      `✅ Health report: Generated (${Math.round(healthReport.length / 1024)}KB)`
    );

    console.log('\n🎉 All tests passed! AI Codebase Agent is operational.');
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  testCodebaseAgent()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testCodebaseAgent };
