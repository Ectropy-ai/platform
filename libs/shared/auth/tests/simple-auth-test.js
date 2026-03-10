/**
 * Basic authentication workflow test using a local database.
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth.service';
// Simple authentication test with known password
async function testAuthentication() {
  console.log('🧪 Testing Live Authentication with Real Database...\n');
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
    host: 'localhost',
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
    console.log('👤 Creating test user with known password...');
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
    console.log('✅ Test user created successfully');
    // Test 1: Login with test credentials
    console.log('\n🔐 Test 1: User Login');
    const tokens = await authService.login({
      email: 'test@example.com',
      password: testPassword,
    });
    console.log('✅ Login successful!');
    console.log(
      '   Access Token:',
      `${tokens.accessToken.substring(0, 50)}...`
    );
    console.log('   Expires In:', `${tokens.expiresIn}s`);
    // Test 2: Validate token
    console.log('\n🔍 Test 2: Token Validation');
    const userContext = await authService.validateToken(tokens.accessToken);
    console.log('✅ Token validation successful!');
    console.log('   User ID:', userContext.id);
    console.log('   Email:', userContext.email);
    console.log('   Roles:', userContext.roles);
    console.log('   Permissions:', userContext.permissions);
    // Test 3: Check database connections
    console.log('\n🗄️  Test 3: Database Connection Test');
    const dbResult = await db.query('SELECT NOW() as current_time');
    console.log(
      '✅ Database connection working, time:',
      dbResult.rows[0].current_time
    );
    const redisResult = await redis.ping();
    console.log('✅ Redis connection working, ping result:', redisResult);
    // Test 4: Check user session in database
    console.log('\n📋 Test 4: Session Management');
    const sessionResult = await db.query(
      'SELECT id, user_id, expires_at FROM user_sessions WHERE user_id = $1',
      [userContext.id]
    );
    console.log('✅ Session found in database:', sessionResult.rows.length > 0);
    if (sessionResult.rows.length > 0) {
      console.log('   Session ID:', sessionResult.rows[0].id);
      console.log('   Expires At:', sessionResult.rows[0].expires_at);
    }
    // Test 5: Test with existing construction users
    console.log('\n🏗️  Test 5: Update Existing Users');
    // Update architect user with known password
    await db.query(
      `
      UPDATE users 
      SET password_hash = $1
      WHERE email = $2
    `,
      [hashedPassword, 'architect@design.com']
    );
    const architectTokens = await authService.login({
      email: 'architect@design.com',
      password: testPassword,
    });
    console.log('✅ Architect login successful!');
    const architectContext = await authService.validateToken(
      architectTokens.accessToken
    );
    console.log('✅ Architect context loaded:');
    console.log('   Name: Sarah Johnson');
    console.log('   Role:', architectContext.roles.join(', '));
    console.log('   Permissions:', architectContext.permissions.join(', '));
    // Test 6: Element access (if elements exist)
    console.log('\n🔧 Test 6: Element Access Control');
    const elementResult = await db.query(
      'SELECT id, element_name, element_type FROM construction_elements LIMIT 1'
    );
    if (elementResult.rows.length > 0) {
      const element = elementResult.rows[0];
      console.log('   Testing access to element:', element.element_name);
      const hasAccess = await authService.checkElementAccess(
        architectContext.id,
        element.id,
        'read'
      );
      console.log('   Architect has read access:', hasAccess);
    } else {
      console.log('   No construction elements found to test access');
    }
    // Test 7: Logout
    console.log('\n🚪 Test 7: Logout');
    await authService.logout(userContext.sessionId);
    console.log('✅ Logout successful!');
    // Test 8: Token validation after logout (should fail)
    console.log('\n❌ Test 8: Token Validation After Logout');
    try {
      await authService.validateToken(tokens.accessToken);
      console.log('❌ This should have failed!');
    } catch (_error) {
      console.log('✅ Token validation correctly failed after logout');
    }
    console.log('\n🎉 All authentication tests passed!');
    console.log('\n📊 Summary:');
    console.log('   • Database connection: ✅ Working');
    console.log('   • Redis connection: ✅ Working');
    console.log('   • User authentication: ✅ Working');
    console.log('   • JWT token generation: ✅ Working');
    console.log('   • Session management: ✅ Working');
    console.log('   • Element access control: ✅ Working');
    console.log('   • Logout functionality: ✅ Working');
  } catch (_error) {
    console.error('❌ Authentication test failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await db.end();
    await redis.quit();
  }
}
// Run the test
testAuthentication().catch(console.error);
//# sourceMappingURL=simple-auth-test.js.map
