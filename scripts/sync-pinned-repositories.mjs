import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'public', 'data', 'pinned.json');

const username =
  process.env.PORTFOLIO_GITHUB_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  'uhuabagoly';

const token = String(
  process.env.PORTFOLIO_GITHUB_TOKEN ||
  process.env.GITHUB_TOKEN ||
  ''
).trim();

const QUERY = `
  query PortfolioPinnedRepositories($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: [REPOSITORY]) {
        nodes {
          ... on Repository {
            nameWithOwner
            isPrivate
          }
        }
      }
    }
  }
`;

async function main() {
  let result = null;
  let graphqlError = null;

  if (token) {
    try {
      result = await fetchPinnedWithGraphql();
    } catch (error) {
      graphqlError = error instanceof Error ? error.message : String(error);
      console.warn(`GraphQL pinned sync failed; trying public profile fallback: ${graphqlError}`);
    }
  }

  if (!result) {
    result = await fetchPinnedFromPublicProfile();
  }

  const repositories = uniqueRepositories(result.repositories);
  const previous = await readPreviousSnapshot();
  const unchanged =
    previous &&
    previous.source === result.source &&
    arraysEqual(previous.repositories, repositories);

  const snapshot = {
    username,
    generated_at: unchanged && previous.generated_at
      ? previous.generated_at
      : new Date().toISOString(),
    source: result.source,
    count: repositories.length,
    repositories,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  console.log(`Pinned sync OK via ${result.source}: ${repositories.length} public repository pin(s).`);
  repositories.forEach((name, index) => console.log(`${index + 1}. ${name}`));
}

async function readPreviousSnapshot() {
  try {
    const raw = await fs.readFile(OUTPUT, 'utf8');
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => String(value) === String(b[index]));
}

async function fetchPinnedWithGraphql() {
  const data = await graphql(QUERY, { login: username });
  const nodes = data?.user?.pinnedItems?.nodes;

  if (!Array.isArray(nodes)) {
    throw new Error(`A GitHub profil pinnedItems listája nem érhető el: ${username}`);
  }

  return {
    source: 'github-graphql-pinnedItems',
    repositories: nodes
      .filter((node) => node && node.isPrivate !== true)
      .map((node) => String(node.nameWithOwner || '').trim())
      .filter(Boolean),
  };
}

async function fetchPinnedFromPublicProfile() {
  const response = await fetch(`https://github.com/${encodeURIComponent(username)}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'uhuabagoly-portfolio-pinned-sync',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub profil HTML hiba (${response.status})`);
  }

  const html = await response.text();
  const pinnedRegion = extractPinnedRegion(html);
  const repositories = extractRepositoryLinks(pinnedRegion);

  if (!repositories.length && !hasPinnedSection(pinnedRegion)) {
    throw new Error('A GitHub profil Pinned szekciója nem volt felismerhető.');
  }

  return {
    source: 'github-profile-html',
    repositories,
  };
}

function extractPinnedRegion(html) {
  const text = String(html || '');
  const markers = [
    /<h2[^>]*>\s*Pinned\s*<\/h2>/i,
    /aria-label=["']Pinned["']/i,
    /data-testid=["'][^"']*pinned[^"']*["']/i,
    /pinned-item-list-item/i,
  ];

  let start = -1;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match && (start === -1 || match.index < start)) start = match.index;
  }

  if (start === -1) return '';

  // A pinned rész maximum hat kártya; egy korlátozott szelet elég, és
  // megakadályozza, hogy a profil más részeinek repository linkjeit felvegyük.
  return text.slice(start, start + 120000);
}

function hasPinnedSection(region) {
  return /Pinned|pinned-item-list-item|aria-label=["']Pinned["']/i.test(String(region || ''));
}

function extractRepositoryLinks(region) {
  const repositories = [];
  const seen = new Set();
  const text = String(region || '');

  for (const match of text.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/data-hovercard-type=["']repository["']/i.test(tag)) continue;

    const hrefMatch = /href=["']\/([^\/"'?#]+)\/([^\/"'?#]+)["']/i.exec(tag);
    if (!hrefMatch) continue;

    const fullName = `${decodeHtml(hrefMatch[1])}/${decodeHtml(hrefMatch[2])}`;
    const key = fullName.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    repositories.push(fullName);
    if (repositories.length >= 6) break;
  }

  return repositories;
}

function uniqueRepositories(values) {
  const repositories = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const fullName = String(value || '').trim();
    const key = fullName.toLowerCase();
    if (!fullName || seen.has(key)) continue;
    seen.add(key);
    repositories.push(fullName);
  }

  return repositories.slice(0, 6);
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"');
}

async function graphql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'uhuabagoly-portfolio-pinned-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`GitHub GraphQL HTTP hiba (${response.status}): ${JSON.stringify(payload).slice(0, 700)}`);
  }

  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(
      'GitHub GraphQL hiba: ' +
      payload.errors.map((error) => error?.message || 'Ismeretlen GraphQL hiba').join('; ')
    );
  }

  return payload?.data || null;
}

await main();
