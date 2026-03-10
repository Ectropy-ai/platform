/**
 * Demo Data Fixtures for E2E Tests
 *
 * Provides mock BIM data, projects, and Speckle streams for testing
 * without requiring real Speckle server or database connections
 *
 * Usage:
 * ```typescript
 * import { test, DEMO_PROJECT, DEMO_STREAM } from './fixtures/demo-data.fixture';
 *
 * test('should load BIM model', async ({ page, demoData }) => {
 *   await demoData.seedDemoProject(page);
 *   await page.goto('/viewer');
 * });
 * ```
 */

import { Page } from '@playwright/test';
import { test as authTest } from './auth.fixture';

/**
 * Demo project for testing
 */
export const DEMO_PROJECT = {
  id: 'proj-demo-001',
  name: 'Demo Construction Project',
  description: 'Test project for E2E tests with sample BIM data',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  owner_id: 'user-contractor-001',
  stakeholders: [
    {
      user_id: 'user-contractor-001',
      role: 'contractor',
      name: 'Test Contractor',
    },
  ],
};

/**
 * Demo Speckle stream with simple geometry
 */
export const DEMO_STREAM = {
  stream_id: 'stream-demo-001',
  name: 'Demo BIM Model',
  description: 'Simple cube geometry for testing',
  isPublic: true,
  created_at: new Date().toISOString(),
};

/**
 * Simple cube geometry for BIM viewer
 * Minimal geometry that loads quickly for tests
 */
export const DEMO_GEOMETRY = {
  speckle_type: 'Base',
  id: 'geometry-cube-001',
  units: 'm',
  // Cube vertices (8 corners)
  vertices: [
    // Bottom face
    0,
    0,
    0, // 0
    1,
    0,
    0, // 1
    1,
    1,
    0, // 2
    0,
    1,
    0, // 3
    // Top face
    0,
    0,
    1, // 4
    1,
    0,
    1, // 5
    1,
    1,
    1, // 6
    0,
    1,
    1, // 7
  ],
  // Faces defined by vertex indices
  faces: [
    4,
    0,
    1,
    2,
    3, // Bottom face (4 vertices)
    4,
    4,
    5,
    6,
    7, // Top face
    4,
    0,
    1,
    5,
    4, // Front face
    4,
    2,
    3,
    7,
    6, // Back face
    4,
    0,
    3,
    7,
    4, // Left face
    4,
    1,
    2,
    6,
    5, // Right face
  ],
  properties: {
    name: 'Test Cube',
    category: 'Structural',
    material: 'Concrete',
    volume: 1.0,
  },
};

/**
 * Demo BIM elements for project
 */
export const DEMO_ELEMENTS = [
  {
    id: 'elem-wall-001',
    project_id: DEMO_PROJECT.id,
    type: 'Wall',
    name: 'Exterior Wall A',
    status: 'approved',
    geometry: DEMO_GEOMETRY,
    properties: {
      height: 3.0,
      thickness: 0.3,
      material: 'Concrete',
      fire_rating: '2hr',
    },
  },
  {
    id: 'elem-column-001',
    project_id: DEMO_PROJECT.id,
    type: 'Column',
    name: 'Column C1',
    status: 'approved',
    geometry: DEMO_GEOMETRY,
    properties: {
      height: 4.0,
      width: 0.4,
      depth: 0.4,
      material: 'Steel',
      load_capacity: '500kN',
    },
  },
];

interface DemoDataFixtures {
  demoData: {
    /**
     * Seed demo project data for tests
     */
    seedDemoProject: (page: Page) => Promise<void>;

    /**
     * Seed demo Speckle stream
     */
    seedDemoStream: (page: Page) => Promise<void>;

    /**
     * Mock Speckle API responses
     */
    mockSpeckleAPI: (page: Page) => Promise<void>;

    /**
     * Mock API Gateway endpoints with demo data
     */
    mockAPIEndpoints: (page: Page) => Promise<void>;
  };
}

/**
 * Extended Playwright test with demo data fixtures
 */
