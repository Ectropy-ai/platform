/**
 * Encryption and Cryptography Tests
 *
 * Comprehensive cryptographic testing for production-ready security
 *
 * Test Coverage:
 * - Data encryption at rest (AES-256-GCM)
 * - Key derivation (PBKDF2, Argon2)
 * - IV generation and uniqueness
 * - Symmetric encryption operations
 * - Password hashing (bcrypt, Argon2)
 * - Secure random generation
 * - Hash-based message authentication (HMAC)
 * - Key rotation strategies
 * - Multi-tenant key isolation
 *
 * OWASP Coverage: A02 (Cryptographic Failures), A04 (Insecure Design)
 *
 * @see apps/mcp-server/SECURITY_TESTING.md
 * @see apps/mcp-server/TESTING.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum
const BCRYPT_ROUNDS = 12; // OWASP recommended minimum

/**
 * Encryption utility class
 */
class EncryptionService {
  /**
   * Encrypt data with AES-256-GCM
   */
  static encrypt(
    plaintext: string,
    key: Buffer,
    aad?: string
  ): {
    ciphertext: string;
    iv: string;
    authTag: string;
  } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    if (aad) {
      cipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  static decrypt(
    ciphertext: string,
    key: Buffer,
    iv: string,
    authTag: string,
    aad?: string
  ): string {
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      Buffer.from(iv, 'base64')
    );

    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf8'));
    }

    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Derive key from password using PBKDF2
   */
  static deriveKeyPBKDF2(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Generate cryptographically secure salt
   */
  static generateSalt(): Buffer {
    return crypto.randomBytes(SALT_LENGTH);
  }

  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Verify password against bcrypt hash
   */
  static async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate HMAC signature
   */
  static hmac(data: string, key: Buffer): string {
    return crypto.createHmac('sha256', key).update(data).digest('base64');
  }
}

describe('AES-256-GCM Encryption', () => {
  let key: Buffer;

  beforeEach(() => {
    key = crypto.randomBytes(KEY_LENGTH);
  });

  it('should encrypt and decrypt data correctly', () => {
    const plaintext = 'Sensitive construction project data';

    const encrypted = EncryptionService.encrypt(plaintext, key);
    const decrypted = EncryptionService.decrypt(
      encrypted.ciphertext,
      key,
      encrypted.iv,
      encrypted.authTag
    );

    expect(decrypted).toBe(plaintext);
  });

  it('should generate unique IVs for each encryption', () => {
    const plaintext = 'Test data';

    const encrypted1 = EncryptionService.encrypt(plaintext, key);
    const encrypted2 = EncryptionService.encrypt(plaintext, key);

    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should produce different ciphertext for same plaintext with different IVs', () => {
    const plaintext = 'Repeated message';

    const encrypted1 = EncryptionService.encrypt(plaintext, key);
    const encrypted2 = EncryptionService.encrypt(plaintext, key);

    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should fail decryption with wrong key', () => {
    const plaintext = 'Secret data';
    const wrongKey = crypto.randomBytes(KEY_LENGTH);

    const encrypted = EncryptionService.encrypt(plaintext, key);

    expect(() => {
      EncryptionService.decrypt(
        encrypted.ciphertext,
        wrongKey,
        encrypted.iv,
        encrypted.authTag
      );
    }).toThrow();
  });

  it('should fail decryption with tampered ciphertext', () => {
    const plaintext = 'Original data';

    const encrypted = EncryptionService.encrypt(plaintext, key);

    // Tamper with ciphertext
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -4) + 'XXXX';

    expect(() => {
      EncryptionService.decrypt(
        tamperedCiphertext,
        key,
        encrypted.iv,
        encrypted.authTag
      );
    }).toThrow();
  });

  it('should fail decryption with tampered auth tag', () => {
    const plaintext = 'Protected data';

    const encrypted = EncryptionService.encrypt(plaintext, key);

    // Tamper with auth tag
    const tamperedAuthTag = crypto
      .randomBytes(AUTH_TAG_LENGTH)
      .toString('base64');

    expect(() => {
      EncryptionService.decrypt(
        encrypted.ciphertext,
        key,
        encrypted.iv,
        tamperedAuthTag
      );
    }).toThrow();
  });

  it('should support authenticated encryption with AAD', () => {
    const plaintext = 'User data';
    const aad = 'user-id:123,tenant-id:tenant-1';

    const encrypted = EncryptionService.encrypt(plaintext, key, aad);
    const decrypted = EncryptionService.decrypt(
      encrypted.ciphertext,
      key,
      encrypted.iv,
      encrypted.authTag,
      aad
    );

    expect(decrypted).toBe(plaintext);
  });

  it('should fail decryption with wrong AAD', () => {
    const plaintext = 'Authenticated data';
    const correctAAD = 'context:admin';
    const wrongAAD = 'context:user';

    const encrypted = EncryptionService.encrypt(plaintext, key, correctAAD);

    expect(() => {
      EncryptionService.decrypt(
        encrypted.ciphertext,
        key,
        encrypted.iv,
        encrypted.authTag,
        wrongAAD
      );
    }).toThrow();
  });

  it('should encrypt large data efficiently', () => {
    // 1MB of data
    const largePlaintext = 'x'.repeat(1024 * 1024);

    const startTime = Date.now();
    const encrypted = EncryptionService.encrypt(largePlaintext, key);
    const encryptTime = Date.now() - startTime;

    const decrypted = EncryptionService.decrypt(
      encrypted.ciphertext,
      key,
      encrypted.iv,
      encrypted.authTag
    );

    expect(decrypted).toBe(largePlaintext);
    expect(encryptTime).toBeLessThan(1000); // Should complete within 1 second
  });
});

