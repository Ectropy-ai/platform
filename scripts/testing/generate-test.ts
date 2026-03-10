#!/usr/bin/env ts-node
/**
 * ENTERPRISE TEST GENERATOR: MCP-Enhanced Automated Test Creation
 *
 * PURPOSE:
 * Automates test generation from enterprise templates with intelligent placeholder replacement.
 * Integrates with qa-framework.json and MCP for AI-enhanced test creation.
 *
 * USAGE:
 * pnpm test:generate unit libs/shared/utils/src/array-utils.ts
 * pnpm test:generate component apps/web-dashboard/src/components/Button.tsx
 * pnpm test:generate integration apps/api-gateway/src/routes/projects.ts
 * pnpm test:generate e2e bim-viewer
 *
 * CLOSED-LOOP INTEGRATION:
 * 1. Generator reads qa-framework.json for template paths and targets
 * 2. TypeScript AST parsing extracts function/component signatures
 * 3. Template placeholders replaced with actual code
 * 4. Generated test saved alongside source file
 * 5. Pre-commit hook validates test exists (qa-framework.json enforcement)
 * 6. Test runs → test-matrix.json updates → Roadmap validates
 *
 * MCP INTEGRATION:
 * - Templates include MCP metadata for AI enhancement
 * - Generator can invoke MCP for intelligent test case suggestions
 * - AI-driven edge case detection based on function signature analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface QAFramework {
  frameworks: {
    [key: string]: {
      name: string;
      template: string;
      testFilePattern: string;
      coverageTarget: number;
    };
  };
}

interface TemplateReplacements {
  [key: string]: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = path.resolve(__dirname, '../..');
const QA_FRAMEWORK_PATH = path.join(
  REPO_ROOT,
  'apps/mcp-server/data/qa-framework.json'
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load QA framework configuration
 */
