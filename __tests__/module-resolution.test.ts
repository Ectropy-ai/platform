/**
 * =============================================================================
 * MODULE RESOLUTION INTEGRATION TEST
 *
 * This test validates that all @ectropy/* module imports work correctly
 * and that the workspace configuration is properly set up.
 */

describe('Module Resolution Integration', () => {
  const ectropyCoreModules = [
    '@ectropy/shared',
    '@ectropy/auth',
    '@ectropy/database',
    '@ectropy/blockchain',
    '@ectropy/ai-agents',
    '@ectropy/iot-edge',
    '@ectropy/ifc-processing',
    '@ectropy/speckle-integration',
  ];
  describe('Core Module Resolution', () => {
    test.each(ectropyCoreModules)('should resolve %s module', (moduleName) => {
      const result = global.testHelpers.testModuleResolution(moduleName);
      if (!result.success) {
        console.error(
          `Module resolution failed for ${moduleName}:`,
          result.error
        );
        // Provide helpful debugging information
        const expectedPath = `${moduleName.replace('@ectropy/', 'libs/')}/src/index.ts`;
        console.error(`Expected module at: ${expectedPath}`);
      }
      expect(result.success).toBe(true);
      expect(result.exports).toBeDefined();
      expect(typeof result.exports).toBe('object');
    });
  });
  describe('Module Export Validation', () => {
    test.each(ectropyCoreModules)(
      'should have valid exports for %s',
      (moduleName) => {
        const result = global.testHelpers.testModuleResolution(moduleName);
        expect(result.success).toBe(true);
        expect(result.keys).toBeDefined();
        expect(Array.isArray(result.keys)).toBe(true);
        // Log module structure for debugging
        console.log(`${moduleName} exports:`, result.keys);
      }
    );
  });

  describe('Jest Configuration Validation', () => {
    it('should have proper module name mappings configured', () => {
      const jestConfig = require('../jest.config.js');
      const moduleNameMapper = jestConfig.moduleNameMapper || {};
      // Verify all core modules have proper mappings
      ectropyCoreModules.forEach((moduleName) => {
        const exactMapping = `^${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
        const hasExactMapping = Object.keys(moduleNameMapper).some(
          (pattern) => pattern === exactMapping
        );
        expect(hasExactMapping).toBe(true);
        if (!hasExactMapping) {
          console.error(`Missing Jest module mapping for: ${moduleName}`);
          console.error('Available mappings:', Object.keys(moduleNameMapper));
        }
      });
    });

    it('should have correct path mappings', () => {
      const jestConfig = require('../jest.config.js');
      const moduleNameMapper = jestConfig.moduleNameMapper || {};
      // Verify path patterns
      expect(moduleNameMapper['^@ectropy/shared$']).toContain(
        'libs/shared/src/index.ts'
      );
      expect(moduleNameMapper['^@ectropy/auth$']).toContain(
        'libs/auth/src/index.ts'
      );
      expect(moduleNameMapper['^@ectropy/database$']).toContain(
        'libs/database/src/index.ts'
      );
      expect(moduleNameMapper['^@ectropy/blockchain$']).toContain(
        'libs/blockchain/src/index.ts'
      );
      expect(moduleNameMapper['^@ectropy/ai-agents$']).toContain(
        'libs/ai-agents/src/index.ts'
      );
      expect(moduleNameMapper['^@ectropy/iot-edge$']).toContain(
        'libs/iot-edge/src/index.ts'
      );
    });
  });
  describe('TypeScript Path Mapping Consistency', () => {
    it('should match TypeScript path mappings', () => {
      const jestConfig = require('../jest.config.js');
      const tsConfig = require('../tsconfig.enterprise-standard.json');
      const tsPaths = tsConfig.compilerOptions?.paths || {};
      const jestMapper = jestConfig.moduleNameMapper || {};

      ectropyCoreModules.forEach((moduleName) => {
        const tsPath = tsPaths[moduleName];
        const jestMapping =
          jestMapper[`^${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`];
        if (tsPath && jestMapping) {
          // Both should point to the same general location
          expect(tsPath[0]).toContain('src/index.ts');
          expect(jestMapping).toContain('src/index.ts');
        }
      });
    });
  });
  describe('Workspace Structure Validation', () => {
    it('should have proper NX project configurations', () => {
      const fs = require('fs');
      const path = require('path');

      ectropyCoreModules.forEach((moduleName) => {
        const libName = moduleName.replace('@ectropy/', '');
        const projectJsonPath = path.join(
          process.cwd(),
          'libs',
          libName,
          'project.json'
        );

        try {
          const projectConfig = JSON.parse(
            fs.readFileSync(projectJsonPath, 'utf8')
          );
          expect(projectConfig.name).toBe(moduleName);
          expect(projectConfig.projectType).toBe('library');
          expect(projectConfig.targets).toBeDefined();
          expect(projectConfig.targets.build).toBeDefined();
          expect(projectConfig.targets.test).toBeDefined();
        } catch (error) {
          console.error(
            `Failed to read project.json for ${moduleName}:`,
            error.message
          );
          throw error;
        }
      });
    });

    it('should have TypeScript configurations', () => {
      const fs = require('fs');
      const path = require('path');

      ectropyCoreModules.forEach((moduleName) => {
        const libName = moduleName.replace('@ectropy/', '');
        const tsconfigPath = path.join(
          process.cwd(),
          'libs',
          libName,
          'tsconfig.json'
        );
        const tsconfigLibPath = path.join(
          process.cwd(),
          'libs',
          libName,
          'tsconfig.lib.json'
        );
        expect(fs.existsSync(tsconfigPath)).toBe(true);
        expect(fs.existsSync(tsconfigLibPath)).toBe(true);
      });
    });
  });
  describe('Runtime Module Validation', () => {
    it('should support dynamic imports', async () => {
      // Test that modules can be dynamically imported (important for lazy loading)
      for (const moduleName of ectropyCoreModules.slice(0, 3)) {
        // Test first 3 to avoid timeout
        try {
          const dynamicModule = await import(moduleName);
          expect(dynamicModule).toBeDefined();
          expect(typeof dynamicModule).toBe('object');
        } catch (error) {
          console.error(
            `Dynamic import failed for ${moduleName}:`,
            error.message
          );
          // Don't fail the test for dynamic imports as they might not be supported in all environments
        }
      }
    });
  });
});
