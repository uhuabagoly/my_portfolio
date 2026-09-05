import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const PINNED_PATH = path.join(PUBLIC_ROOT, 'data', 'pinned.json');
const PINNED_SYNC_SCRIPT = path.join(ROOT, 'scripts', 'sync-pinned-repositories.mjs');
const HOST = process.env.PORTFOLIO_LOCAL_HOST || '127.0.0.1';
const PORT = Number(process.env.PORTFOLIO_LOCAL_PORT || 8787);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

let pinnedSyncInFlight = null;

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        if (stdout.trim()) console.log(stdout.trim());
        if (stderr.trim()) console.warn(stderr.trim());
        resolve();
        return;
      }

      const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      reject(new Error(`Pinned sync sikertelen (exit ${code})${detail ? `:\n${detail}` : ''}`));
    });
  });
}

async function syncPinnedRepositories() {
  if (!pinnedSyncInFlight) {
    pinnedSyncInFlight = runNodeScript(PINNED_SYNC_SCRIPT)
      .finally(() => {
        pinnedSyncInFlight = null;
      });
  }

  return pinnedSyncInFlight;
}

async function readUsablePinnedFile() {
  try {
    const raw = await fs.readFile(PINNED_PATH, 'utf8');
    const payload = JSON.parse(raw);
    const validSources = new Set(['github-graphql-pinnedItems', 'github-profile-html']);

    if (!Array.isArray(payload?.repositories)) return null;
    if (!validSources.has(String(payload?.source || ''))) return null;
    return raw;
  } catch {
    return null;
  }
}

function addNoCacheHeaders(headers = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    ...headers,
  };
}

async function servePinnedJson(res) {
  try {
    await syncPinnedRepositories();
    const raw = await fs.readFile(PINNED_PATH, 'utf8');
    res.writeHead(200, addNoCacheHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(raw);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));

    const fallback = await readUsablePinnedFile();
    if (fallback !== null) {
      res.writeHead(200, addNoCacheHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Portfolio-Pinned-Source': 'stale-local-cache',
      }));
      res.end(fallback);
      return;
    }

    res.writeHead(503, addNoCacheHeaders({ 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify({
      error: 'A GitHub pinned lista lokálisan nem frissíthető.',
      detail: error instanceof Error ? error.message : String(error),
    }, null, 2));
  }
}

function resolvePublicPath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const absolute = path.resolve(PUBLIC_ROOT, relative);
  const relativeCheck = path.relative(PUBLIC_ROOT, absolute);

  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    return null;
  }

  return absolute;
}

async function serveStaticFile(filePath, res) {
  try {
    let stat = await fs.stat(filePath);
    let resolvedPath = filePath;

    if (stat.isDirectory()) {
      resolvedPath = path.join(filePath, 'index.html');
      stat = await fs.stat(resolvedPath);
    }

    if (!stat.isFile()) throw new Error('Not a file');

    const body = await fs.readFile(resolvedPath);
    const contentType = MIME_TYPES.get(path.extname(resolvedPath).toLowerCase()) || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 - Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (url.pathname === '/data/pinned.json') {
      await servePinnedJson(res);
      return;
    }

    const filePath = resolvePublicPath(url.pathname);
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 - Bad request');
      return;
    }

    await serveStaticFile(filePath, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 - Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('Portfolio local dev server elindult.');
  console.log(`Nyisd meg: http://${HOST}:${PORT}/`);
  console.log('PIN/UNPIN után csak frissítsd az oldalt (Ctrl+F5).');
  console.log('A /data/pinned.json minden kérésnél újra lekéri a GitHub pinned listát.');
  console.log('Leállítás: Ctrl+C');
  console.log('');
});