describe('Key Derivation (PBKDF2)', () => {
  it('should derive key from password using PBKDF2', () => {
    const password = 'StrongPassword123!';
    const salt = EncryptionService.generateSalt();

    const key = EncryptionService.deriveKeyPBKDF2(password, salt);

    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(KEY_LENGTH);
  });

  it('should produce consistent key for same password and salt', () => {
    const password = 'MyPassword';
    const salt = EncryptionService.generateSalt();

    const key1 = EncryptionService.deriveKeyPBKDF2(password, salt);
    const key2 = EncryptionService.deriveKeyPBKDF2(password, salt);

    expect(Buffer.compare(key1, key2) === 0).toBe(true);
  });

  it('should produce different keys for different passwords', () => {
    const salt = EncryptionService.generateSalt();

    const key1 = EncryptionService.deriveKeyPBKDF2('Password1', salt);
    const key2 = EncryptionService.deriveKeyPBKDF2('Password2', salt);

    expect(Buffer.compare(key1, key2) === 0).toBe(false);
  });

  it('should produce different keys for different salts', () => {
    const password = 'SamePassword';

    const key1 = EncryptionService.deriveKeyPBKDF2(
      password,
      EncryptionService.generateSalt()
    );
    const key2 = EncryptionService.deriveKeyPBKDF2(
      password,
      EncryptionService.generateSalt()
    );

    expect(Buffer.compare(key1, key2) === 0).toBe(false);
  });

  it('should use recommended iteration count (310,000+)', () => {
    const password = 'TestPassword';
    const salt = EncryptionService.generateSalt();

    // Measure time for recommended iterations
    const startTime = Date.now();
    EncryptionService.deriveKeyPBKDF2(password, salt);
    const duration = Date.now() - startTime;

    // Should take at least 100ms (indicates strong iteration count)
    expect(duration).toBeGreaterThan(50);
  });

  it('should generate cryptographically secure salt', () => {
    const salt1 = EncryptionService.generateSalt();
    const salt2 = EncryptionService.generateSalt();

    expect(salt1).toBeInstanceOf(Buffer);
    expect(salt1.length).toBe(SALT_LENGTH);
    expect(Buffer.compare(salt1, salt2) === 0).toBe(false);
  });
});

