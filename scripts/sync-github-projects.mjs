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
const PINNED_REPOSITORIES_QUERY = `
  query PortfolioPinnedRepositories($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
          }
        }
      }
    }
  }
`;

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let existingProjects = [];
  try {
    existingProjects = JSON.parse(await fs.readFile(PROJECTS_PATH, 'utf8'));
    if (!Array.isArray(existingProjects)) existingProjects = [];
  } catch {
    existingProjects = [];
  }

  const existingGithubProjects = existingProjects.filter((project) => project?.source === 'github');
  const manualProjects = existingProjects.filter((project) => project?.source !== 'github');

  try {
    const pinnedState = await fetchPinnedRepositoryState(CONFIG, existingGithubProjects);
    const repos = await fetchRepositories(CONFIG);
    const allRepos = await includePinnedRepositories(repos, pinnedState.names, CONFIG);
    const pinnedRepoOrder = new Map(
      pinnedState.names.map((fullName, index) => [normalizeRepoKey(fullName), index])
    );
    const githubProjects = [];

    for (const [index, repo] of allRepos.entries()) {
      const manifest = await fetchOptionalManifest(repo, CONFIG);
      if (manifest?.hidden === true) continue;
      const readme = await fetchReadmeBundle(repo, CONFIG);
      githubProjects.push(
        buildProject(
          repo,
          manifest,
          readme,
          index,
          pinnedRepoOrder
        )
      );
    }

    const nextProjects = [...githubProjects, ...manualProjects];
    await fs.writeFile(PROJECTS_PATH, JSON.stringify(nextProjects, null, 4), 'utf8');

    const meta = {
      status: 'ok',
      last_synced: new Date().toISOString(),
      imported_count: githubProjects.length,
      repo_count: allRepos.length,
      manifest_count: githubProjects.filter((item) => item.__hasManifest).length,
      pinned_count: pinnedState.names.length,
      pinned_source: pinnedState.source,
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

async function fetchGraphql(query, variables, config) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: apiHeaders(config, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub GraphQL hiba (${response.status}): ${message.slice(0, 160)}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(payload.errors.map((item) => item?.message || 'Unknown GraphQL error').join('; '));
  }

  return payload?.data || null;
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

async function fetchPinnedRepositoryState(config, existingGithubProjects) {
  const cachedNames = existingGithubProjects
    .filter((project) => project?.featured && project?.github_full_name)
    .sort((a, b) => Number(a.pinned_rank ?? 9999) - Number(b.pinned_rank ?? 9999))
    .map((project) => project.github_full_name);

  if (!config.token) {
    return {
      names: cachedNames,
      source: cachedNames.length ? 'cache' : 'unavailable',
    };
  }

  try {
    const data = await fetchGraphql(PINNED_REPOSITORIES_QUERY, { login: config.username }, config);
    const names = (data?.user?.pinnedItems?.nodes || [])
      .map((node) => node?.nameWithOwner)
      .filter(Boolean);

    return {
      names,
      source: 'github',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Pinned repositories could not be fetched, falling back to cache: ${message}`);

    return {
      names: cachedNames,
      source: cachedNames.length ? 'cache' : 'unavailable',
    };
  }
}

async function includePinnedRepositories(repos, pinnedRepoNames, config) {
  const nextRepos = [...repos];
  const knownRepos = new Set(nextRepos.map((repo) => normalizeRepoKey(repo.full_name)));

  for (const fullName of pinnedRepoNames) {
    const repoKey = normalizeRepoKey(fullName);
    if (!repoKey || knownRepos.has(repoKey)) continue;

    try {
      const repo = await fetchRepositoryByFullName(fullName, config);
      if (!repo) continue;
      nextRepos.push(repo);
      knownRepos.add(repoKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Pinned repository could not be imported (${fullName}): ${message}`);
    }
  }

  return nextRepos;
}

async function fetchRepositoryByFullName(fullName, config) {
  const [owner, name] = String(fullName || '').split('/');
  if (!owner || !name) return null;

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return fetchJson(url, config);
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
  if (response.status === 404) return createEmptyReadmeBundle();
  if (!response.ok) return createEmptyReadmeBundle();

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
    return createEmptyReadmeBundle();
  }

  const media = extractReadmeVideo(markdown, repo);
  const image = extractReadmeImage(markdown, repo);

  return {
    excerpt: markdownExcerpt(markdown, config.readmeCharLimit),
    image: image?.url || null,
    image_source: image?.source || null,
    media,
  };
}

function createEmptyReadmeBundle() {
  return {
    excerpt: null,
    image: null,
    image_source: null,
    media: null,
  };
}

function extractReadmeVideo(markdown, repo) {
  const posterImage = extractReadmeVideoPoster(markdown, repo);

  for (const candidate of collectReadmeAssetCandidates(markdown)) {
    const youtube = parseYouTubeVideoCandidate(candidate);
    if (youtube) {
      return {
        media_type: 'video',
        media_provider: 'youtube',
        media_id: youtube.videoId,
        media_url: youtube.watchUrl,
        media_embed_url: youtube.embedUrl,
        poster_image: posterImage || youtube.posterImage,
        media_source: 'readme',
      };
    }

    const nativeVideo = parseNativeVideoCandidate(candidate, repo);
    if (nativeVideo) {
      return {
        ...nativeVideo,
        poster_image: posterImage,
        media_source: 'readme',
      };
    }
  }

  return null;
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
    const resolved = resolveRepoAssetUrl(candidate, repo, { preserveQuery: true });
    if (resolved) {
      return {
        url: resolved,
        source: 'readme',
      };
    }
  }

  return null;
}

