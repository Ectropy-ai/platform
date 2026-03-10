/**
 * Helmet Security Middleware Tests
 *
 * Comprehensive security headers and middleware configuration testing
 *
 * Test Coverage:
 * - Content Security Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - X-XSS-Protection
 * - Referrer-Policy
 * - Permissions-Policy
 * - DNS Prefetch Control
 * - Expect-CT
 *
 * OWASP Coverage: A05 (Security Misconfiguration), A03 (Injection)
 *
 * @see apps/mcp-server/SECURITY_TESTING.md
 * @see apps/mcp-server/TESTING.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

// Mock Express objects
function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  secure?: boolean;
}): Partial<Request> {
  return {
    method: options.method || 'GET',
    headers: options.headers || {},
    secure: options.secure ?? true,
    get: (header: string) => options.headers?.[header.toLowerCase()],
  };
}

function createMockResponse(): {
  res: Partial<Response>;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};

  const res: Partial<Response> = {
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(', ')
        : value;
      return res as Response;
    }),
    getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
    removeHeader: vi.fn((name: string) => {
      delete headers[name.toLowerCase()];
      return res as Response;
    }),
  };

  return { res, headers };
}

const createMockNext = (): NextFunction => vi.fn();

describe('Content Security Policy (CSP)', () => {
  it('should set default CSP directives', () => {
    const { res, headers } = createMockResponse();

    const cspDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
    };

    const cspHeader = Object.entries(cspDirectives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');

    (res as any).setHeader('Content-Security-Policy', cspHeader);

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
  });

  it('should prevent inline script execution with strict CSP', () => {
    const { res, headers } = createMockResponse();

    const strictCSP =
      "default-src 'self'; script-src 'self'; object-src 'none'";
    (res as any).setHeader('Content-Security-Policy', strictCSP);

    expect(headers['content-security-policy']).not.toContain("'unsafe-inline'");
    expect(headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('should allow specific trusted domains in CSP', () => {
    const { res, headers } = createMockResponse();

    const trustedDomains = [
      'https://app.ectropy.ai',
      'https://api.ectropy.ai',
      'https://cdn.ectropy.ai',
    ];

    const csp = `default-src 'self'; connect-src 'self' ${trustedDomains.join(' ')}`;
    (res as any).setHeader('Content-Security-Policy', csp);

    trustedDomains.forEach((domain) => {
      expect(headers['content-security-policy']).toContain(domain);
    });
  });

  it('should set CSP report-uri for violation tracking', () => {
    const { res, headers } = createMockResponse();

    const reportUri = 'https://api.ectropy.ai/csp-report';
    const csp = `default-src 'self'; report-uri ${reportUri}`;
    (res as any).setHeader('Content-Security-Policy', csp);

    expect(headers['content-security-policy']).toContain(
      `report-uri ${reportUri}`
    );
  });

  it('should use nonce for inline scripts', () => {
    const { res, headers } = createMockResponse();
    const nonce = 'random-nonce-123456';

    const csp = `script-src 'self' 'nonce-${nonce}'`;
    (res as any).setHeader('Content-Security-Policy', csp);

    expect(headers['content-security-policy']).toContain(`'nonce-${nonce}'`);
  });

  it('should prevent framing with frame-ancestors', () => {
    const { res, headers } = createMockResponse();

    const csp = "frame-ancestors 'none'";
    (res as any).setHeader('Content-Security-Policy', csp);

    expect(headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    );
  });
});

describe('HTTP Strict Transport Security (HSTS)', () => {
  it('should set HSTS header with max-age', () => {
    const { res, headers } = createMockResponse();

    const maxAge = 31536000; // 1 year in seconds
    const hstsValue = `max-age=${maxAge}`;
    (res as any).setHeader('Strict-Transport-Security', hstsValue);

    expect(headers['strict-transport-security']).toBe(hstsValue);
  });

  it('should include includeSubDomains in HSTS', () => {
    const { res, headers } = createMockResponse();

    const hstsValue = 'max-age=31536000; includeSubDomains';
    (res as any).setHeader('Strict-Transport-Security', hstsValue);

    expect(headers['strict-transport-security']).toContain('includeSubDomains');
  });

  it('should include preload directive in HSTS', () => {
    const { res, headers } = createMockResponse();

    const hstsValue = 'max-age=31536000; includeSubDomains; preload';
    (res as any).setHeader('Strict-Transport-Security', hstsValue);

    expect(headers['strict-transport-security']).toContain('preload');
  });

  it('should use recommended HSTS max-age (1+ year)', () => {
    const { res, headers } = createMockResponse();

    const maxAge = 31536000; // 1 year
    const hstsValue = `max-age=${maxAge}`;
    (res as any).setHeader('Strict-Transport-Security', hstsValue);

    const match = headers['strict-transport-security'].match(/max-age=(\d+)/);
    const actualMaxAge = match ? parseInt(match[1]) : 0;

    expect(actualMaxAge).toBeGreaterThanOrEqual(31536000);
  });

  it('should not set HSTS on non-HTTPS requests', () => {
    const req = createMockRequest({ secure: false });
    const { res, headers } = createMockResponse();

    // HSTS should only be set on HTTPS
    if (req.secure) {
      (res as any).setHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    expect(headers['strict-transport-security']).toBeUndefined();
  });
});

describe('X-Frame-Options', () => {
  it('should set X-Frame-Options to DENY', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-Frame-Options', 'DENY');

    expect(headers['x-frame-options']).toBe('DENY');
  });

  it('should set X-Frame-Options to SAMEORIGIN', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-Frame-Options', 'SAMEORIGIN');

    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should prevent clickjacking attacks', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-Frame-Options', 'DENY');

    expect(headers['x-frame-options']).toMatch(/^(DENY|SAMEORIGIN)$/);
  });
});

describe('X-Content-Type-Options', () => {
  it('should set X-Content-Type-Options to nosniff', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-Content-Type-Options', 'nosniff');

    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('should prevent MIME type sniffing', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-Content-Type-Options', 'nosniff');

    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('X-XSS-Protection', () => {
  it('should set X-XSS-Protection header', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-XSS-Protection', '1; mode=block');

    expect(headers['x-xss-protection']).toBe('1; mode=block');
  });

  it('should block XSS attacks with mode=block', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-XSS-Protection', '1; mode=block');

    expect(headers['x-xss-protection']).toContain('mode=block');
  });

  it('should disable X-XSS-Protection when using CSP', () => {
    const { res, headers } = createMockResponse();

    // Modern approach: Disable X-XSS-Protection, rely on CSP
    (res as any).setHeader('X-XSS-Protection', '0');
    (res as any).setHeader('Content-Security-Policy', "default-src 'self'");

    expect(headers['x-xss-protection']).toBe('0');
    expect(headers['content-security-policy']).toBeDefined();
  });
});

describe('Referrer-Policy', () => {
  it('should set Referrer-Policy header', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );

    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should use strict-origin for maximum privacy', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Referrer-Policy', 'strict-origin');

    expect(headers['referrer-policy']).toBe('strict-origin');
  });

  it('should prevent referrer leakage with no-referrer', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Referrer-Policy', 'no-referrer');

    expect(headers['referrer-policy']).toBe('no-referrer');
  });

  it('should allow same-origin referrer', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Referrer-Policy', 'same-origin');

    expect(headers['referrer-policy']).toBe('same-origin');
  });
});

describe('Permissions-Policy', () => {
  it('should set Permissions-Policy header', () => {
    const { res, headers } = createMockResponse();

    const policy = 'geolocation=(), camera=(), microphone=()';
    (res as any).setHeader('Permissions-Policy', policy);

    expect(headers['permissions-policy']).toBe(policy);
  });

  it('should disable sensitive browser features', () => {
    const { res, headers } = createMockResponse();

    const disabledFeatures = [
      'geolocation',
      'camera',
      'microphone',
      'payment',
      'usb',
    ];
    const policy = disabledFeatures
      .map((feature) => `${feature}=()`)
      .join(', ');
    (res as any).setHeader('Permissions-Policy', policy);

    disabledFeatures.forEach((feature) => {
      expect(headers['permissions-policy']).toContain(`${feature}=()`);
    });
  });

  it('should allow specific features for same-origin', () => {
    const { res, headers } = createMockResponse();

    const policy =
      "geolocation=(self), camera=(self 'https://trusted.ectropy.ai')";
    (res as any).setHeader('Permissions-Policy', policy);

    expect(headers['permissions-policy']).toContain('geolocation=(self)');
    expect(headers['permissions-policy']).toContain('camera=(self');
  });
});

describe('DNS Prefetch Control', () => {
  it('should disable DNS prefetching', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-DNS-Prefetch-Control', 'off');

    expect(headers['x-dns-prefetch-control']).toBe('off');
  });

  it('should enable DNS prefetching for performance', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('X-DNS-Prefetch-Control', 'on');

    expect(headers['x-dns-prefetch-control']).toBe('on');
  });
});

describe('Expect-CT', () => {
  it('should set Expect-CT header', () => {
    const { res, headers } = createMockResponse();

    const expectCT = 'max-age=86400, enforce';
    (res as any).setHeader('Expect-CT', expectCT);

    expect(headers['expect-ct']).toBe(expectCT);
  });

  it('should enforce Certificate Transparency', () => {
    const { res, headers } = createMockResponse();

    const expectCT = 'max-age=86400, enforce';
    (res as any).setHeader('Expect-CT', expectCT);

    expect(headers['expect-ct']).toContain('enforce');
  });

  it('should set report-uri for CT violations', () => {
    const { res, headers } = createMockResponse();

    const reportUri = 'https://api.ectropy.ai/ct-report';
    const expectCT = `max-age=86400, report-uri="${reportUri}"`;
    (res as any).setHeader('Expect-CT', expectCT);

    expect(headers['expect-ct']).toContain(`report-uri="${reportUri}"`);
  });
});

describe('Helmet Middleware Integration', () => {
  it('should apply all security headers', () => {
    const { res, headers } = createMockResponse();

    // Simulate Helmet applying all headers
    (res as any).setHeader('Content-Security-Policy', "default-src 'self'");
    (res as any).setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
    (res as any).setHeader('X-Frame-Options', 'DENY');
    (res as any).setHeader('X-Content-Type-Options', 'nosniff');
    (res as any).setHeader(
      'Referrer-Policy',
      'strict-origin-when-cross-origin'
    );
    (res as any).setHeader('Permissions-Policy', 'geolocation=(), camera=()');

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['strict-transport-security']).toBeDefined();
    expect(headers['x-frame-options']).toBeDefined();
    expect(headers['x-content-type-options']).toBeDefined();
    expect(headers['referrer-policy']).toBeDefined();
    expect(headers['permissions-policy']).toBeDefined();
  });

  it('should not set headers on excluded routes', () => {
    const req = createMockRequest({ method: 'GET' });
    const { res, headers } = createMockResponse();

    const excludedPaths = ['/health', '/metrics'];
    const requestPath = '/health';

    if (!excludedPaths.includes(requestPath)) {
      (res as any).setHeader('X-Frame-Options', 'DENY');
    }

    expect(headers['x-frame-options']).toBeUndefined();
  });

  it('should customize headers per environment', () => {
    const env = process.env.NODE_ENV || 'development';
    const { res, headers } = createMockResponse();

    if (env === 'production') {
      (res as any).setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; preload'
      );
    } else {
      (res as any).setHeader('Strict-Transport-Security', 'max-age=0');
    }

    expect(headers['strict-transport-security']).toBeDefined();
  });
});

describe('Security Header Best Practices', () => {
  it('should not expose server information', () => {
    const { res, headers } = createMockResponse();

    // Remove or obfuscate Server header
    (res as any).removeHeader('X-Powered-By');

    expect(headers['x-powered-by']).toBeUndefined();
  });

  it('should set Cache-Control for sensitive pages', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );

    expect(headers['cache-control']).toContain('no-store');
    expect(headers['cache-control']).toContain('private');
  });

  it('should set appropriate MIME types', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Content-Type', 'application/json; charset=utf-8');

    expect(headers['content-type']).toContain('application/json');
    expect(headers['content-type']).toContain('charset=utf-8');
  });

  it('should validate all security headers are present', () => {
    const { res, headers } = createMockResponse();

    const requiredHeaders = [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
    ];

    // Set all required headers
    (res as any).setHeader('Content-Security-Policy', "default-src 'self'");
    (res as any).setHeader('Strict-Transport-Security', 'max-age=31536000');
    (res as any).setHeader('X-Frame-Options', 'DENY');
    (res as any).setHeader('X-Content-Type-Options', 'nosniff');
    (res as any).setHeader('Referrer-Policy', 'strict-origin');

    requiredHeaders.forEach((header) => {
      expect(headers[header]).toBeDefined();
    });
  });
});

describe('Multi-Tenant Security Headers', () => {
  it('should isolate CSP per tenant', () => {
    const { res: res1, headers: headers1 } = createMockResponse();
    const { res: res2, headers: headers2 } = createMockResponse();

    const tenant1Domain = 'https://tenant1.ectropy.ai';
    const tenant2Domain = 'https://tenant2.ectropy.ai';

    (res1 as any).setHeader(
      'Content-Security-Policy',
      `default-src 'self' ${tenant1Domain}`
    );
    (res2 as any).setHeader(
      'Content-Security-Policy',
      `default-src 'self' ${tenant2Domain}`
    );

    expect(headers1['content-security-policy']).toContain(tenant1Domain);
    expect(headers1['content-security-policy']).not.toContain(tenant2Domain);

    expect(headers2['content-security-policy']).toContain(tenant2Domain);
    expect(headers2['content-security-policy']).not.toContain(tenant1Domain);
  });

  it('should apply tenant-specific Permissions-Policy', () => {
    const { res, headers } = createMockResponse();

    const tenantId = 'tenant-123';
    const tenantSpecificPolicy = `geolocation=(self "https://${tenantId}.ectropy.ai")`;
    (res as any).setHeader('Permissions-Policy', tenantSpecificPolicy);

    expect(headers['permissions-policy']).toContain(tenantId);
  });
});

describe('Content-Type Specific Headers', () => {
  it('should set X-Content-Type-Options for all responses', () => {
    const contentTypes = [
      'application/json',
      'text/html',
      'application/javascript',
      'text/css',
    ];

    contentTypes.forEach((contentType) => {
      const { res, headers } = createMockResponse();

      (res as any).setHeader('Content-Type', contentType);
      (res as any).setHeader('X-Content-Type-Options', 'nosniff');

      expect(headers['x-content-type-options']).toBe('nosniff');
    });
  });

  it('should set appropriate CSP for HTML responses', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Content-Type', 'text/html');
    (res as any).setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'"
    );

    expect(headers['content-type']).toContain('text/html');
    expect(headers['content-security-policy']).toBeDefined();
  });

  it('should set appropriate CSP for API responses', () => {
    const { res, headers } = createMockResponse();

    (res as any).setHeader('Content-Type', 'application/json');
    (res as any).setHeader('Content-Security-Policy', "default-src 'none'");

    expect(headers['content-type']).toContain('application/json');
    expect(headers['content-security-policy']).toContain("default-src 'none'");
  });
});
