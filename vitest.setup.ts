// Vitest setup: Load .env.staging at test runtime
import { config } from 'dotenv';
import { resolve } from 'path';

const result = config({ path: resolve(process.cwd(), '.env.staging') });

if (result.error && result.error.code !== 'ENOENT') {
  console.warn('Warning: Failed to load .env.staging:', result.error.message);
}

// Verify staging credentials are available
const stagingUrl = process.env.PAWOS_STAGING_URL;
const anonKey = process.env.PAWOS_STAGING_ANON_KEY;
const serviceKey = process.env.PAWOS_STAGING_SERVICE_KEY;

if (anonKey || serviceKey) {
  console.log('[vitest.setup] Staging environment configured');
} else {
  console.log('[vitest.setup] Staging credentials not configured — Phase3 tests will be marked BLOCKED');
}
