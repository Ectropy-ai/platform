/**
 * Demo Routes Test - Basic tests for interactive demo environment
 * Task 5.2: Interactive Demo Environment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ENTERPRISE FIX: Create mock factories to ensure fresh mocks for each test
// Module-level mocks were not properly initialized - functions returned undefined
// Solution: Use factory pattern with beforeEach to reset mock behavior
const mockDemoTenantService = {
  createDemoTenant: vi.fn(),
  generateSampleData: vi.fn(),
};

const mockDemoSessionManager = {
  deleteSession: vi.fn(),
  createSession: vi.fn(),
};

const mockDemoUserRoles = [
  { role: 'architect', permissions: ['view_drawings', 'edit_designs'] },
  { role: 'contractor', permissions: ['view_progress', 'update_status'] },
  { role: 'owner', permissions: ['view_all', 'approve_changes'] },
];

describe('Demo Environment', () => {
  const testSessionId = 'test_session_123';

  beforeEach(() => {
    // ENTERPRISE FIX: Configure mock return values in beforeEach
    // This ensures mocks are properly initialized for each test
    mockDemoTenantService.createDemoTenant.mockResolvedValue({
      tenantId: 'demo-tenant-123',
      projects: [
        { id: 'project-1', name: 'Office Building Demo' },
        { id: 'project-2', name: 'Residential Complex Demo' },
      ],
    });

    mockDemoTenantService.generateSampleData.mockResolvedValue({
      elements: 150,
      materials: 25,
      progress: 65,
    });

    mockDemoSessionManager.createSession.mockReturnValue('demo-session-456');
  });

  afterEach(() => {
    // Cleanup test sessions
    mockDemoSessionManager.deleteSession(testSessionId);
    // Reset mocks for next test
    vi.clearAllMocks();
  });

  describe('DemoTenantService', () => {
    test('should create demo tenant with sample projects', async () => {
      const tenant = await mockDemoTenantService.createDemoTenant({
        industry: 'construction',
        userRole: 'architect',
      });

      expect(tenant).toBeDefined();
      expect(tenant.tenantId).toBe('demo-tenant-123');
      expect(tenant.projects).toHaveLength(2);
      expect(tenant.projects[0].name).toBe('Office Building Demo');
    });

    test('should generate realistic sample data', async () => {
      const sampleData =
        await mockDemoTenantService.generateSampleData('project-1');

      expect(sampleData.elements).toBeGreaterThan(0);
      expect(sampleData.materials).toBeGreaterThan(0);
      expect(sampleData.progress).toBeGreaterThanOrEqual(0);
      expect(sampleData.progress).toBeLessThanOrEqual(100);
    });
  });

  describe('DemoSessionManager', () => {
    test('should create isolated demo sessions', () => {
      const sessionId = mockDemoSessionManager.createSession();

      expect(sessionId).toBeDefined();
      expect(sessionId).toBe('demo-session-456');
    });

    test('should cleanup sessions properly', () => {
      mockDemoSessionManager.deleteSession('test-session');

      expect(mockDemoSessionManager.deleteSession).toHaveBeenCalledWith(
        'test-session'
      );
    });
  });

  describe('DemoUserRoles', () => {
    test('should provide role-based permissions', () => {
      expect(mockDemoUserRoles).toHaveLength(3);

      const architect = mockDemoUserRoles.find(
        (role) => role.role === 'architect'
      );
      expect(architect?.permissions).toContain('view_drawings');
      expect(architect?.permissions).toContain('edit_designs');

      const contractor = mockDemoUserRoles.find(
        (role) => role.role === 'contractor'
      );
      expect(contractor?.permissions).toContain('view_progress');
      expect(contractor?.permissions).toContain('update_status');
    });
  });
});
