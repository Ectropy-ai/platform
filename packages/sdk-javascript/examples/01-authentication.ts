/**
 * Example 1: Authentication
 * 
 * This example demonstrates how to:
 * - Login with email and password
 * - Access authenticated user profile
 * - Refresh tokens
 * - Logout
 */

import { EctropyClient } from '@ectropy/sdk';

async function main() {
  const client = new EctropyClient({
    baseURL: 'https://staging.ectropy.ai',
  });

  try {
    // Login
    console.log('Logging in...');
    const loginResponse = await client.auth.login({
      email: 'user@example.com',
      password: 'your-password',
    });

    console.log('Login successful!');
    console.log('User:', loginResponse.user.email);
    console.log('Role:', loginResponse.user.role);
    console.log('Access token expires in:', loginResponse.tokens.expiresIn, 'seconds');

    // Get current user profile
    console.log('\nFetching user profile...');
    const profile = await client.auth.me();
    console.log('Profile:', {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      name: `${profile.firstName} ${profile.lastName}`,
    });

    // Store refresh token for later use
    const refreshToken = loginResponse.tokens.refreshToken;

    // Simulate token expiration - refresh the access token
    console.log('\nRefreshing access token...');
    await client.auth.refresh(refreshToken);
    console.log('Token refreshed successfully!');

    // Logout
    console.log('\nLogging out...');
    await client.auth.logout();
    console.log('Logout successful!');

  } catch (error: any) {
    console.error('Error:', error.message || error);
    if (error.statusCode) {
      console.error(`Status: ${error.statusCode}`);
    }
  }
}

main();