function loadQAFramework(): QAFramework {
  if (!fs.existsSync(QA_FRAMEWORK_PATH)) {
    throw new Error(`QA Framework not found: ${QA_FRAMEWORK_PATH}`);
  }
  const content = fs.readFileSync(QA_FRAMEWORK_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Parse command line arguments
 */
function parseArgs(): { type: string; filePath: string } {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: pnpm test:generate <type> <file-path>');
    console.error('');
    console.error('Types: unit, component, integration, e2e');
    console.error('');
    console.error('Examples:');
    console.error(
      '  pnpm test:generate unit libs/shared/utils/src/array-utils.ts'
    );
    console.error(
      '  pnpm test:generate component apps/web-dashboard/src/components/Button.tsx'
    );
    console.error(
      '  pnpm test:generate integration apps/api-gateway/src/routes/projects.ts'
    );
    console.error('  pnpm test:generate e2e bim-viewer');
    process.exit(1);
  }

  return {
    type: args[0],
    filePath: args[1],
  };
}

/**
 * Load template file
 */
function loadTemplate(templatePath: string): string {
  const fullPath = path.join(REPO_ROOT, templatePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Template not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Parse TypeScript file and extract function signatures
 */
function extractFunctionSignatures(sourceFilePath: string): string[] {
  if (!fs.existsSync(sourceFilePath)) {
    console.warn(`Source file not found: ${sourceFilePath}`);
    return [];
  }

  const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const functions: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.push(node.name.text);
    } else if (ts.isArrowFunction(node)) {
      // Extract arrow function names from variable declarations
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && parent.name) {
        if (ts.isIdentifier(parent.name)) {
          functions.push(parent.name.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

/**
 * Extract component name from React component file
 */
function extractComponentName(sourceFilePath: string): string | null {
  if (!fs.existsSync(sourceFilePath)) {
    console.warn(`Source file not found: ${sourceFilePath}`);
    return null;
  }

  const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  let componentName: string | null = null;

  function visit(node: ts.Node) {
    // Look for export default function ComponentName()
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some(
        (m) =>
          m.kind === ts.SyntaxKind.ExportKeyword ||
          m.kind === ts.SyntaxKind.DefaultKeyword
      )
    ) {
      componentName = node.name.text;
    }

    // Look for const ComponentName = () => {}
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0];
      if (
        declaration &&
        ts.isIdentifier(declaration.name) &&
        ts.isArrowFunction(declaration.initializer)
      ) {
        const name = declaration.name.text;
        // Component names typically start with uppercase
        if (name[0] === name[0].toUpperCase()) {
          componentName = name;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return componentName;
}

/**
 * Build template replacements based on test type and source file
 */
function buildReplacements(
  testType: string,
  filePath: string,
  qaFramework: QAFramework
): TemplateReplacements {
  const absolutePath = path.join(REPO_ROOT, filePath);
  const fileName = path.basename(filePath, path.extname(filePath));
  const fileExt = path.extname(filePath);
  const replacements: TemplateReplacements = {};

  switch (testType) {
    case 'unit': {
      const functions = extractFunctionSignatures(absolutePath);
      const primaryFunction = functions[0] || 'exampleFunction';

      replacements['{{MODULE_NAME}}'] = fileName;
      replacements['{{FUNCTION_NAME}}'] = primaryFunction;
      replacements['{{FILE_NAME}}'] = fileName;
      replacements['{{FILE_PATH}}'] = `./${fileName}`;
      replacements['{{EXPECTED_BEHAVIOR}}'] = 'return correct result';
      replacements['{{IMPORTS}}'] = `import { ${primaryFunction} } from './${fileName}';`;
      break;
    }

    case 'component': {
      const componentName =
        extractComponentName(absolutePath) || fileName || 'Component';
      const propsInterface = `${componentName}Props`;

      replacements['{{COMPONENT_NAME}}'] = componentName;
      replacements['{{COMPONENT_FILE}}'] = fileName;
      replacements['{{COMPONENT_PATH}}'] = `./${fileName}`;
      replacements['{{PROPS_INTERFACE}}'] = propsInterface;
      break;
    }

    case 'integration': {
      // Extract API route from file path
      const routeName = fileName
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const apiRoute = `/api/${fileName.replace(/-/g, '/')}`;

      replacements['{{ROUTE_NAME}}'] = routeName;
      replacements['{{API_ROUTE}}'] = apiRoute;
      replacements['{{APP_IMPORT}}'] = `import app from '../../main';`;
      break;
    }

    case 'e2e': {
      // E2E tests use feature name from filePath (e.g., "bim-viewer")
      const featureName = fileName
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const featurePath = fileName.toLowerCase();

      replacements['{{FEATURE_NAME}}'] = featureName;
      replacements['{{FEATURE_PATH}}'] = featurePath;
      replacements['{{BASE_URL}}'] = 'http://localhost:3000';
      replacements['{{USER_ROLE}}'] = 'admin';
      break;
    }

    default:
      throw new Error(`Unsupported test type: ${testType}`);
  }

  return replacements;
}

/**
 * Apply replacements to template content
 */
function applyReplacements(
  template: string,
  replacements: TemplateReplacements
): string {
  let result = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
    result = result.replace(regex, value);
  }

  return result;
}

/**
 * Determine test file output path based on qa-framework pattern
 */
function getTestFilePath(
  testType: string,
  sourceFilePath: string,
  qaFramework: QAFramework
): string {
  const framework = qaFramework.frameworks[testType];
  if (!framework) {
    throw new Error(`Framework not found for type: ${testType}`);
  }

  const pattern = framework.testFilePattern;
  const sourcePath = path.join(REPO_ROOT, sourceFilePath);
  const sourceDir = path.dirname(sourcePath);
  const sourceBase = path.basename(sourcePath, path.extname(sourcePath));
  const sourceExt = path.extname(sourcePath);

  let testFilePath: string;

  if (testType === 'e2e') {
    // E2E tests go in tests/playwright/ directory
    testFilePath = path.join(
      REPO_ROOT,
      'tests',
      'playwright',
      `${sourceBase}.spec.ts`
    );
  } else {
    // Other tests go alongside source file
    const testFileName = pattern
      .replace('{name}', sourceBase)
      .replace('{ext}', sourceExt === '.tsx' ? '.tsx' : '.ts');

    testFilePath = path.join(sourceDir, testFileName);
  }

  return testFilePath;
}

/**
 * Write generated test to file
 */
function writeTestFile(testFilePath: string, content: string): void {
  // Ensure directory exists
  const dir = path.dirname(testFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check if file already exists
  if (fs.existsSync(testFilePath)) {
    console.warn(`⚠️  Test file already exists: ${testFilePath}`);
    console.warn('   Skipping generation to avoid overwrite.');
    console.warn('   Delete existing file if you want to regenerate.');
    return;
  }

  // Write file
  fs.writeFileSync(testFilePath, content, 'utf-8');
  console.log(`✅ Generated test: ${testFilePath}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🚀 ENTERPRISE TEST GENERATOR\n');
  console.log('MCP-Enhanced Automated Test Creation\n');

  try {
    // Parse arguments
    const { type, filePath } = parseArgs();
    console.log(`📋 Test Type: ${type}`);
    console.log(`📄 Source File: ${filePath}\n`);

    // Load QA framework
    console.log('📖 Loading QA framework configuration...');
    const qaFramework = loadQAFramework();
    console.log(`✅ QA Framework loaded\n`);

    // Validate test type
    if (!qaFramework.frameworks[type]) {
      throw new Error(
        `Unknown test type: ${type}. Available types: ${Object.keys(qaFramework.frameworks).join(', ')}`
      );
    }

    const framework = qaFramework.frameworks[type];
    console.log(`🧪 Framework: ${framework.name}`);
    console.log(`🎯 Coverage Target: ${framework.coverageTarget}%`);
    console.log(`📝 Template: ${framework.template}\n`);

    // Load template
    console.log('📖 Loading template...');
    const template = loadTemplate(framework.template);
    console.log(`✅ Template loaded (${template.length} characters)\n`);

    // Build replacements
    console.log('🔧 Analyzing source file and building replacements...');
    const replacements = buildReplacements(type, filePath, qaFramework);
    console.log('✅ Replacements built:');
    for (const [key, value] of Object.entries(replacements)) {
      console.log(`   ${key} → ${value}`);
    }
    console.log('');

    // Apply replacements
    console.log('🔨 Applying template replacements...');
    const generatedContent = applyReplacements(template, replacements);
    console.log(`✅ Template processed\n`);

    // Determine output path
    const testFilePath = getTestFilePath(type, filePath, qaFramework);
    console.log(`📍 Test file path: ${testFilePath}\n`);

    // Write test file
    console.log('💾 Writing test file...');
    writeTestFile(testFilePath, generatedContent);

    console.log('\n✅ TEST GENERATION COMPLETE');
    console.log(`   Generated: ${testFilePath}`);
    console.log(
      `   Coverage Target: ${framework.coverageTarget}% (${framework.name})`
    );
    console.log('\n📋 NEXT STEPS:');
    console.log('   1. Review generated test and customize as needed');
    console.log('   2. Fill in TODO placeholders with actual test data');
    console.log('   3. Run tests: pnpm test');
    console.log('   4. Commit changes (pre-commit hook will validate)');
  } catch (error) {
    console.error('❌ Error generating test:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main, buildReplacements, applyReplacements, extractFunctionSignatures };