function extractReadmeVideoPoster(markdown, repo) {
  const match = /<video\b[^>]*\bposter=["']([^"']+)["']/i.exec(markdown);
  if (!match?.[1]) return null;
  return resolveRepoAssetUrl(match[1], repo, { preserveQuery: true });
}

function collectReadmeAssetCandidates(markdown) {
  const candidates = [];
  const seen = new Set();
  const push = (value) => {
    const cleaned = cleanReadmeAssetCandidate(value);
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    candidates.push(cleaned);
  };

  const patterns = [
    /<video[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /!\[[^\]]*\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi,
    /\[[^\]]+\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      push(match[1]);
    }
  }

  for (const match of markdown.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) {
    push(match[0]);
  }

  return candidates;
}

function cleanReadmeAssetCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[.,;]+$/g, '');
}

function parseNativeVideoCandidate(candidate, repo) {
  const extensionMatch = /\.(mp4|webm)(?:$|[?#])/i.exec(String(candidate || ''));
  if (!extensionMatch) return null;

  const mediaProvider = extensionMatch[1].toLowerCase();
  const resolved = resolveRepoAssetUrl(candidate, repo, { preserveQuery: true });
  if (!resolved) return null;

  return {
    media_type: 'video',
    media_provider: mediaProvider,
    media_id: null,
    media_url: resolved,
    media_embed_url: resolved,
  };
}

function parseYouTubeVideoCandidate(candidate) {
  const value = String(candidate || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v') || '';
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live'].includes(segments[0])) {
          videoId = segments[1] || '';
        }
      }
    }

    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

    return {
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: buildYouTubeEmbedUrl(videoId),
      posterImage: buildYouTubePosterUrl(videoId),
    };
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    controls: '0',
    playlist: videoId,
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
  });

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

function buildYouTubePosterUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function resolveRepoAssetUrl(assetPath, repo, options = {}) {
  if (!assetPath) return null;

  let value = String(assetPath).trim();
  if (!value || value.startsWith('data:')) return null;

  value = value.replace(/^<|>$/g, '');
  const querySuffix = options.preserveQuery
    ? (value.match(/\?[^#]*/) || [''])[0]
    : '';
  value = value.replace(/[?#].*$/, '');

  if (/^https?:\/\//i.test(value)) return `${value}${querySuffix}`;
  if (value.startsWith('//')) return `https:${value}${querySuffix}`;

  const owner = encodeURIComponent(repo.owner?.login || '');
  const name = encodeURIComponent(repo.name || '');
  const branch = encodeURIComponent(repo.default_branch || 'main');

  if (value.startsWith('/')) {
    return `https://raw.githubusercontent.com/${owner}/${name}/${branch}${value}`;
  }

  const normalized = value.replace(/^(\.\/)+/, '').replace(/^\//, '');
  if (!normalized) return null;

  return `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${normalized.split('/').map(encodeURIComponent).join('/')}${querySuffix}`;
}

function markdownExcerpt(markdown, limit = 220) {
  const text = String(markdown)
    .replace(/^\uFEFF/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function buildProject(repo, manifest, readme, index, pinnedRepoOrder) {
  const repoKey = normalizeRepoKey(repo.full_name);
  const pinnedRank = pinnedRepoOrder.has(repoKey) ? pinnedRepoOrder.get(repoKey) : null;
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
  const image = cover || readme.image || readme.media?.poster_image || `https://opengraph.githubassets.com/portfolio-sync/${repo.full_name}`;
  const posterImage = cover || readme.image || readme.media?.poster_image || image;
  const tags = Array.isArray(manifest?.tags) && manifest.tags.length
    ? manifest.tags.map(String)
    : [language].filter(Boolean);

  const project = {
    title,
    type: manifest?.type || inferType(category, language),
    category,
    image,
    image_source: cover ? 'manifest' : (readme.image ? (readme.image_source || 'readme') : (readme.media?.poster_image ? 'video-poster' : 'github')),
    description,
    description_source: manifest?.summary || manifest?.description ? 'portfolio.json' : (readme.excerpt ? 'README excerpt' : 'GitHub metadata'),
    media_type: readme.media?.media_type || null,
    media_provider: readme.media?.media_provider || null,
    media_id: readme.media?.media_id || null,
    media_url: readme.media?.media_url || null,
    media_embed_url: readme.media?.media_embed_url || null,
    poster_image: posterImage,
    media_source: readme.media?.media_source || null,
    tags,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    live: manifest?.liveUrl || manifest?.live || repo.homepage || null,
    github: repo.html_url,
    featured: pinnedRank !== null,
    pinned_rank: pinnedRank,
    year: createdAt ? String(new Date(createdAt).getUTCFullYear()) : '',
    accent,
    source: 'github',
    repo: repo.name,
    github_full_name: repo.full_name,
    sync_note: pinnedRank !== null ? 'Pinned on GitHub profile' : 'Synced straight from GitHub metadata',
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

function normalizeRepoKey(value) {
  return String(value || '').trim().toLowerCase();
}

function humanRepoName(name) {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

await main();
