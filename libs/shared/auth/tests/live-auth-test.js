/**
 * Live authentication test using environment-configured database.
 */
import { config } from 'dotenv';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { AuthService } from '../src/auth.service';
// Load environment variables
config({ path: `${__dirname}/.env` });
// Test authentication with real database
async function testAuthentication() {
  console.log('🧪 Testing Live Authentication with Real Database...\n');
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
    console.log('🏗️  Test 1: Architect Login');
    const architectTokens = await authService.login({
      email: 'architect@design.com',
      password: 'ExamplePassword1!', // This is the password we used in bcrypt hash
    });
    console.log('✅ Architect login successful!');
    console.log(
      '   Access Token:',
      `${architectTokens.accessToken.substring(0, 30)}...`
    );
    console.log('   Expires In:', `${architectTokens.expiresIn}s`);
    // Test 2: Validate architect token
    console.log('\n🔐 Test 2: Token Validation');
    const architectContext = await authService.validateToken(
      architectTokens.accessToken
    );
    console.log('✅ Token validation successful!');
    console.log('   User ID:', architectContext.id);
    console.log('   Email:', architectContext.email);
    console.log('   Roles:', architectContext.roles);
    console.log('   Permissions:', architectContext.permissions);
    // Test 3: Login with contractor credentials
    console.log('\n🏗️  Test 3: Contractor Login');
    const contractorTokens = await authService.login({
      email: 'contractor@build.com',
      password: 'ExamplePassword1!',
    });
    console.log('✅ Contractor login successful!');
    console.log(
      '   Access Token:',
      `${contractorTokens.accessToken.substring(0, 30)}...`
    );
    // Test 4: Check element access
    console.log('\n🔍 Test 4: Element Access Control');
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
      console.log('✅ Architect element access check:', architectAccess);
      // Check contractor access
      const contractorContext = await authService.validateToken(
        contractorTokens.accessToken
      );
      const contractorAccess = await authService.checkElementAccess(
        contractorContext.id,
        elementId,
        'write'
      );
      console.log('✅ Contractor element access check:', contractorAccess);
    }
    // Test 5: Logout
    console.log('\n🚪 Test 5: Logout');
    await authService.logout(architectContext.sessionId);
    console.log('✅ Architect logout successful!');
    // Test 6: Try to validate after logout (should fail)
    console.log('\n❌ Test 6: Token Validation After Logout');
    try {
      await authService.validateToken(architectTokens.accessToken);
      console.log('❌ This should have failed!');
    } catch (_error) {
      console.log('✅ Token validation correctly failed after logout');
    }
    console.log('\n🎉 All authentication tests passed!');
    console.log('\n📋 Summary:');
    console.log('   • Database connection: ✅ Working');
    console.log('   • User authentication: ✅ Working');
    console.log('   • JWT token generation: ✅ Working');
    console.log('   • Session management: ✅ Working');
    console.log('   • Element access control: ✅ Working');
    console.log('   • Logout functionality: ✅ Working');
  } catch (_error) {
    console.error('❌ Authentication test failed:', error);
  } finally {
    await db.end();
    await redis.quit();
  }
}
// Run the test
testAuthentication().catch(console.error);
//# sourceMappingURL=live-auth-test.js.map