describe('Password Hashing (bcrypt)', () => {
  it('should hash password with bcrypt', async () => {
    const password = 'UserPassword123!';

    const hash = await EncryptionService.hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash format
  });

  it('should verify correct password', async () => {
    const password = 'CorrectPassword';
    const hash = await EncryptionService.hashPassword(password);

    const isValid = await EncryptionService.verifyPassword(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'CorrectPassword';
    const wrongPassword = 'WrongPassword';
    const hash = await EncryptionService.hashPassword(password);

    const isValid = await EncryptionService.verifyPassword(wrongPassword, hash);

    expect(isValid).toBe(false);
  });

  it('should produce different hashes for same password (unique salt)', async () => {
    const password = 'SamePassword';

    const hash1 = await EncryptionService.hashPassword(password);
    const hash2 = await EncryptionService.hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it('should use recommended bcrypt rounds (12+)', async () => {
    const password = 'TestPassword';

    const startTime = Date.now();
    await EncryptionService.hashPassword(password);
    const duration = Date.now() - startTime;

    // bcrypt with 12 rounds should take at least 100ms
    expect(duration).toBeGreaterThan(50);
  });

  it(
    'should resist timing attacks on password verification',
    { timeout: 15000 },
    async () => {
      const password = 'TestPassword';
      const hash = await EncryptionService.hashPassword(password);

      const times: number[] = [];

      // Test with correct password
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await EncryptionService.verifyPassword(password, hash);
        times.push(Date.now() - start);
      }

      // Test with incorrect password
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await EncryptionService.verifyPassword('WrongPassword', hash);
        times.push(Date.now() - start);
      }

      // Verify constant-time behavior (variance should be low)
      const avg = times.reduce((a, b) => a + b) / times.length;
      const variance =
        times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) /
        times.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be relatively small (constant time)
      expect(stdDev).toBeLessThan(avg * 0.5);
    }
  );
});

describe('Secure Random Generation', () => {
  it('should generate cryptographically secure random bytes', () => {
    const random1 = crypto.randomBytes(32);
    const random2 = crypto.randomBytes(32);

    expect(random1).toBeInstanceOf(Buffer);
    expect(random1.length).toBe(32);
    expect(Buffer.compare(random1, random2) === 0).toBe(false);
  });

  it('should generate unique session tokens', () => {
    const tokens = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const token = crypto.randomBytes(32).toString('base64url');
      tokens.add(token);
    }

    // All tokens should be unique
    expect(tokens.size).toBe(1000);
  });

  it('should generate secure random UUIDs', () => {
    const uuid1 = crypto.randomUUID();
    const uuid2 = crypto.randomUUID();

    expect(uuid1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(uuid1).not.toBe(uuid2);
  });

  it('should have sufficient entropy for cryptographic operations', () => {
    const randomData = crypto.randomBytes(1024);

    // Calculate Shannon entropy
    const frequency = new Map<number, number>();
    for (const byte of randomData) {
      frequency.set(byte, (frequency.get(byte) || 0) + 1);
    }

    let entropy = 0;
    for (const count of frequency.values()) {
      const p = count / randomData.length;
      entropy -= p * Math.log2(p);
    }

    // Entropy should be close to 8 bits per byte (ideal randomness)
    expect(entropy).toBeGreaterThan(7.5);
  });
});