export const test = authTest.extend<DemoDataFixtures>({
  demoData: async ({}, use) => {
    const demoData = {
      async seedDemoProject(page: Page): Promise<void> {
        // Mock GET /api/v1/projects endpoint
        await page.route('**/api/v1/projects', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: [DEMO_PROJECT],
              }),
            });
          } else {
            await route.continue();
          }
        });

        // Mock GET /api/projects/:id endpoint
        await page.route(
          `**/api/v1/projects/${DEMO_PROJECT.id}`,
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: DEMO_PROJECT,
              }),
            });
          }
        );

        // Mock GET /api/v1/projects/:id/elements endpoint
        await page.route(
          `**/api/v1/projects/${DEMO_PROJECT.id}/elements`,
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                data: DEMO_ELEMENTS,
              }),
            });
          }
        );
      },

      async seedDemoStream(page: Page): Promise<void> {
        // Mock Speckle streams list endpoint
        await page.route('**/api/speckle/streams', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              streams: [DEMO_STREAM],
            }),
          });
        });

        // Mock Speckle stream detail endpoint
        await page.route(
          `**/api/speckle/streams/${DEMO_STREAM.stream_id}`,
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                stream: DEMO_STREAM,
              }),
            });
          }
        );

        // Mock Speckle object endpoint (geometry data)
        await page.route(
          `**/api/speckle/streams/${DEMO_STREAM.stream_id}/objects/*`,
          async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(DEMO_GEOMETRY),
            });
          }
        );
      },

      async mockSpeckleAPI(page: Page): Promise<void> {
        // Mock Speckle server API (if tests access it directly)
        // Port 3333 is the Speckle server
        await page.route('**/graphql', async (route) => {
          const requestBody = route.request().postDataJSON();

          // Handle different GraphQL queries
          if (requestBody.query?.includes('streams')) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {
                  streams: {
                    totalCount: 1,
                    items: [DEMO_STREAM],
                  },
                },
              }),
            });
          } else {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                data: {},
              }),
            });
          }
        });

        // Mock Speckle object loader
        await page.route('**/objects/*', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(DEMO_GEOMETRY),
          });
        });
      },

      async mockAPIEndpoints(page: Page): Promise<void> {
        // Seed both project and stream data
        await this.seedDemoProject(page);
        await this.seedDemoStream(page);
        await this.mockSpeckleAPI(page);

        // Mock health endpoints
        await page.route('**/health', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString(),
            }),
          });
        });

        // Mock Speckle server health (port 3333)
        await page.route('http://localhost:3333/api/health', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'ok',
              speckle: true,
            }),
          });
        });
      },
    };

    await use(demoData);
  },
});

/**
 * Helper function to wait for BIM viewer to load
 *
 * @param page - Playwright page object
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 */
export async function waitForBIMViewerLoad(
  page: Page,
  timeout: number = 30000
): Promise<void> {
  await page.waitForSelector('[data-testid="speckle-bim-viewer-canvas"]', {
    state: 'visible',
    timeout,
  });

  // Wait for Three.js WebGL context to initialize
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(
        '[data-testid="speckle-bim-viewer-canvas"]'
      );
      if (!canvas) return false;

      // Check if canvas has WebGL context
      const gl =
        (canvas as HTMLCanvasElement).getContext('webgl') ||
        (canvas as HTMLCanvasElement).getContext('experimental-webgl');
      return gl !== null;
    },
    { timeout }
  );
}

/**
 * Helper function to simulate IFC file upload
 */
export async function uploadDemoIFCFile(
  page: Page,
  projectId: string
): Promise<void> {
  // Create a mock IFC file blob
  const ifcContent = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('demo.ifc','2024-01-01T00:00:00',(),(),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
#1=IFCPROJECT('0YvhpAd3X8Vw8p_0000001',$,'Demo Project',$,$,$,$,(#10),#2);
#2=IFCUNITASSIGNMENT((#3));
#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#11,$);
#11=IFCAXIS2PLACEMENT3D(#12,$,$);
#12=IFCCARTESIANPOINT((0.,0.,0.));
ENDSEC;

END-ISO-10303-21;
  `.trim();

  const fileBuffer = Buffer.from(ifcContent, 'utf-8');

  // Mock the file upload endpoint
  await page.route(`**/api/ifc/upload`, async (route) => {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'IFC file uploaded and processed successfully',
        streamId: DEMO_STREAM.stream_id,
        objectsProcessed: 10,
        objectsSuccessful: 10,
        objectsFailed: 0,
      }),
    });
  });
}

export { expect } from '@playwright/test';
