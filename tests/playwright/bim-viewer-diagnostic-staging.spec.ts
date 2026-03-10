/**
 * ENTERPRISE DIAGNOSTIC TEST - BIM Viewer Stream Loading
 *
 * Purpose: Identify exact failure point in stream loading chain
 * Scope: Test entire data flow from projects API → streams API → UI display
 *
 * This test will reveal:
 * 1. Are projects loading from API?
 * 2. Do projects have valid IDs?
 * 3. Are streams API endpoints reachable?
 * 4. Do streams exist in database for these projects?
 * 5. Is the UI receiving and displaying streams correctly?
 */

import { test, expect } from './fixtures/auth.fixture';
import { setupAuthForRole } from './fixtures/auth.fixture';

test.describe('BIM Viewer Stream Loading - DIAGNOSTIC', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthForRole(page, 'architect');
  });

  test('DIAGNOSTIC: Full stream loading chain analysis', async ({ page }) => {
    console.log('\n' + '='.repeat(80));
    console.log('ENTERPRISE DIAGNOSTIC - BIM VIEWER STREAM LOADING');
    console.log('='.repeat(80) + '\n');

    const results = {
      projects_api_reachable: false,
      projects_api_returns_data: false,
      projects_count: 0,
      project_ids: [] as string[],
      streams_api_tests: {} as Record<string, any>,
      ui_loads: false,
      ui_shows_streams: false,
      errors: [] as string[],
    };

    // ===================================================================
    // STEP 1: Test Projects API
    // ===================================================================
    console.log('STEP 1: Testing Projects API');
    console.log('-'.repeat(80));

    try {
      const projectsResponse = await page.request.get(
        'https://staging.ectropy.ai/api/v1/projects',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      results.projects_api_reachable = projectsResponse.ok();
      console.log(`✓ Projects API Status: ${projectsResponse.status()}`);

      if (projectsResponse.ok()) {
        const projectsData = await projectsResponse.json();
        console.log(
          '✓ Projects API Response:',
          JSON.stringify(projectsData, null, 2)
        );

        // Handle both formats: { data: [...] } and direct array
        const projects =
          projectsData.data ||
          (Array.isArray(projectsData) ? projectsData : []);
        results.projects_api_returns_data = projects.length > 0;
        results.projects_count = projects.length;
        results.project_ids = projects.map((p: any) => p.id);

        console.log(`✓ Projects found: ${results.projects_count}`);
        console.log(`✓ Project IDs: ${results.project_ids.join(', ')}`);
      } else {
        const errorText = await projectsResponse.text();
        results.errors.push(
          `Projects API returned ${projectsResponse.status()}: ${errorText}`
        );
        console.log(`✗ Projects API Error: ${errorText}`);
      }
    } catch (error) {
      results.errors.push(`Projects API request failed: ${error}`);
      console.log(`✗ Projects API Exception:`, error);
    }

    console.log('');

    // ===================================================================
    // STEP 2: Test Streams API for each project
    // ===================================================================
    console.log('STEP 2: Testing Streams API for each project');
    console.log('-'.repeat(80));

    for (const projectId of results.project_ids) {
      console.log(`\nTesting streams for project: ${projectId}`);

      try {
        const streamsResponse = await page.request.get(
          `https://staging.ectropy.ai/api/speckle/projects/${projectId}/streams`,
          {
            headers: {
              Accept: 'application/json',
            },
          }
        );

        const status = streamsResponse.status();
        console.log(`  Status: ${status}`);

        if (streamsResponse.ok()) {
          const streamsData = await streamsResponse.json();
          console.log(`  Response:`, JSON.stringify(streamsData, null, 2));

          const streams = streamsData.streams || [];
          results.streams_api_tests[projectId] = {
            success: true,
            status,
            stream_count: streams.length,
            streams: streams.map((s: any) => ({
              id: s.id || s.stream_id,
              name: s.name || s.stream_name,
            })),
          };

          console.log(`  ✓ Streams found: ${streams.length}`);
          if (streams.length > 0) {
            streams.forEach((s: any, i: number) => {
              console.log(
                `    ${i + 1}. ${s.name || s.stream_name} (ID: ${s.id || s.stream_id})`
              );
            });
          }
        } else {
          const errorText = await streamsResponse.text();
          results.streams_api_tests[projectId] = {
            success: false,
            status,
            error: errorText,
          };
          console.log(`  ✗ Error: ${errorText}`);
          results.errors.push(
            `Streams API for ${projectId}: ${status} - ${errorText}`
          );
        }
      } catch (error) {
        results.streams_api_tests[projectId] = {
          success: false,
          error: String(error),
        };
        console.log(`  ✗ Exception:`, error);
        results.errors.push(
          `Streams API for ${projectId} threw exception: ${error}`
        );
      }
    }

    console.log('');

    // ===================================================================
    // STEP 3: Test UI Loading
    // ===================================================================
    console.log('STEP 3: Testing UI');
    console.log('-'.repeat(80));

    try {
      await page.goto('https://staging.ectropy.ai/viewer', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await page.waitForTimeout(2000);

      results.ui_loads = true;
      console.log('✓ UI loaded successfully');

      // Check for project selector
      const projectSelector = await page
        .locator('[data-testid="project-selector"]')
        .count();
      console.log(`  Project selector found: ${projectSelector > 0}`);

      // Check for stream selector
      const streamSelector = await page
        .locator('[data-testid="stream-selector"]')
        .count();
      console.log(`  Stream selector found: ${streamSelector > 0}`);

      // Check for any visible streams in dropdown
      const streamOptions = await page
        .locator('[data-testid="stream-option"]')
        .count();
      results.ui_shows_streams = streamOptions > 0;
      console.log(`  Stream options visible: ${streamOptions}`);

      // Check for error messages
      const errorMessages = await page
        .locator('[role="alert"]')
        .allTextContents();
      if (errorMessages.length > 0) {
        console.log('  ⚠️  Error messages on page:');
        errorMessages.forEach((msg) => console.log(`    - ${msg}`));
        results.errors.push(...errorMessages);
      }

      // Take diagnostic screenshot
      await page.screenshot({
        path: 'test-results/bim-viewer-diagnostic-staging.png',
        fullPage: true,
      });
    } catch (error) {
      results.ui_loads = false;
      results.errors.push(`UI loading failed: ${error}`);
      console.log('✗ UI loading failed:', error);
    }

    console.log('');

    // ===================================================================
    // FINAL REPORT
    // ===================================================================
    console.log('='.repeat(80));
    console.log('DIAGNOSTIC RESULTS');
    console.log('='.repeat(80));

    console.log('\n📊 Summary:');
    console.log(
      `  Projects API reachable: ${results.projects_api_reachable ? '✓' : '✗'}`
    );
    console.log(`  Projects found: ${results.projects_count}`);
    console.log(`  Projects tested for streams: ${results.project_ids.length}`);

    const successfulStreamsTests = Object.values(
      results.streams_api_tests
    ).filter((t: any) => t.success).length;
    console.log(
      `  Streams API tests passed: ${successfulStreamsTests}/${results.project_ids.length}`
    );

    console.log(`  UI loads: ${results.ui_loads ? '✓' : '✗'}`);
    console.log(`  UI shows streams: ${results.ui_shows_streams ? '✓' : '✗'}`);

    if (results.errors.length > 0) {
      console.log(`\n❌ Errors (${results.errors.length}):`);
      results.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    console.log('\n🔍 Root Cause Analysis:');

    if (!results.projects_api_reachable) {
      console.log('  ❌ CRITICAL: Projects API is not reachable');
      console.log('     ACTION: Check API Gateway deployment and routing');
    } else if (results.projects_count === 0) {
      console.log('  ❌ CRITICAL: No projects exist in database');
      console.log('     ACTION: Create test projects in staging database');
    } else {
      let hasStreams = false;
      for (const [projectId, test] of Object.entries(
        results.streams_api_tests
      )) {
        const testResult = test as any;
        if (testResult.success && testResult.stream_count > 0) {
          hasStreams = true;
          console.log(
            `  ✓ Project ${projectId} has ${testResult.stream_count} streams`
          );
        } else if (testResult.success && testResult.stream_count === 0) {
          console.log(
            `  ⚠️  Project ${projectId} has NO streams (empty array returned)`
          );
        } else {
          console.log(
            `  ❌ Project ${projectId} streams API failed: ${testResult.error || 'Unknown'}`
          );
        }
      }

      if (!hasStreams) {
        console.log(
          '\n  ❌ ROOT CAUSE: No Speckle streams exist in database for any project'
        );
        console.log('     SOLUTIONS:');
        console.log('       1. Upload IFC file to create streams');
        console.log('       2. Initialize projects with Speckle integration');
        console.log('       3. Create test streams via API');
      }
    }

    console.log('\n' + '='.repeat(80));

    // Write detailed results to file
    const fs = await import('fs');
    const diagnosticReport = {
      timestamp: new Date().toISOString(),
      environment: 'staging.ectropy.ai',
      results,
    };

    fs.writeFileSync(
      'test-results/bim-viewer-diagnostic-report.json',
      JSON.stringify(diagnosticReport, null, 2)
    );

    console.log(
      '📄 Detailed report saved to: test-results/bim-viewer-diagnostic-report.json\n'
    );

    // Test assertions for CI
    expect(
      results.projects_api_reachable,
      'Projects API should be reachable'
    ).toBe(true);
    expect(
      results.projects_count,
      'Should have at least one project'
    ).toBeGreaterThan(0);
  });
});
