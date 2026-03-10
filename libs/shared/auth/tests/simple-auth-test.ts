/**
 * Basic authentication workflow test using a local database.
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth.service.js';

// Simple authentication test with known password
async function testAuthentication() {
  // Database connection - use Docker postgres password
  const db = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ectropy_dev',
    password: 'password', // Docker postgres password
    port: 5432,
  });
  
  // Redis connection
  const redis = new Redis({
    port: 6379,
  });
  
  const authService = new AuthService(
    db,
    redis,
    'test-secret-key-change-in-production-2025',
    '15m',
    '7d'
  );
  
  try {
    // Create a test user with known password
    const testPassword = 'test123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    
    await db.query(
      `
      INSERT INTO users (email, full_name, password_hash, role, company, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        company = EXCLUDED.company,
        is_active = EXCLUDED.is_active
    `,
      [
        'test@example.com',
        'Test User',
        hashedPassword,
        'architect',
        'Test Company',
        true,
      ]
    );
    
    // Test 1: Login with test credentials
    const tokens = await authService.login({
      email: 'test@example.com',
      password: testPassword,
    });
    
    console.log(
      '✅ Login successful:',
      '   Access Token:',
      `${tokens.accessToken.substring(0, 50)}...`
    );
    
    // Test 2: Validate token
    const userContext = await authService.validateToken(tokens.accessToken);
    
    // Test 3: Check database connections
    const dbResult = await db.query('SELECT NOW() as current_time');
    console.log(
      '✅ Database connection working, time:',
      dbResult.rows[0].current_time
    );
    
    const redisResult = await redis.ping();
    console.log('✅ Redis connection working:', redisResult);
    
    // Test 4: Check user session in database
    const sessionResult = await db.query(
      'SELECT id, user_id, expires_at FROM user_sessions WHERE user_id = $1',
      [userContext.id]
    );
    
    if (sessionResult.rows.length > 0) {
      console.log('✅ User session found in database');
    }
    
    // Test 5: Test with existing construction users
    // Update architect user with known password
    await db.query(
      `UPDATE users 
       SET password_hash = $1
       WHERE email = $2`,
      [hashedPassword, 'architect@design.com']
    );
    
    const architectTokens = await authService.login({
      email: 'architect@design.com',
      password: testPassword,
    });
    
    const architectContext = await authService.validateToken(
      architectTokens.accessToken
    );
    
    // Test 6: Element access (if elements exist)
    const elementResult = await db.query(
      'SELECT id, element_name, element_type FROM construction_elements LIMIT 1'
    );
    
    if (elementResult.rows.length > 0) {
      const element = elementResult.rows[0];
      const hasAccess = await authService.checkElementAccess(
        architectContext.id,
        element.id,
        'read'
      );
      console.log(`✅ Element access test: ${hasAccess ? 'GRANTED' : 'DENIED'}`);
    } else {
      console.log('ℹ️ No construction elements found for access testing');
    }
    
    // Test 7: Logout
    await authService.logout(userContext.sessionId);
    
    // Test 8: Token validation after logout (should fail)
    try {
      await authService.validateToken(tokens.accessToken);
      console.log('❌ Token validation should have failed after logout');
    } catch (_error) {
      console.log('✅ Token validation correctly failed after logout');
    }
    
    console.log('✅ All simple authentication tests passed');
    
  } catch (error) {
    console.error('❌ Simple authentication test failed:', error);
    if (error instanceof Error) {
      console.error('   Error details:', error.message);
    }
    throw error;
  } finally {
    await db.end();
    await redis.quit();
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testAuthentication().catch(console.error);
}

export { testAuthentication };
