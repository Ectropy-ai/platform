import fs from 'fs';
import path from 'path';

const moduleDir = __dirname;
const configPath = path.resolve(moduleDir, '../feature-flags.json');
let fileFlags: Record<string, boolean> = {};

if (fs.existsSync(configPath)) {
  try {
    fileFlags = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    fileFlags = {};
  }
}

export function isFeatureEnabled(flag: string): boolean {
  const envKey = `MCP_FEATURE_${flag.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === 'true';
  }
  return Boolean(fileFlags[flag]);
}
