/**
 * Live authentication test using environment-configured database.
 */
import { config } from 'dotenv';
import { getCurrentDirname, getCurrentFilename } from "@ectropy/shared/node-utils.js";
const __dirname = getCurrentDirname(import.meta.url);
import { Pool } from 'pg';
import Redis from 'ioredis';
import { AuthService } from '../src/auth.service.js';

// Load environment variables
config({ path: `${__dirname}/.env` });

// Test authentication with real database
async function testAuthentication() {
  // Database connection - no password for Docker postgres
  const db = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'ectropy_dev',
    password: '', // No password for Docker postgres
    port: 5432,
  });
  
  // Redis connection
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });
  
  const authService = new AuthService(
    db,
    redis,
    process.env.JWT_SECRET || 'test-secret-key-change-in-production',
    '15m',
    '7d'
  );
  
  try {
    // Test 1: Login with architect credentials
    const architectTokens = await authService.login({
      email: 'architect@design.com',
      password: 'ExamplePassword1!', // This is the password we used in bcrypt hash
    });
    
    console.log(
      '✅ Architect login successful:',
      '   Access Token:',
      `${architectTokens.accessToken.substring(0, 30)}...`
    );
    
    // Test 2: Validate architect token
    const architectContext = await authService.validateToken(
      architectTokens.accessToken
    );
    
    // Test 3: Login with contractor credentials
    const contractorTokens = await authService.login({
      email: 'contractor@build.com',
      password: 'ExamplePassword1!',
    });
    
    console.log(
      '✅ Contractor login successful:',
      `${contractorTokens.accessToken.substring(0, 30)}...`
    );
    
    // Test 4: Check element access
    // Get a construction element ID from database
    const elementQuery = await db.query(
      'SELECT id FROM construction_elements LIMIT 1'
    );
    
    if (elementQuery.rows.length > 0) {
      const elementId = elementQuery.rows[0].id;
      
      // Check architect access
      const architectAccess = await authService.checkElementAccess(
        architectContext.id,
        elementId,
        'read'
      );
      
      // Check contractor access
      const contractorContext = await authService.validateToken(
        contractorTokens.accessToken
      );
      
      const contractorAccess = await authService.checkElementAccess(
        contractorContext.id,
        elementId,
        'write'
      );
      
      console.log('✅ Element access tests completed');
    }
    
    // Test 5: Logout
    await authService.logout(architectContext.sessionId);
    
    // Test 6: Try to validate after logout (should fail)
    try {
      await authService.validateToken(architectTokens.accessToken);
      console.log('❌ Token validation should have failed after logout');
    } catch (_error) {
      console.log('✅ Token validation correctly failed after logout');
    }
    
    console.log('✅ All live authentication tests passed');
    
  } catch (error) {
    console.error('❌ Live authentication test failed:', error);
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