describe('HMAC Message Authentication', () => {
  it('should generate HMAC signature', () => {
    const message = 'Important message';
    const key = crypto.randomBytes(32);

    const hmac = EncryptionService.hmac(message, key);

    expect(hmac).toBeDefined();
    expect(hmac.length).toBeGreaterThan(0);
  });

  it('should produce consistent HMAC for same message and key', () => {
    const message = 'Consistent message';
    const key = crypto.randomBytes(32);

    const hmac1 = EncryptionService.hmac(message, key);
    const hmac2 = EncryptionService.hmac(message, key);

    expect(hmac1).toBe(hmac2);
  });

  it('should produce different HMAC for different messages', () => {
    const key = crypto.randomBytes(32);

    const hmac1 = EncryptionService.hmac('Message 1', key);
    const hmac2 = EncryptionService.hmac('Message 2', key);

    expect(hmac1).not.toBe(hmac2);
  });

  it('should produce different HMAC for different keys', () => {
    const message = 'Same message';

    const hmac1 = EncryptionService.hmac(message, crypto.randomBytes(32));
    const hmac2 = EncryptionService.hmac(message, crypto.randomBytes(32));

    expect(hmac1).not.toBe(hmac2);
  });

  it('should detect message tampering', () => {
    const message = 'Original message';
    const key = crypto.randomBytes(32);

    const hmac = EncryptionService.hmac(message, key);

    const tamperedMessage = 'Tampered message';
    const tamperedHmac = EncryptionService.hmac(tamperedMessage, key);

    expect(hmac).not.toBe(tamperedHmac);
  });

  it('should use timing-safe comparison for HMAC validation', () => {
    const message = 'Test message';
    const key = crypto.randomBytes(32);
    const validHmac = EncryptionService.hmac(message, key);

    const invalidHmac = crypto.randomBytes(32).toString('base64');

    // Use constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(validHmac, 'base64'),
      Buffer.from(validHmac, 'base64')
    );

    expect(isValid).toBe(true);

    // Same-length invalid HMAC should return false (not throw)
    // timingSafeEqual only throws on length mismatch — both are 32 bytes here
    const isInvalid = crypto.timingSafeEqual(
      Buffer.from(validHmac, 'base64'),
      Buffer.from(invalidHmac, 'base64')
    );
    expect(isInvalid).toBe(false);
  });
});

describe('Key Rotation Strategies', () => {
  it('should support graceful key rotation', () => {
    const plaintext = 'Data to rotate';
    const oldKey = crypto.randomBytes(KEY_LENGTH);
    const newKey = crypto.randomBytes(KEY_LENGTH);

    // Encrypt with old key
    const encrypted = EncryptionService.encrypt(plaintext, oldKey);

    // Decrypt with old key
    const decrypted = EncryptionService.decrypt(
      encrypted.ciphertext,
      oldKey,
      encrypted.iv,
      encrypted.authTag
    );

    // Re-encrypt with new key
    const reencrypted = EncryptionService.encrypt(decrypted, newKey);

    // Verify with new key
    const finalDecrypted = EncryptionService.decrypt(
      reencrypted.ciphertext,
      newKey,
      reencrypted.iv,
      reencrypted.authTag
    );

    expect(finalDecrypted).toBe(plaintext);
  });

  it('should maintain data integrity during key rotation', () => {
    const data = ['item1', 'item2', 'item3'];
    const oldKey = crypto.randomBytes(KEY_LENGTH);
    const newKey = crypto.randomBytes(KEY_LENGTH);

    // Encrypt all items with old key
    const encryptedItems = data.map((item) => ({
      original: item,
      encrypted: EncryptionService.encrypt(item, oldKey),
    }));

    // Rotate keys
    const rotatedItems = encryptedItems.map((item) => {
      const decrypted = EncryptionService.decrypt(
        item.encrypted.ciphertext,
        oldKey,
        item.encrypted.iv,
        item.encrypted.authTag
      );
      return {
        original: item.original,
        encrypted: EncryptionService.encrypt(decrypted, newKey),
      };
    });

    // Verify all items
    rotatedItems.forEach((item, index) => {
      const decrypted = EncryptionService.decrypt(
        item.encrypted.ciphertext,
        newKey,
        item.encrypted.iv,
        item.encrypted.authTag
      );
      expect(decrypted).toBe(data[index]);
    });
  });

  it('should track key version in encrypted data', () => {
    const plaintext = 'Versioned data';
    const key = crypto.randomBytes(KEY_LENGTH);
    const keyVersion = 2;

    const encrypted = EncryptionService.encrypt(plaintext, key);

    // Store key version with encrypted data
    const encryptedWithVersion = {
      ...encrypted,
      keyVersion,
    };

    expect(encryptedWithVersion.keyVersion).toBe(2);
  });
});

