import { execSync } from 'child_process';

export default async function globalTeardown(): Promise<void> {
  // ENTERPRISE: Skip Docker cleanup for remote testing
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;
  if (
    baseUrl &&
    (baseUrl.startsWith('https://') ||
      (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')))
  ) {
    console.log('\n🌐 Remote testing mode - no local cleanup needed\n');
    return;
  }

  console.log('\n🧹 Cleaning up...\n');
  try {
    execSync('docker compose -f docker-compose.test.yml down -v', {
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log('✅ Cleanup complete\n');
  } catch (error) {
    console.error('⚠️ Cleanup failed:', error);
  }
}
