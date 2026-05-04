/**
 * Must be imported first from index.js (before any route/lib).
 * In ES modules, static imports run before index.js body, so dotenv.config()
 * placed after imports there runs too late — anthropic.js would already read empty env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(serverDir, '..');

/** Later entries override earlier ones (where override applies). */
const candidates = [
  { path: path.join(rootDir, '.env'), override: false },
  { path: path.join(rootDir, '.env.local'), override: true },
  { path: path.join(serverDir, '.env'), override: true },
  { path: path.join(serverDir, '.env.local'), override: true },
];

const loaded = [];

for (const { path: envPath, override } of candidates) {
  if (!fs.existsSync(envPath)) continue;
  const result = dotenv.config({ path: envPath, override });
  if (!result.error) {
    loaded.push(path.relative(rootDir, envPath) || '.env');
  }
}

if (loaded.length > 0) {
  console.log(`[study-logos] Loaded env: ${[...new Set(loaded)].join(', ')}`);
} else {
  console.warn(
    `[study-logos] No .env found. Create server/.env (copy from server/.env.example)`
  );
}
