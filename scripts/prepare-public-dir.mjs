import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const EXCLUDE = new Set([
  '.git',
  '.github',
  'scripts',
  'node_modules',
  'public',
  'package.json',
  'package-lock.json',
]);

await fs.rm(PUBLIC_DIR, { recursive: true, force: true });
await fs.mkdir(PUBLIC_DIR, { recursive: true });

for (const entry of await fs.readdir(ROOT, { withFileTypes: true })) {
  if (EXCLUDE.has(entry.name)) continue;
  await copyRecursive(path.join(ROOT, entry.name), path.join(PUBLIC_DIR, entry.name));
}

console.log('Public Pages directory prepared.');

async function copyRecursive(source, destination) {
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      await copyRecursive(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }

  await fs.copyFile(source, destination);
}
