/**
 * ==============================================================================
 * CRM INTEGRATION SERVICE TESTS
 * ==============================================================================
 * Tests for Twenty CRM REST API integration
 * Covers: sync methods, webhook handling, retry logic, response parsing
 * ==============================================================================
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock logger before importing service
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { CRMIntegrationService } from '../crm-integration.service.js';
import { LifecycleStage } from '../types.js';

// ==============================================================================
// Test Helpers
// ==============================================================================

function createMockPrisma() {
  return {
    userRegistration: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

const TEST_CONFIG = {
  crmEnabled: true,
  crmApiUrl: 'https://crm.luh.tech/rest',
  crmApiKey: 'test-api-key-123',
  crmWebhookSecret: 'test-webhook-secret',
};

// ==============================================================================
// Tests
// ==============================================================================

describe('CRMIntegrationService', () => {
  let service: CRMIntegrationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    prisma = createMockPrisma();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CRM Disabled
  // ==========================================================================

  describe('CRM disabled', () => {
    test('syncLeadToCRM returns success without API calls', async () => {
      service = new CRMIntegrationService(prisma, { ...TEST_CONFIG, crmEnabled: false });
      globalThis.fetch = vi.fn();

      const result = await service.syncLeadToCRM({
        email: 'test@example.com',
        source: 'landing_page',
        lifecycleStage: LifecycleStage.WAITLIST,
      });

      expect(result.success).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('syncContactToCRM returns success without API calls', async () => {
      service = new CRMIntegrationService(prisma, { ...TEST_CONFIG, crmEnabled: false });
      globalThis.fetch = vi.fn();

      const result = await service.syncContactToCRM({
        email: 'test@example.com',
        fullName: 'Test User',
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'owner',
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('syncCompanyToCRM returns success without API calls', async () => {
      service = new CRMIntegrationService(prisma, { ...TEST_CONFIG, crmEnabled: false });
      globalThis.fetch = vi.fn();

      const result = await service.syncCompanyToCRM({
        tenantId: 'tenant-1',
        name: 'Test Corp',
        slug: 'test-corp',
        subscriptionTier: 'PROFESSIONAL' as any,
        primaryEmail: 'admin@test.com',
        userCount: 5,
        projectCount: 2,
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('bulkSync returns zero counts when disabled', async () => {
      service = new CRMIntegrationService(prisma, { ...TEST_CONFIG, crmEnabled: false });

      const result = await service.bulkSync();

      expect(result).toEqual({ leadsSync: 0, contactsSync: 0, companiesSync: 0, errors: 0 });
    });
  });

  // ==========================================================================
  // syncLeadToCRM
  // ==========================================================================

  describe('syncLeadToCRM', () => {
    test('updates existing person by email (PATCH)', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      const existingPersonId = 'twenty-person-uuid-123';

      // First call: findPersonByEmail (GET)
      // Second call: PATCH existing person
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // GET /people?filter[emails]... returns existing person
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              data: { people: [{ id: existingPersonId, name: { firstName: 'Existing', lastName: 'User' } }] },
              totalCount: 1,
            }),
            text: () => Promise.resolve(''),
          });
        }
        // PATCH response
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { id: existingPersonId } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncLeadToCRM({
        email: 'existing@test.com',
        fullName: 'Existing User',
        source: 'referral',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      expect(result.success).toBe(true);
      expect(result.crmLeadId).toBe(existingPersonId);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      // Verify PATCH was called (second fetch call)
      const patchCall = (globalThis.fetch as any).mock.calls[1];
      expect(patchCall[0]).toContain(`/people/${existingPersonId}`);
      expect(patchCall[1].method).toBe('PATCH');
    });

    test('creates new person for non-WAITLIST stage (POST)', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      const newPersonId = 'new-person-uuid-456';

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // GET: no existing person found
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { people: [] }, totalCount: 0 }),
            text: () => Promise.resolve(''),
          });
        }
        // POST: created person
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { createPerson: { id: newPersonId } } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncLeadToCRM({
        email: 'new@test.com',
        fullName: 'New User',
        source: 'landing_page',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      expect(result.success).toBe(true);
      expect(result.crmLeadId).toBe(newPersonId);
    });

    test('skips creation for WAITLIST stage (n8n deconfliction)', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      // GET: no existing person
      globalThis.fetch = mockFetchResponse({ data: { people: [] }, totalCount: 0 });

      const result = await service.syncLeadToCRM({
        email: 'waitlist@test.com',
        fullName: 'Waitlist User',
        source: 'landing_page',
        lifecycleStage: LifecycleStage.WAITLIST,
      });

      expect(result.success).toBe(true);
      expect(result.crmLeadId).toBe('pending-n8n');
      // Only 1 call (GET to find), no POST
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    test('parses full name into first/last correctly', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      let capturedBody: any;
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { people: [] } }),
            text: () => Promise.resolve(''),
          });
        }
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { createPerson: { id: 'test-id' } } }),
          text: () => Promise.resolve(''),
        });
      });

      await service.syncLeadToCRM({
        email: 'test@test.com',
        fullName: 'John Michael Doe',
        source: 'test',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      expect(capturedBody.name).toEqual({ firstName: 'John', lastName: 'Michael Doe' });
    });
  });

  // ==========================================================================
  // syncContactToCRM
  // ==========================================================================

  describe('syncContactToCRM', () => {
    test('upserts contact by email — existing person', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);
      const existingId = 'contact-uuid-789';

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              data: { people: [{ id: existingId }] },
            }),
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { id: existingId } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncContactToCRM({
        email: 'contact@test.com',
        fullName: 'Contact Person',
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'owner',
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.crmContactId).toBe(existingId);
    });

    test('creates new contact when not found', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);
      const newId = 'new-contact-uuid';

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { people: [] } }),
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { createPerson: { id: newId } } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncContactToCRM({
        email: 'new-contact@test.com',
        fullName: 'New Contact',
        tenantId: 'tenant-2',
        userId: 'user-2',
        role: 'member',
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.crmContactId).toBe(newId);
    });
  });

  // ==========================================================================
  // syncCompanyToCRM
  // ==========================================================================

  describe('syncCompanyToCRM', () => {
    test('creates company and links owner person', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);
      const companyId = 'company-uuid-123';
      const ownerPersonId = 'owner-person-uuid';

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          // findCompanyByName: not found
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { companies: [] } }),
            text: () => Promise.resolve(''),
          });
        }
        if (callCount === 2) {
          // POST /companies: created
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve({ data: { createCompany: { id: companyId } } }),
            text: () => Promise.resolve(''),
          });
        }
        if (callCount === 3) {
          // findPersonByEmail: found owner
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              data: { people: [{ id: ownerPersonId }] },
            }),
            text: () => Promise.resolve(''),
          });
        }
        // PATCH person with companyId
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { id: ownerPersonId } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncCompanyToCRM({
        tenantId: 'tenant-1',
        name: 'Test Corp',
        slug: 'test-corp',
        subscriptionTier: 'PROFESSIONAL' as any,
        primaryEmail: 'admin@testcorp.com',
        userCount: 10,
        projectCount: 3,
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.crmCompanyId).toBe(companyId);
      // 4 calls: findCompany, createCompany, findPerson, linkPerson
      expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });

    test('updates existing company', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);
      const existingCompanyId = 'existing-company-uuid';

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // findCompanyByName: found
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              data: { companies: [{ id: existingCompanyId, name: 'Test Corp' }] },
            }),
            text: () => Promise.resolve(''),
          });
        }
        // PATCH company / findPerson (no primaryEmail, so no find)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { id: existingCompanyId } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncCompanyToCRM({
        tenantId: 'tenant-1',
        name: 'Test Corp',
        slug: 'test-corp',
        subscriptionTier: 'BASIC' as any,
        primaryEmail: null,
        userCount: 3,
        projectCount: 1,
        createdAt: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.crmCompanyId).toBe(existingCompanyId);
    });
  });

  // ==========================================================================
  // handleWebhook
  // ==========================================================================

  describe('handleWebhook', () => {
    test('lead.qualified advances lifecycle', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      prisma.userRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        email: 'lead@test.com',
        lifecycle_stage: LifecycleStage.WAITLIST,
      });

      await service.handleWebhook({
        eventType: 'lead.qualified',
        timestamp: new Date(),
        data: { email: 'lead@test.com' },
      });

      expect(prisma.userRegistration.findUnique).toHaveBeenCalledWith({
        where: { email: 'lead@test.com' },
      });
    });

    test('trial.converted updates lifecycle to PAID', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      prisma.userRegistration.findUnique.mockResolvedValue({
        id: 'reg-2',
        email: 'trial@test.com',
        lifecycle_stage: LifecycleStage.TRIAL,
      });

      await service.handleWebhook({
        eventType: 'trial.converted',
        timestamp: new Date(),
        data: { email: 'trial@test.com' },
      });

      expect(prisma.userRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-2' },
        data: {
          lifecycle_stage: LifecycleStage.PAID,
          converted_at: expect.any(Date),
        },
      });
    });

    test('subscription.cancelled updates lifecycle to CHURNED', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      prisma.userRegistration.findUnique.mockResolvedValue({
        id: 'reg-3',
        email: 'cancel@test.com',
        lifecycle_stage: LifecycleStage.PAID,
      });

      await service.handleWebhook({
        eventType: 'subscription.cancelled',
        timestamp: new Date(),
        data: { email: 'cancel@test.com' },
      });

      expect(prisma.userRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-3' },
        data: { lifecycle_stage: LifecycleStage.CHURNED },
      });
    });

    test('webhook without email does nothing', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      await service.handleWebhook({
        eventType: 'lead.qualified',
        timestamp: new Date(),
        data: {},
      });

      expect(prisma.userRegistration.findUnique).not.toHaveBeenCalled();
    });

    test('webhook when CRM disabled does nothing', async () => {
      service = new CRMIntegrationService(prisma, { ...TEST_CONFIG, crmEnabled: false });

      await service.handleWebhook({
        eventType: 'trial.converted',
        timestamp: new Date(),
        data: { email: 'test@test.com' },
      });

      expect(prisma.userRegistration.findUnique).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // withRetry (tested via syncLeadToCRM)
  // ==========================================================================

  describe('retry logic', () => {
    test('retries on 5xx errors', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls fail with 500
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () => Promise.resolve('Server error'),
          });
        }
        if (callCount === 3) {
          // Third call: findPersonByEmail succeeds (person not found)
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { people: [] } }),
            text: () => Promise.resolve(''),
          });
        }
        // Fourth call: POST succeeds
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { createPerson: { id: 'retry-success-id' } } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncLeadToCRM({
        email: 'retry@test.com',
        source: 'test',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      // The retry wraps the entire operation, so on retry the full operation re-runs
      expect(result.success).toBe(true);
    });

    test('does not retry on 4xx errors', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid payload'),
      });

      const result = await service.syncLeadToCRM({
        email: 'bad@test.com',
        source: 'test',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      // 4xx errors are not retried — returns failure
      expect(result.success).toBe(false);
      expect(result.error).toContain('400');
    });
  });

  // ==========================================================================
  // findPersonByEmail — REST response parsing
  // ==========================================================================

  describe('findPersonByEmail (via syncLeadToCRM)', () => {
    test('correctly parses REST response with people array', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      const personId = 'found-person-uuid';
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          // Verify correct filter syntax in URL
          expect(url).toContain('filter[emails][primaryEmail][eq]=');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              data: {
                people: [{ id: personId, name: { firstName: 'Found', lastName: 'User' }, emails: { primaryEmail: 'found@test.com' } }],
              },
              totalCount: 1,
            }),
            text: () => Promise.resolve(''),
          });
        }
        // PATCH
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncLeadToCRM({
        email: 'found@test.com',
        source: 'test',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      expect(result.crmLeadId).toBe(personId);
    });

    test('returns null for empty people array', async () => {
      service = new CRMIntegrationService(prisma, TEST_CONFIG);

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { people: [] }, totalCount: 0 }),
            text: () => Promise.resolve(''),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { createPerson: { id: 'new-id' } } }),
          text: () => Promise.resolve(''),
        });
      });

      const result = await service.syncLeadToCRM({
        email: 'notfound@test.com',
        source: 'test',
        lifecycleStage: LifecycleStage.EMAIL_VERIFIED,
      });

      // Person not found → creates new
      expect(result.crmLeadId).toBe('new-id');
    });
  });
});
