import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PROJECTS_PATH = path.join(DATA_DIR, 'projects.json');
const META_PATH = path.join(DATA_DIR, 'github_sync_meta.json');

const CONFIG = {
  username:
    process.env.PORTFOLIO_GITHUB_USERNAME ||
    process.env.GITHUB_USERNAME ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    'uhuabagoly',
  token:
    process.env.PORTFOLIO_GITHUB_TOKEN ||
    process.env.GH_API_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '',
  repoLimit: Number(process.env.PORTFOLIO_REPO_LIMIT || 100),
  includeForks: false,
  includeArchived: false,
  readmeCharLimit: Number(process.env.PORTFOLIO_README_CHAR_LIMIT || 220),
};

const ACCENTS = ['accent-red', 'accent-orange', 'accent-yellow'];

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let existingProjects = [];
  try {
    existingProjects = JSON.parse(await fs.readFile(PROJECTS_PATH, 'utf8'));
    if (!Array.isArray(existingProjects)) existingProjects = [];
  } catch {
    existingProjects = [];
  }

  const manualProjects = existingProjects.filter((project) => project?.source !== 'github');

  try {
    const repos = await fetchRepositories(CONFIG);
    const githubProjects = [];

    for (const [index, repo] of repos.entries()) {
      const manifest = await fetchOptionalManifest(repo, CONFIG);
      if (manifest?.hidden === true) continue;
      const readme = await fetchReadmeBundle(repo, CONFIG);
      githubProjects.push(buildProject(repo, manifest, readme, index));
    }

    const nextProjects = [...githubProjects, ...manualProjects];
    await fs.writeFile(PROJECTS_PATH, JSON.stringify(nextProjects, null, 4), 'utf8');

    const meta = {
      status: 'ok',
      last_synced: new Date().toISOString(),
      imported_count: githubProjects.length,
      repo_count: repos.length,
      manifest_count: githubProjects.filter((item) => item.__hasManifest).length,
      username: CONFIG.username,
      cache_file: 'data/projects.json',
      message: 'GitHub projects were imported successfully with repo stats and README-backed descriptions.',
    };

    await fs.writeFile(META_PATH, JSON.stringify(meta, null, 4), 'utf8');
    console.log(`Synced ${githubProjects.length} GitHub project(s) for ${CONFIG.username}.`);
  } catch (error) {
    const meta = {
      status: 'error',
      last_synced: new Date().toISOString(),
      imported_count: existingProjects.filter((project) => project?.source === 'github').length,
      repo_count: 0,
      manifest_count: 0,
      username: CONFIG.username,
      cache_file: 'data/projects.json',
      message: error instanceof Error ? error.message : String(error),
    };

    await fs.writeFile(META_PATH, JSON.stringify(meta, null, 4), 'utf8');
    console.error(meta.message);
    process.exitCode = 1;
  }
}

function apiHeaders(config, extra = {}) {
  const headers = {
    'User-Agent': 'uhuabagoly-portfolio-sync',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  return headers;
}

async function fetchJson(url, config, extraHeaders = {}) {
  const response = await fetch(url, { headers: apiHeaders(config, extraHeaders) });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API hiba (${response.status}) ${url}: ${message.slice(0, 160)}`);
  }
  return response.json();
}

async function fetchText(url, config, extraHeaders = {}) {
  const response = await fetch(url, { headers: apiHeaders(config, extraHeaders) });
  if (!response.ok) {
    throw new Error(`GitHub letöltési hiba (${response.status}) ${url}`);
  }
  return response.text();
}

async function fetchRepositories(config) {
  const repos = [];
  let page = 1;
  const perPage = Math.min(100, Math.max(1, config.repoLimit));

  while (repos.length < config.repoLimit) {
    const url = `https://api.github.com/users/${encodeURIComponent(config.username)}/repos?sort=updated&direction=desc&type=owner&per_page=${perPage}&page=${page}`;
    const data = await fetchJson(url, config);

    if (!Array.isArray(data) || data.length === 0) break;

    for (const repo of data) {
      if (!config.includeForks && repo.fork) continue;
      if (!config.includeArchived && repo.archived) continue;
      repos.push(repo);
      if (repos.length >= config.repoLimit) break;
    }

    if (data.length < perPage) break;
    page += 1;
  }

  return repos;
}

async function fetchOptionalManifest(repo, config) {
  const owner = repo.owner?.login;
  const name = repo.name;
  const branch = repo.default_branch || 'main';
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodeURIComponent('portfolio.json')}?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(url, { headers: apiHeaders(config) });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Nem sikerült lekérni a portfolio.json fájlt ehhez: ${repo.full_name} (${response.status})`);
  }

  const data = await response.json();
  if (!data?.content) return null;

  try {
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchReadmeBundle(repo, config) {
  const owner = repo.owner?.login;
  const name = repo.name;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/readme`;

  const response = await fetch(url, { headers: apiHeaders(config) });
  if (response.status === 404) return { excerpt: null, image: null };
  if (!response.ok) return { excerpt: null, image: null };

  const data = await response.json();
  let markdown = null;

  if (data?.content) {
    try {
      markdown = Buffer.from(data.content, 'base64').toString('utf8');
    } catch {
      markdown = null;
    }
  }

  if (!markdown && data?.download_url) {
    try {
      markdown = await fetchText(data.download_url, config, { Accept: 'text/plain' });
    } catch {
      markdown = null;
    }
  }

  if (!markdown) {
    return { excerpt: null, image: null };
  }

  return {
    excerpt: markdownExcerpt(markdown, config.readmeCharLimit),
    image: extractReadmeImage(markdown, repo),
  };
}

