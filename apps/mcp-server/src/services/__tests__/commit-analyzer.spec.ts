/**
 * Commit Analyzer Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommitAnalyzer } from '../commit-analyzer';

describe('CommitAnalyzer', () => {
  let analyzer: CommitAnalyzer;

  beforeEach(() => {
    analyzer = new CommitAnalyzer();
  });

  describe('parseDiff', () => {
    it('should parse unified diff format', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
index 1234567..abcdefg 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
+export const newLine = 1;
 export const oldLine = 2;
-const removed = 3;
`;
      
      const files = (analyzer as any).parseDiff(diff);
      
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('src/test.ts');
      expect(files[0].type).toBe('modified');
      expect(files[0].additions.length).toBe(1);
      expect(files[0].deletions.length).toBe(1);
    });

    it('should detect new files', () => {
      const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const newFile = true;
+console.log('test');
`;
      
      const files = (analyzer as any).parseDiff(diff);
      
      expect(files.length).toBe(1);
      expect(files[0].type).toBe('added');
      expect(files[0].path).toBe('src/new.ts');
    });

    it('should detect deleted files', () => {
      const diff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 1234567..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const oldFile = true;
-console.log('removed');
`;
      
      const files = (analyzer as any).parseDiff(diff);
      
      expect(files.length).toBe(1);
      expect(files[0].type).toBe('deleted');
    });

    it('should handle multiple files', () => {
      const diff = `diff --git a/src/file1.ts b/src/file1.ts
index 1234567..abcdefg 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,1 +1,2 @@
+const added = 1;
 const existing = 2;
diff --git a/src/file2.ts b/src/file2.ts
index 2345678..bcdefgh 100644
--- a/src/file2.ts
+++ b/src/file2.ts
@@ -1,1 +1,1 @@
-const removed = 3;
+const modified = 4;
`;
      
      const files = (analyzer as any).parseDiff(diff);
      
      expect(files.length).toBe(2);
      expect(files[0].path).toBe('src/file1.ts');
      expect(files[1].path).toBe('src/file2.ts');
    });
  });

  describe('detectWorkarounds', () => {
    it('should detect "quick fix" phrases', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// quick fix for the issue
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasWorkarounds).toBe(true);
      expect(result.violations.some(v => v.category === 'anti-pattern')).toBe(true);
    });

    it('should detect "temporary" indicator', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// temporary solution until we fix the root cause
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasWorkarounds).toBe(true);
    });

    it('should detect "FIXME" comments', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// FIXME: this is broken
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasWorkarounds).toBe(true);
    });

    it('should detect "hack" keyword', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// hack to make it work
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasWorkarounds).toBe(true);
    });
  });

  describe('detectShortcuts', () => {
    it('should detect @ts-ignore', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// @ts-ignore
 const bad: any = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasShortcuts).toBe(true);
      expect(result.violations.some(v => v.severity === 'critical')).toBe(true);
      expect(result.recommendation).toBe('reject');
    });

    it('should detect @ts-nocheck', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// @ts-nocheck
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasShortcuts).toBe(true);
    });

    it('should detect eslint-disable', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+/* eslint-disable no-console */
 console.log('test');
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasShortcuts).toBe(true);
    });

    it('should detect skip test patterns', () => {
      const diff = `diff --git a/src/test.spec.ts b/src/test.spec.ts
--- a/src/test.spec.ts
+++ b/src/test.spec.ts
@@ -1,1 +1,2 @@
+it.skip('should test something', () => {
 });
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasShortcuts).toBe(true);
    });
  });

  describe('detectTODOs', () => {
    it('should detect TODO comments', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// TODO: implement this feature
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasTODOs).toBe(true);
      expect(result.violations.some(v => v.severity === 'medium')).toBe(true);
    });

    it('should detect FIXME comments', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// FIXME: broken logic here
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasTODOs).toBe(true);
    });
  });

  describe('detectCommentedCode', () => {
    it('should detect commented function', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// function oldCode() {
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasCommentedCode).toBe(true);
    });

    it('should detect commented variable declarations', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// const oldVariable = 123;
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasCommentedCode).toBe(true);
    });

    it('should detect commented if statements', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// if (condition) {
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasCommentedCode).toBe(true);
    });
  });

  describe('detectNewDocs', () => {
    it('should detect new TROUBLESHOOTING.md file', () => {
      const diff = `diff --git a/docs/TROUBLESHOOTING.md b/docs/TROUBLESHOOTING.md
new file mode 100644
--- /dev/null
+++ b/docs/TROUBLESHOOTING.md
@@ -0,0 +1,2 @@
+# Troubleshooting
+Guide for fixing issues
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.createsNewDocs).toBe(true);
      expect(result.violations.some(v => v.severity === 'critical')).toBe(true);
      expect(result.recommendation).toBe('reject');
    });

    it('should detect FIX_README.md violation', () => {
      const diff = `diff --git a/FIX_README.md b/FIX_README.md
new file mode 100644
--- /dev/null
+++ b/FIX_README.md
@@ -0,0 +1,1 @@
+Fix instructions
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.createsNewDocs).toBe(true);
    });

    it('should allow README.md', () => {
      const diff = `diff --git a/README.md b/README.md
new file mode 100644
--- /dev/null
+++ b/README.md
@@ -0,0 +1,1 @@
+# Project
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.createsNewDocs).toBe(false);
    });

    it('should allow CURRENT_TRUTH.md', () => {
      const diff = `diff --git a/docs/CURRENT_TRUTH.md b/docs/CURRENT_TRUTH.md
new file mode 100644
--- /dev/null
+++ b/docs/CURRENT_TRUTH.md
@@ -0,0 +1,1 @@
+# Current Truth
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.createsNewDocs).toBe(false);
    });

    it('should allow CHANGELOG.md', () => {
      const diff = `diff --git a/CHANGELOG.md b/CHANGELOG.md
new file mode 100644
--- /dev/null
+++ b/CHANGELOG.md
@@ -0,0 +1,1 @@
+# Changelog
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.createsNewDocs).toBe(false);
    });
  });

  describe('detectSecrets', () => {
    it('should detect hardcoded passwords', () => {
      const diff = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,1 +1,2 @@
+const password = "hardcoded123";
 export const config = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasHardcodedSecrets).toBe(true);
      expect(result.violations.some(v => v.category === 'security')).toBe(true);
      expect(result.recommendation).toBe('reject');
    });

    it('should detect API keys', () => {
      const diff = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,1 +1,2 @@
+const apiKey = "sk-1234567890abcdef";
 export const config = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasHardcodedSecrets).toBe(true);
    });

    it('should exclude test files from secret detection', () => {
      const diff = `diff --git a/src/test.spec.ts b/src/test.spec.ts
--- a/src/test.spec.ts
+++ b/src/test.spec.ts
@@ -1,1 +1,2 @@
+const password = "test-password-123";
 describe('test', () => {});
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasHardcodedSecrets).toBe(false);
    });

    it('should exclude fixture files', () => {
      const diff = `diff --git a/test-data/fixtures/auth.ts b/test-data/fixtures/auth.ts
--- a/test-data/fixtures/auth.ts
+++ b/test-data/fixtures/auth.ts
@@ -1,1 +1,2 @@
+const apiKey = "fixture-key-12345";
 export const fixtures = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasHardcodedSecrets).toBe(false);
    });
  });

  describe('detectConsoleLogging', () => {
    it('should detect console.log', () => {
      const diff = `diff --git a/src/util.ts b/src/util.ts
--- a/src/util.ts
+++ b/src/util.ts
@@ -1,1 +1,2 @@
+console.log('debug message');
 export const util = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasConsoleLogging).toBe(true);
      expect(result.violations.some(v => v.severity === 'medium')).toBe(true);
    });

    it('should detect console.debug', () => {
      const diff = `diff --git a/src/util.ts b/src/util.ts
--- a/src/util.ts
+++ b/src/util.ts
@@ -1,1 +1,2 @@
+console.debug('debugging');
 export const util = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasConsoleLogging).toBe(true);
    });

    it('should exclude main.ts from console detection', () => {
      const diff = `diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,1 +1,2 @@
+console.log('Server started');
 app.listen(3000);
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.hasConsoleLogging).toBe(false);
    });
  });

  describe('detectAnyTypes', () => {
    it('should detect : any type annotation', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+const value: any = 1;
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.usesAnyType).toBe(true);
      expect(result.violations.some(v => v.severity === 'low')).toBe(true);
    });

    it('should detect as any cast', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+const value = something as any;
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.usesAnyType).toBe(true);
    });

    it('should detect <any> cast', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+const value = <any>something;
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.patterns.usesAnyType).toBe(true);
    });
  });

  describe('calculateScore', () => {
    it('should start at 100 for clean code', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+export const clean = 1;
 export const test = 2;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBe(100);
      expect(result.recommendation).toBe('approve');
    });

    it('should deduct 30 points for critical violations', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// @ts-ignore
+const bad: any = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBe(65); // 100 - 30 (critical) - 5 (low)
    });

    it('should deduct 20 points for high severity', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// quick fix for now
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBe(80); // 100 - 20 (high)
    });

    it('should deduct 10 points for medium severity', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// TODO: implement this
 export const test = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBe(90); // 100 - 10 (medium)
    });

    it('should not go below 0', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,10 @@
+// @ts-ignore
+// @ts-nocheck
+const password = "secret123456";
+// quick fix
+// TODO: fix
+console.log('test');
+const val: any = 1;
+// const commented = 2;
 export const test = 2;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateRecommendation', () => {
    it('should reject on critical violations', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+// @ts-ignore
 const bad = 1;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.recommendation).toBe('reject');
    });

    it('should reject when score < 50', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,5 @@
+const password = "hardcoded123";
+// @ts-ignore
+// quick fix
+// TODO: fix this
 export const test = 2;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBeLessThan(50);
      expect(result.recommendation).toBe('reject');
    });

    it('should review when score 50-79', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,3 @@
+// quick fix for now
+// TODO: improve this
 export const test = 2;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(80);
      expect(result.recommendation).toBe('review');
    });

    it('should approve when score >= 80', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,1 +1,2 @@
+export const cleanCode = 1;
 export const test = 2;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.recommendation).toBe('approve');
    });
  });

  describe('analyze integration', () => {
    it('should provide complete analysis with multiple violations', () => {
      const diff = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,1 +1,5 @@
+// @ts-ignore - quick fix
+const config: any = {};
+// TODO: refactor this
+console.log('debug');
 export const service = {};
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.filesChanged).toBe(1);
      expect(result.linesAdded).toBe(4);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      expect(result.recommendation).toBe('reject');
    });

    it('should handle empty diff', () => {
      const result = analyzer.analyze('');
      
      expect(result.filesChanged).toBe(0);
      expect(result.linesAdded).toBe(0);
      expect(result.linesRemoved).toBe(0);
      expect(result.violations.length).toBe(0);
      expect(result.score).toBe(100);
      expect(result.recommendation).toBe('approve');
    });

    it('should correctly count lines added and removed', () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
+const newLine = 1;
 const keepLine = 2;
-const removedLine = 3;
 const anotherKeep = 4;
`;
      
      const result = analyzer.analyze(diff);
      
      expect(result.linesAdded).toBe(1);
      expect(result.linesRemoved).toBe(1);
    });
  });
});