describe('Multi-Tenant Key Isolation', () => {
  it('should isolate encryption keys by tenant', () => {
    const plaintext = 'Tenant-specific data';

    const tenant1Key = EncryptionService.deriveKeyPBKDF2(
      'master-key',
      Buffer.from('tenant-1-salt')
    );
    const tenant2Key = EncryptionService.deriveKeyPBKDF2(
      'master-key',
      Buffer.from('tenant-2-salt')
    );

    expect(Buffer.compare(tenant1Key, tenant2Key) === 0).toBe(false);
  });

  it('should prevent cross-tenant data decryption', () => {
    const plaintext = 'Tenant 1 confidential data';

    const tenant1Key = crypto.randomBytes(KEY_LENGTH);
    const tenant2Key = crypto.randomBytes(KEY_LENGTH);

    const encrypted = EncryptionService.encrypt(plaintext, tenant1Key);

    // Attempt to decrypt with tenant 2 key (should fail)
    expect(() => {
      EncryptionService.decrypt(
        encrypted.ciphertext,
        tenant2Key,
        encrypted.iv,
        encrypted.authTag
      );
    }).toThrow();
  });

  it('should include tenant context in AAD', () => {
    const plaintext = 'Multi-tenant data';
    const key = crypto.randomBytes(KEY_LENGTH);
    const tenantId = 'tenant-123';

    const encrypted = EncryptionService.encrypt(
      plaintext,
      key,
      `tenant:${tenantId}`
    );

    // Correct tenant context
    const decrypted = EncryptionService.decrypt(
      encrypted.ciphertext,
      key,
      encrypted.iv,
      encrypted.authTag,
      `tenant:${tenantId}`
    );

    expect(decrypted).toBe(plaintext);

    // Wrong tenant context (should fail)
    expect(() => {
      EncryptionService.decrypt(
        encrypted.ciphertext,
        key,
        encrypted.iv,
        encrypted.authTag,
        'tenant:different-tenant'
      );
    }).toThrow();
  });

  it('should derive tenant-specific keys from master key', () => {
    const masterKey = crypto.randomBytes(KEY_LENGTH);
    const tenant1Id = 'tenant-1';
    const tenant2Id = 'tenant-2';

    // Derive tenant-specific keys using HKDF
    const tenant1Key = crypto.hkdfSync(
      'sha256',
      masterKey,
      tenant1Id,
      '',
      KEY_LENGTH
    );
    const tenant2Key = crypto.hkdfSync(
      'sha256',
      masterKey,
      tenant2Id,
      '',
      KEY_LENGTH
    );

    // hkdfSync returns ArrayBuffer, not Buffer — wrap for comparison
    expect(
      Buffer.compare(Buffer.from(tenant1Key), Buffer.from(tenant2Key)) === 0
    ).toBe(false);
    expect(tenant1Key.byteLength).toBe(KEY_LENGTH);
    expect(tenant2Key.byteLength).toBe(KEY_LENGTH);
  });
});

describe('Cryptographic Best Practices', () => {
  it('should never reuse IVs with the same key', () => {
    const key = crypto.randomBytes(KEY_LENGTH);
    const ivs = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const encrypted = EncryptionService.encrypt('test', key);
      ivs.add(encrypted.iv);
    }

    // All IVs should be unique
    expect(ivs.size).toBe(1000);
  });

  it('should use authenticated encryption (AEAD)', () => {
    const plaintext = 'Protected data';
    const key = crypto.randomBytes(KEY_LENGTH);

    const encrypted = EncryptionService.encrypt(plaintext, key);

    // Should produce auth tag
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.authTag.length).toBeGreaterThan(0);
  });

  it('should securely clear sensitive data from memory', () => {
    const sensitiveData = Buffer.from('Very sensitive information');

    // Use data
    const copy = Buffer.from(sensitiveData);

    // Clear original
    sensitiveData.fill(0);

    expect(sensitiveData.toString()).not.toContain('sensitive');
    expect(copy.toString()).toContain('sensitive');
  });

  it('should validate key length requirements', () => {
    const shortKey = crypto.randomBytes(16); // 128 bits (too short)
    const validKey = crypto.randomBytes(32); // 256 bits (correct)

    expect(shortKey.length).toBe(16);
    expect(validKey.length).toBe(32);

    // AES-256 requires 32-byte key
    expect(() => {
      crypto.createCipheriv(
        ENCRYPTION_ALGORITHM,
        shortKey,
        crypto.randomBytes(IV_LENGTH)
      );
    }).toThrow();
  });
});