function extractReadmeImage(markdown, repo) {
  const candidates = [];
  const markdownMatches = markdown.matchAll(/!\[[^\]]*\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi);
  for (const match of markdownMatches) {
    candidates.push(match[1]);
  }

  const htmlMatches = markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of htmlMatches) {
    candidates.push(match[1]);
  }

  for (const candidate of candidates) {
    const resolved = resolveRepoAssetUrl(candidate, repo);
    if (resolved) return resolved;
  }

  return null;
}

function resolveRepoAssetUrl(assetPath, repo) {
  if (!assetPath) return null;

  let value = String(assetPath).trim();
  if (!value || value.startsWith('data:')) return null;

  value = value.replace(/^<|>$/g, '');
  value = value.replace(/[?#].*$/, '');

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;

  const owner = encodeURIComponent(repo.owner?.login || '');
  const name = encodeURIComponent(repo.name || '');
  const branch = encodeURIComponent(repo.default_branch || 'main');

  if (value.startsWith('/')) {
    return `https://raw.githubusercontent.com/${owner}/${name}/${branch}${value}`;
  }

  const normalized = value.replace(/^(\.\/)+/, '').replace(/^\//, '');
  if (!normalized) return null;

  return `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

function markdownExcerpt(markdown, limit = 220) {
  const text = String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function buildProject(repo, manifest, readme, index) {
  const category = normalizeCategory(manifest?.category || inferCategory(repo));
  const language = manifest?.language || repo.language || null;
  const accent = manifest?.accent || ACCENTS[index % ACCENTS.length];
  const createdAt = repo.created_at || null;
  const updatedAt = repo.pushed_at || repo.updated_at || null;
  const title = manifest?.title || humanRepoName(repo.name);
  const description =
    manifest?.summary ||
    manifest?.description ||
    readme.excerpt ||
    repo.description ||
    `${title} repository on GitHub.`;

  const cover = manifest?.cover ? resolveRepoAssetUrl(manifest.cover, repo) : null;
  const image = cover || readme.image || `https://opengraph.githubassets.com/portfolio-sync/${repo.full_name}`;
  const tags = Array.isArray(manifest?.tags) && manifest.tags.length
    ? manifest.tags.map(String)
    : [language].filter(Boolean);

  const project = {
    title,
    type: manifest?.type || inferType(category, language),
    category,
    image,
    image_source: cover ? 'manifest' : (readme.image ? 'readme' : 'github'),
    description,
    description_source: manifest?.summary || manifest?.description ? 'portfolio.json' : (readme.excerpt ? 'README excerpt' : 'GitHub metadata'),
    tags,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    live: manifest?.liveUrl || manifest?.live || repo.homepage || null,
    github: repo.html_url,
    featured: Boolean(manifest?.featured),
    year: createdAt ? String(new Date(createdAt).getUTCFullYear()) : '',
    accent,
    source: 'github',
    repo: repo.name,
    github_full_name: repo.full_name,
    sync_note: 'Synced straight from GitHub metadata',
    order: Number.isFinite(Number(manifest?.order)) ? Number(manifest.order) : 900,
    created_at: createdAt,
    updated_at: updatedAt,
    language,
    homepage: repo.homepage || null,
    default_branch: repo.default_branch || 'main',
    visibility: repo.visibility || (repo.private ? 'private' : 'public'),
    archived: Boolean(repo.archived),
    github_stats: {
      stars: Number(repo.stargazers_count || 0),
      forks: Number(repo.forks_count || 0),
      watchers: Number(repo.watchers_count || 0),
      issues: Number(repo.open_issues_count || 0),
      size: Number(repo.size || 0),
    },
  };

  Object.defineProperty(project, '__hasManifest', {
    value: Boolean(manifest),
    enumerable: false,
  });

  return project;
}

function inferCategory(repo) {
  const value = `${repo.language || ''} ${repo.name || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
  if (/unity|godot|game|csharp/.test(value)) return 'game';
  if (/python|discord|bot/.test(value)) return 'python';
  if (/arduino|raspberry|hardware|electronics|iot/.test(value)) return 'hardware';
  if (/html|css|php|javascript|typescript|react|next|web|site/.test(value)) return 'web';
  return 'system';
}

function inferType(category, language) {
  if (category === 'web') return 'Website / Web Build';
  if (category === 'python') return 'Python Tool';
  if (category === 'game') return 'Game / Prototype';
  if (category === 'hardware') return 'Hardware / Automation';
  return language ? `${language} Project` : 'System Project';
}

function normalizeCategory(category) {
  return String(category || 'system').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'system';
}

function humanRepoName(name) {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

await main();
