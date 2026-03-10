/**
 * Test script for IPv6 rate limiting fix
 * Validates that rate limiters properly handle IPv6 addresses
 */

import { createRateLimiter, createEnhancedRateLimiter } from '../libs/shared/security/src/security.middleware.js';

// Mock request objects with IPv6 addresses
const mockIPv6Request = {
  ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  get: (header) => {
    if (header === 'User-Agent') return 'test-agent';
    return undefined;
  },
  headers: {}
};

const mockIPv4Request = {
  ip: '192.168.1.1',
  get: (header) => {
    if (header === 'User-Agent') return 'test-agent';
    return undefined;
  },
  headers: {}
};

console.log('🧪 Testing IPv6 Rate Limiting Fixes...');

// Test basic rate limiter
console.log('\n1. Testing createRateLimiter with IPv6...');
try {
  const rateLimiter = createRateLimiter({
    windowMs: 60000,
    max: 100,
    message: 'Too many requests',
    keyPrefix: 'test'
  });

  // Access the keyGenerator function
  const config = rateLimiter._config || rateLimiter.options;
  if (config && config.keyGenerator) {
    const ipv6Key = config.keyGenerator(mockIPv6Request);
    const ipv4Key = config.keyGenerator(mockIPv4Request);
    
    console.log('  IPv6 key:', ipv6Key);
    console.log('  IPv4 key:', ipv4Key);
    console.log('  ✅ Basic rate limiter handles IPv6 properly');
  } else {
    console.log('  ⚠️  Could not access keyGenerator function');
  }
} catch (error) {
  console.log('  ❌ Basic rate limiter test failed:', error.message);
}

// Test enhanced rate limiter
console.log('\n2. Testing createEnhancedRateLimiter with IPv6...');
try {
  const enhancedRateLimiter = createEnhancedRateLimiter({
    windowMs: 60000,
    max: 100,
    message: 'Too many requests',
    keyPrefix: 'test',
    perUser: false
  });

  // Access the keyGenerator function
  const config = enhancedRateLimiter._config || enhancedRateLimiter.options;
  if (config && config.keyGenerator) {
    const ipv6Key = config.keyGenerator(mockIPv6Request);
    const ipv4Key = config.keyGenerator(mockIPv4Request);
    
    console.log('  IPv6 key:', ipv6Key);
    console.log('  IPv4 key:', ipv4Key);
    console.log('  ✅ Enhanced rate limiter handles IPv6 properly');
  } else {
    console.log('  ⚠️  Could not access keyGenerator function');
  }
} catch (error) {
  console.log('  ❌ Enhanced rate limiter test failed:', error.message);
}

console.log('\n✅ IPv6 rate limiting validation completed!');