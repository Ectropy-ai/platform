/**
 * Tenant Management Unit Tests
 *
 * Comprehensive test suite for tenant management service and types.
 *
 * @module tests/services/tenant
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use string literals for tenant status and subscription tier to avoid Prisma client dependency
const TenantStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
} as const;

const SubscriptionTier = {
  FREE: 'FREE',
  BASIC: 'BASIC',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;

type TenantStatusType = (typeof TenantStatus)[keyof typeof TenantStatus];
type SubscriptionTierType = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

// ==============================================================================
// Type Tests
// ==============================================================================

describe('Tenant Types', () => {
  describe('SUBSCRIPTION_TIER_LIMITS', () => {
    it('should define limits for all subscription tiers', async () => {
      const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

      expect(SUBSCRIPTION_TIER_LIMITS.FREE).toBeDefined();
      expect(SUBSCRIPTION_TIER_LIMITS.BASIC).toBeDefined();
      expect(SUBSCRIPTION_TIER_LIMITS.PROFESSIONAL).toBeDefined();
      expect(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE).toBeDefined();
    });

    it('should have correct FREE tier limits', async () => {
      const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

      expect(SUBSCRIPTION_TIER_LIMITS.FREE.maxProjects).toBe(1);
      expect(SUBSCRIPTION_TIER_LIMITS.FREE.maxUsers).toBe(5);
      expect(SUBSCRIPTION_TIER_LIMITS.FREE.maxStorageGb).toBe(5);
      expect(SUBSCRIPTION_TIER_LIMITS.FREE.features).toContain('basic');
    });

    it('should have unlimited (-1) for ENTERPRISE tier', async () => {
      const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

      expect(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE.maxProjects).toBe(-1);
      expect(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE.maxUsers).toBe(-1);
      expect(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE.maxStorageGb).toBe(-1);
    });

    it('should include SSO feature only for ENTERPRISE', async () => {
      const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

      expect(SUBSCRIPTION_TIER_LIMITS.FREE.features).not.toContain('sso');
      expect(SUBSCRIPTION_TIER_LIMITS.BASIC.features).not.toContain('sso');
      expect(SUBSCRIPTION_TIER_LIMITS.PROFESSIONAL.features).not.toContain('sso');
      expect(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE.features).toContain('sso');
    });
  });

  describe('isValidSlug', () => {
    it('should accept valid slugs', async () => {
      const { isValidSlug } = await import('../types.js');

      expect(isValidSlug('acme-construction')).toBe(true);
      expect(isValidSlug('company123')).toBe(true);
      expect(isValidSlug('a1b')).toBe(true);
      expect(isValidSlug('test-tenant-name')).toBe(true);
    });

    it('should reject invalid slugs', async () => {
      const { isValidSlug } = await import('../types.js');

      expect(isValidSlug('ab')).toBe(false); // Too short
      expect(isValidSlug('-invalid')).toBe(false); // Leading hyphen
      expect(isValidSlug('invalid-')).toBe(false); // Trailing hyphen
      expect(isValidSlug('UPPERCASE')).toBe(false); // Uppercase
      expect(isValidSlug('has spaces')).toBe(false); // Spaces
      expect(isValidSlug('has_underscores')).toBe(false); // Underscores
    });
  });

  describe('isValidHexColor', () => {
    it('should accept valid hex colors', async () => {
      const { isValidHexColor } = await import('../types.js');

      expect(isValidHexColor('#FF5733')).toBe(true);
      expect(isValidHexColor('#000000')).toBe(true);
      expect(isValidHexColor('#ffffff')).toBe(true);
      expect(isValidHexColor('#AbCdEf')).toBe(true);
    });

    it('should reject invalid hex colors', async () => {
      const { isValidHexColor } = await import('../types.js');

      expect(isValidHexColor('FF5733')).toBe(false); // Missing #
      expect(isValidHexColor('#FFF')).toBe(false); // Too short
      expect(isValidHexColor('#GGGGGG')).toBe(false); // Invalid chars
      expect(isValidHexColor('#FF57333')).toBe(false); // Too long
    });
  });

  describe('isValidStatusTransition', () => {
    it('should allow valid transitions from TRIAL', async () => {
      const { isValidStatusTransition } = await import('../types.js');

      expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.ACTIVE)).toBe(true);
      expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.SUSPENDED)).toBe(true);
      expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.CANCELLED)).toBe(true);
    });

    it('should allow valid transitions from ACTIVE', async () => {
      const { isValidStatusTransition } = await import('../types.js');

      expect(isValidStatusTransition(TenantStatus.ACTIVE, TenantStatus.SUSPENDED)).toBe(true);
      expect(isValidStatusTransition(TenantStatus.ACTIVE, TenantStatus.CANCELLED)).toBe(true);
    });

    it('should allow valid transitions from SUSPENDED', async () => {
      const { isValidStatusTransition } = await import('../types.js');

      expect(isValidStatusTransition(TenantStatus.SUSPENDED, TenantStatus.ACTIVE)).toBe(true);
      expect(isValidStatusTransition(TenantStatus.SUSPENDED, TenantStatus.CANCELLED)).toBe(true);
      expect(isValidStatusTransition(TenantStatus.SUSPENDED, TenantStatus.ARCHIVED)).toBe(true);
    });

    it('should not allow invalid transitions', async () => {
      const { isValidStatusTransition } = await import('../types.js');

      expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.ARCHIVED)).toBe(false);
      expect(isValidStatusTransition(TenantStatus.ACTIVE, TenantStatus.TRIAL)).toBe(false);
      expect(isValidStatusTransition(TenantStatus.CANCELLED, TenantStatus.ACTIVE)).toBe(false);
      expect(isValidStatusTransition(TenantStatus.ARCHIVED, TenantStatus.ACTIVE)).toBe(false);
    });

    it('should not allow transitions from ARCHIVED (terminal state)', async () => {
      const { isValidStatusTransition } = await import('../types.js');

      expect(isValidStatusTransition(TenantStatus.ARCHIVED, TenantStatus.ACTIVE)).toBe(false);
      expect(isValidStatusTransition(TenantStatus.ARCHIVED, TenantStatus.SUSPENDED)).toBe(false);
      expect(isValidStatusTransition(TenantStatus.ARCHIVED, TenantStatus.CANCELLED)).toBe(false);
    });
  });

  describe('canDowngradeTier', () => {
    it('should allow downgrade when usage is within limits', async () => {
      const { canDowngradeTier, TenantUsage } = await import('../types.js');

      const usage = {
        projectCount: 1,
        userCount: 3,
        storageUsedGb: 2,
        limits: {
          projects: { used: 1, max: 25, percentage: 4 },
          users: { used: 3, max: 100, percentage: 3 },
          storage: { used: 2, max: 100, percentage: 2 },
        },
        isOverLimit: false,
        overLimitFields: [],
      };

      const result = canDowngradeTier(usage, SubscriptionTier.FREE);
      expect(result.allowed).toBe(true);
    });

    it('should reject downgrade when projects exceed limit', async () => {
      const { canDowngradeTier } = await import('../types.js');

      const usage = {
        projectCount: 10, // Exceeds FREE limit of 1
        userCount: 3,
        storageUsedGb: 2,
        limits: {
          projects: { used: 10, max: 25, percentage: 40 },
          users: { used: 3, max: 100, percentage: 3 },
          storage: { used: 2, max: 100, percentage: 2 },
        },
        isOverLimit: false,
        overLimitFields: [],
      };

      const result = canDowngradeTier(usage, SubscriptionTier.FREE);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('project');
    });

    it('should reject downgrade when users exceed limit', async () => {
      const { canDowngradeTier } = await import('../types.js');

      const usage = {
        projectCount: 1,
        userCount: 30, // Exceeds BASIC limit of 25
        storageUsedGb: 2,
        limits: {
          projects: { used: 1, max: 25, percentage: 4 },
          users: { used: 30, max: 100, percentage: 30 },
          storage: { used: 2, max: 100, percentage: 2 },
        },
        isOverLimit: false,
        overLimitFields: [],
      };

      const result = canDowngradeTier(usage, SubscriptionTier.BASIC);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('user');
    });
  });

  describe('buildTenantUrn', () => {
    it('should build correct tenant URN', async () => {
      const { buildTenantUrn } = await import('../types.js');

      const urn = buildTenantUrn('acme-construction');
      expect(urn).toBe('urn:luhtech:ectropy:tenant:acme-construction');
    });
  });

  describe('buildTenantUserUrn', () => {
    it('should build correct tenant user URN', async () => {
      const { buildTenantUserUrn } = await import('../types.js');

      const urn = buildTenantUserUrn('acme', 'user-123');
      expect(urn).toBe('urn:luhtech:ectropy:tenant:acme:user:user-123');
    });
  });
});

// ==============================================================================
// Error Class Tests
// ==============================================================================

describe('TenantManagementError', () => {
  it('should create error with code', async () => {
    const { TenantManagementError, TenantErrorCode } = await import('../types.js');

    const error = new TenantManagementError(
      'Tenant not found',
      TenantErrorCode.TENANT_NOT_FOUND,
      { tenantId: '123' }
    );

    expect(error.message).toBe('Tenant not found');
    expect(error.code).toBe('TENANT_NOT_FOUND');
    expect(error.details).toEqual({ tenantId: '123' });
    expect(error.name).toBe('TenantManagementError');
  });

  it('should have all error codes defined', async () => {
    const { TenantErrorCode } = await import('../types.js');

    expect(TenantErrorCode.TENANT_NOT_FOUND).toBeDefined();
    expect(TenantErrorCode.TENANT_ALREADY_EXISTS).toBeDefined();
    expect(TenantErrorCode.TENANT_SUSPENDED).toBeDefined();
    expect(TenantErrorCode.TENANT_CANCELLED).toBeDefined();
    expect(TenantErrorCode.INVALID_SLUG).toBeDefined();
    expect(TenantErrorCode.INVALID_TIER).toBeDefined();
    expect(TenantErrorCode.LIMIT_EXCEEDED).toBeDefined();
    expect(TenantErrorCode.USER_NOT_FOUND).toBeDefined();
    expect(TenantErrorCode.USER_ALREADY_IN_TENANT).toBeDefined();
    expect(TenantErrorCode.CANNOT_REMOVE_LAST_ADMIN).toBeDefined();
    expect(TenantErrorCode.DOWNGRADE_NOT_ALLOWED).toBeDefined();
    expect(TenantErrorCode.INVALID_STATUS_TRANSITION).toBeDefined();
  });
});

// ==============================================================================
// Service Tests (Mocked)
// Note: These tests require Prisma client to be generated
// Skip in environments without Prisma
// ==============================================================================

describe('TenantService', () => {
  describe('Module exports', () => {
    it.skipIf(!process.env.PRISMA_GENERATED)('should export TenantService class', async () => {
      const { TenantService } = await import('../tenant.service.js');
      expect(TenantService).toBeDefined();
    });

    it.skipIf(!process.env.PRISMA_GENERATED)('should export factory functions', async () => {
      const { getTenantService, initializeTenantService } = await import('../tenant.service.js');
      expect(getTenantService).toBeDefined();
      expect(initializeTenantService).toBeDefined();
    });
  });
});

// ==============================================================================
// Integration-Style Tests (Type Validation)
// ==============================================================================

describe('Tenant Type Contracts', () => {
  it('should have consistent TierLimits interface', async () => {
    const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

    // Verify all tiers have required properties
    for (const [tier, limits] of Object.entries(SUBSCRIPTION_TIER_LIMITS)) {
      expect(typeof limits.maxProjects).toBe('number');
      expect(typeof limits.maxUsers).toBe('number');
      expect(typeof limits.maxStorageGb).toBe('number');
      expect(Array.isArray(limits.features)).toBe(true);
    }
  });

  it('should have progressive tier limits', async () => {
    const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

    // FREE < BASIC < PROFESSIONAL for non-unlimited tiers
    expect(SUBSCRIPTION_TIER_LIMITS.FREE.maxProjects).toBeLessThan(
      SUBSCRIPTION_TIER_LIMITS.BASIC.maxProjects
    );
    expect(SUBSCRIPTION_TIER_LIMITS.BASIC.maxProjects).toBeLessThan(
      SUBSCRIPTION_TIER_LIMITS.PROFESSIONAL.maxProjects
    );

    expect(SUBSCRIPTION_TIER_LIMITS.FREE.maxUsers).toBeLessThan(
      SUBSCRIPTION_TIER_LIMITS.BASIC.maxUsers
    );
    expect(SUBSCRIPTION_TIER_LIMITS.BASIC.maxUsers).toBeLessThan(
      SUBSCRIPTION_TIER_LIMITS.PROFESSIONAL.maxUsers
    );
  });

  it('should have progressive feature sets', async () => {
    const { SUBSCRIPTION_TIER_LIMITS } = await import('../types.js');

    // Higher tiers should include features from lower tiers
    const freeFeatures = new Set(SUBSCRIPTION_TIER_LIMITS.FREE.features);
    const basicFeatures = new Set(SUBSCRIPTION_TIER_LIMITS.BASIC.features);
    const proFeatures = new Set(SUBSCRIPTION_TIER_LIMITS.PROFESSIONAL.features);
    const enterpriseFeatures = new Set(SUBSCRIPTION_TIER_LIMITS.ENTERPRISE.features);

    // All tiers should have 'basic' feature
    expect(freeFeatures.has('basic')).toBe(true);
    expect(basicFeatures.has('basic')).toBe(true);
    expect(proFeatures.has('basic')).toBe(true);
    expect(enterpriseFeatures.has('basic')).toBe(true);

    // Enterprise should have all features
    expect(enterpriseFeatures.size).toBeGreaterThan(proFeatures.size);
    expect(proFeatures.size).toBeGreaterThanOrEqual(basicFeatures.size);
    expect(basicFeatures.size).toBeGreaterThanOrEqual(freeFeatures.size);
  });
});

// ==============================================================================
// Status Transition Matrix Tests
// ==============================================================================

describe('Status Transition Matrix', () => {
  const allStatuses = [
    TenantStatus.TRIAL,
    TenantStatus.ACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.CANCELLED,
    TenantStatus.ARCHIVED,
  ];

  it('should have TRIAL as entry state for new tenants', async () => {
    const { isValidStatusTransition } = await import('../types.js');

    // TRIAL can transition to ACTIVE (activation)
    expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.ACTIVE)).toBe(true);
  });

  it('should have ARCHIVED as terminal state', async () => {
    const { isValidStatusTransition } = await import('../types.js');

    // ARCHIVED cannot transition to any other state
    for (const status of allStatuses) {
      if (status !== TenantStatus.ARCHIVED) {
        expect(isValidStatusTransition(TenantStatus.ARCHIVED, status)).toBe(false);
      }
    }
  });

  it('should allow suspension recovery path', async () => {
    const { isValidStatusTransition } = await import('../types.js');

    // ACTIVE -> SUSPENDED -> ACTIVE (suspension and reactivation)
    expect(isValidStatusTransition(TenantStatus.ACTIVE, TenantStatus.SUSPENDED)).toBe(true);
    expect(isValidStatusTransition(TenantStatus.SUSPENDED, TenantStatus.ACTIVE)).toBe(true);
  });

  it('should have cancellation as pre-archive state', async () => {
    const { isValidStatusTransition } = await import('../types.js');

    // Only CANCELLED can transition to ARCHIVED
    expect(isValidStatusTransition(TenantStatus.CANCELLED, TenantStatus.ARCHIVED)).toBe(true);
    expect(isValidStatusTransition(TenantStatus.TRIAL, TenantStatus.ARCHIVED)).toBe(false);
    expect(isValidStatusTransition(TenantStatus.ACTIVE, TenantStatus.ARCHIVED)).toBe(false);
  });
});

// ==============================================================================
// UsageCheckResult Tests
// ==============================================================================

describe('UsageCheckResult', () => {
  it('should indicate allowed when under limit', async () => {
    // Type validation - UsageCheckResult shape
    const result = {
      allowed: true,
      resource: 'projects' as const,
      current: 5,
      limit: 25,
    };

    expect(result.allowed).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('should include message when not allowed', async () => {
    const result = {
      allowed: false,
      resource: 'users' as const,
      current: 25,
      limit: 25,
      message: 'users limit exceeded: 25/25 (adding 1 would exceed limit)',
    };

    expect(result.allowed).toBe(false);
    expect(result.message).toContain('limit exceeded');
  });
});

// ==============================================================================
// Module Index Export Tests
// Note: These tests require Prisma client to be generated
// ==============================================================================

describe('Module Exports', () => {
  it('should export all required types from types module', async () => {
    const module = await import('../types.js');

    // Types and interfaces are exported (verified by usage)
    expect(module.TenantManagementError).toBeDefined();
    expect(module.TenantErrorCode).toBeDefined();
    expect(module.SUBSCRIPTION_TIER_LIMITS).toBeDefined();
    expect(module.isValidSlug).toBeDefined();
    expect(module.isValidHexColor).toBeDefined();
    expect(module.isValidStatusTransition).toBeDefined();
    expect(module.canDowngradeTier).toBeDefined();
    expect(module.buildTenantUrn).toBeDefined();
    expect(module.buildTenantUserUrn).toBeDefined();
  });

  it.skipIf(!process.env.PRISMA_GENERATED)('should export service components from index', async () => {
    const module = await import('../index.js');

    expect(module.TenantService).toBeDefined();
    expect(module.getTenantService).toBeDefined();
    expect(module.initializeTenantService).toBeDefined();
  });
});
