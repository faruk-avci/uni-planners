import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env so the import scripts share one DB config with the API.
const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

// PostgreSQL connection config, env-driven (defaults match a local system install).
export function getDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'ozu_user',
    password: process.env.DB_PASSWORD || 'password123',
    database: process.env.DB_NAME || 'ozu_schedule',
  };
}
