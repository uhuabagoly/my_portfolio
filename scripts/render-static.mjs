import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const LANGS = ['hu', 'en', 'de'];
const CATEGORY_ORDER = ['web', 'python', 'game', 'hardware', 'system'];

const TEXT = {
  hu: {
    all: 'Összes',
    categories: { web: 'Web', python: 'Python', game: 'Játék', hardware: 'Hardver', system: 'Rendszer' },
    categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'JÁTÉK', hardware: 'HARDVER', system: 'RENDSZER' },
    sourceGithub: 'GITHUB',
    sourceManual: 'KÉZI',
    placeholderGithub: 'GitHub projekt',
    placeholderManual: 'Kézi projekt',
    live: 'Élő oldal megnyitása',
    source: 'Repository megnyitása',
    forks: 'Forkok',
    watchers: 'Figyelők',
    exhibition: 'GitHub kiállítási darab',
    visibility: { public: 'Nyilvános', private: 'Privát' },
    descriptionSource: 'Leírás forrása',
    created: 'Készült',
    language: 'Nyelv',
    lastPush: 'Utolsó push',
    imported: 'Importálva',
    scanned: 'Átvizsgálva',
    curated: 'Kurálva',
    status: 'Állapot',
    syncIntro: (count, last) => `A felület most láthatóvá teszi a szinkront: ${count}, Az utolsó rögzített frissítés ideje: ${last}.`,
  },
  en: {
    all: 'All',
    categories: { web: 'Web', python: 'Python', game: 'Game', hardware: 'Hardware', system: 'System' },
    categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'GAME', hardware: 'HARDWARE', system: 'SYSTEM' },
    sourceGithub: 'GITHUB',
    sourceManual: 'MANUAL',
    placeholderGithub: 'GitHub project',
    placeholderManual: 'Manual project',
    live: 'Open live site',
    source: 'Open repository',
    forks: 'Forks',
    watchers: 'Watchers',
    exhibition: 'GitHub exhibition piece',
    visibility: { public: 'Public', private: 'Private' },
    descriptionSource: 'Description source',
    created: 'Created',
    language: 'Language',
    lastPush: 'Last push',
    imported: 'Imported',
    scanned: 'Scanned',
    curated: 'Curated',
    status: 'Status',
    syncIntro: (count, last) => `The interface now makes the sync visible: ${count}, Last recorded update: ${last}.`,
  },
  de: {
    all: 'Alle',
    categories: { web: 'Web', python: 'Python', game: 'Spiel', hardware: 'Hardware', system: 'System' },
    categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'SPIEL', hardware: 'HARDWARE', system: 'SYSTEM' },
    sourceGithub: 'GITHUB',
    sourceManual: 'MANUELL',
    placeholderGithub: 'GitHub-Projekt',
    placeholderManual: 'Manuelles Projekt',
    live: 'Live-Seite öffnen',
    source: 'Repository öffnen',
    forks: 'Forks',
    watchers: 'Beobachter',
    exhibition: 'GitHub-Ausstellungsstück',
    visibility: { public: 'Öffentlich', private: 'Privat' },
    descriptionSource: 'Beschreibungsquelle',
    created: 'Erstellt',
    language: 'Sprache',
    lastPush: 'Letzter Push',
    imported: 'Importiert',
    scanned: 'Geprüft',
    curated: 'Kuratiert',
    status: 'Status',
    syncIntro: (count, last) => `Die Oberfläche macht die Synchronisierung sichtbar: ${count}, Letzte gespeicherte Aktualisierung: ${last}.`,
  },
};

async function main() {
  const projects = await readJson(path.join(DATA_DIR, 'projects.json'), []);
  const meta = await readJson(path.join(DATA_DIR, 'github_sync_meta.json'), {});
  const githubProjects = projects
    .filter((project) => project?.source === 'github')
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  for (const lang of LANGS) {
    await renderHome(lang, githubProjects);
    await renderWork(lang, githubProjects, meta);
  }

  console.log('Static HTML refreshed from data/projects.json.');
}

async function renderHome(lang, githubProjects) {
  const pagePath = path.join(ROOT, lang, 'index.html');
  let html = await fs.readFile(pagePath, 'utf8');
  const cards = githubProjects.slice(0, 3).map((project, index) => renderHomeCard(project, index, lang)).join('\n');
  html = replaceBetweenMarkers(html, 'GITHUB_FEATURED', cards);
  await fs.writeFile(pagePath, html, 'utf8');
}

async function renderWork(lang, githubProjects, meta) {
  const pagePath = path.join(ROOT, lang, 'work.html');
  let html = await fs.readFile(pagePath, 'utf8');
  html = ensureSyncIntroSection(html);
  const manualCategories = extractManualCategories(html);
  const categories = orderCategories([...manualCategories, ...githubProjects.map((project) => project.category)]);

  html = replaceBetweenMarkers(html, 'PROJECT_FILTERS', renderFilterButtons(categories, lang));
  html = replaceBetweenMarkers(html, 'GITHUB_SYNC_INTRO', renderSyncIntro(meta, githubProjects, lang));
  html = replaceBetweenMarkers(html, 'GITHUB_PROJECTS', githubProjects.map((project, index) => renderWorkCard(project, index, lang)).join('\n'));

  await fs.writeFile(pagePath, html, 'utf8');
}

function ensureSyncIntroSection(html) {
  if (html.includes('<!-- GITHUB_SYNC_INTRO_START -->') && html.includes('<!-- GITHUB_SYNC_INTRO_END -->')) {
    return html;
  }

  const markerBlock = [
    '<section class="section-block">',
    '    <div class="container-lg">',
    '        <div class="github-sync-intro-card reveal">',
    '            <!-- GITHUB_SYNC_INTRO_START -->',
    '            <!-- GITHUB_SYNC_INTRO_END -->',
    '        </div>',
    '    </div>',
    '</section>',
    '',
  ].join('\n');

  return html.replace(/(<\/section>\s*)(<section class="section-block">)/, `$1\n${markerBlock}$2`);
}

function renderFilterButtons(categories, lang) {
  const t = TEXT[lang];
  const buttons = [`<button class="active" data-filter="all" type="button">${escapeHtml(t.all)}</button>`];

  for (const category of categories) {
    const label = t.categories[category] || humanizeCategory(category);
    buttons.push(`<button class="" data-filter="${escapeHtml(category)}" type="button">${escapeHtml(label)}</button>`);
  }

  return buttons.map((item) => `                    ${item}`).join('\n');
}

function renderSyncIntro(meta, githubProjects, lang) {
  const t = TEXT[lang];
  const last = formatDate(meta.last_synced, lang, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—';
  const imported = Number(meta.imported_count ?? githubProjects.length ?? 0);
  const repoCount = Number(meta.repo_count ?? githubProjects.length ?? 0);
  const curated = githubProjects.length;
  const status = String(meta.status || 'error').toUpperCase();

  return [
    `            <span class="guide-label">GitHub beemelés</span>`,
    `            <p>${escapeHtml(t.syncIntro(imported, last))}</p>`,
    `            <div class="github-hero-stats">`,
    `                <div class="github-hero-stat"><span>${escapeHtml(t.imported)}</span><strong>${imported}</strong></div>`,
    `                <div class="github-hero-stat"><span>${escapeHtml(t.scanned)}</span><strong>${repoCount}</strong></div>`,
    `                <div class="github-hero-stat"><span>${escapeHtml(t.curated)}</span><strong>${curated}</strong></div>`,
    `                <div class="github-hero-stat"><span>${escapeHtml(t.status)}</span><strong>${escapeHtml(status)}</strong></div>`,
    `            </div>`,
  ].join('\n');
}

function renderHomeCard(project, index, lang) {
  const t = TEXT[lang];
  const isGithub = project.source === 'github';
  const languageOrType = project.language || project.year || project.type || '';
  const thumbClass = project.image_source === 'readme' ? ' readme-thumb' : '';
  const tags = Array.isArray(project.tags) ? project.tags : [];
  const repoName = project.github_full_name || '';

  return `                <div class="col-lg-4 col-md-6">
                    <article class="project-card reveal reveal-delay-${Math.min(index + 1, 3)} ${escapeHtml(project.accent || 'accent-red')}"${repoName ? ` data-github-repo="${escapeHtml(repoName)}"` : ''}>
                        ${project.image ? `<div class="project-thumb${thumbClass}"><img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy"></div>` : `<div class="project-thumb project-thumb-placeholder ${escapeHtml(project.accent || 'accent-red')}"><span class="placeholder-kicker">${escapeHtml(isGithub ? t.placeholderGithub : t.placeholderManual)}</span><strong>${escapeHtml(projectMonogram(project.title))}</strong><small>${escapeHtml(project.type || '')}</small></div>`}
                        <div class="project-body">
                            <div class="project-stamp">
                                <span>0${index + 1}</span>
                                <small>${escapeHtml(languageOrType)}</small>
                            </div>
                            <div class="project-meta">
                                <span>${escapeHtml(project.type || '')}</span>
                                <span>${escapeHtml((t.categoryMeta[project.category] || humanizeCategory(project.category)).toUpperCase())}</span>
                                <span>${escapeHtml(isGithub ? t.sourceGithub : t.sourceManual)}</span>
                            </div>
                            <h3>${escapeHtml(project.title)}</h3>
                            <p>${escapeHtml(project.description || '')}</p>
                            ${isGithub ? `<div class="github-mini-stats"><span>★ ${formatCompactNumber(project.github_stats?.stars || 0)}</span><span>${escapeHtml(t.forks)} ${formatCompactNumber(project.github_stats?.forks || 0)}</span><span>${escapeHtml(t.watchers)} ${formatCompactNumber(project.github_stats?.watchers || 0)}</span></div>` : ''}
                            <div class="tag-row">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
                            <div class="project-links">${project.live ? `<a href="${escapeHtml(project.live)}" target="_blank" rel="noreferrer">${escapeHtml(t.live)}</a>` : ''}${project.github ? `<a href="${escapeHtml(project.github)}" target="_blank" rel="noreferrer">${escapeHtml(t.source)}</a>` : ''}</div>
                        </div>
                    </article>
                </div>`;
}

function renderWorkCard(project, index, lang) {
  const t = TEXT[lang];
  const created = formatDate(project.created_at, lang, { year: 'numeric', month: '2-digit', day: '2-digit' }) || project.year || '—';
  const pushed = formatDate(project.updated_at, lang, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—';
  const visibility = t.visibility[String(project.visibility || 'public').toLowerCase()] || String(project.visibility || 'public');
  const descriptionSource = project.description_source || 'GitHub metadata';
  const thumbClass = project.image_source === 'readme' ? ' readme-thumb' : '';
  const chipSync = project.sync_note ? `<span class="github-chip">${escapeHtml(project.sync_note)}</span>` : '';
  const topics = Array.isArray(project.topics) ? project.topics.slice(0, 4) : [];
  const repoName = project.github_full_name || '';

  return `                <div class="col-12 project-item" data-category="${escapeHtml(project.category || 'system')}">
                    <article class="project-card project-card-large github-gallery-card reveal reveal-delay-${Math.min((index % 3) + 1, 3)} ${escapeHtml(project.accent || 'accent-red')}"${repoName ? ` data-github-repo="${escapeHtml(repoName)}"` : ''}>
                        <div class="project-thumb project-thumb-large${thumbClass}">
                            ${project.image ? `<img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy">` : ''}
                            <div class="project-thumb-overlay">
                                <span class="guide-label">${escapeHtml(t.exhibition)}</span>
                                <strong>${escapeHtml(project.github_full_name || project.title)}</strong>
                            </div>
                        </div>
                        <div class="project-body">
                            <div class="project-topline">
                                <div class="project-stamp wide">
                                    <span>${String(index + 1).padStart(2, '0')}</span>
                                    <small>${escapeHtml(created)}</small>
                                </div>
                                <div class="project-meta">
                                    <span>${escapeHtml(visibility)}</span>
                                    <span>${escapeHtml(project.default_branch || 'main')}</span>
                                </div>
                            </div>
                            <h2>${escapeHtml(project.title)}</h2>
                            <p>${escapeHtml(project.description || '')}</p>
                            <p class="project-source-note">${escapeHtml(t.descriptionSource)}: ${escapeHtml(descriptionSource)}.</p>
                            <div class="github-stat-grid">
                                <div class="github-stat"><span>Stars</span><strong>${formatCompactNumber(project.github_stats?.stars || 0)}</strong></div>
                                <div class="github-stat"><span>${escapeHtml(t.forks)}</span><strong>${formatCompactNumber(project.github_stats?.forks || 0)}</strong></div>
                                <div class="github-stat"><span>${escapeHtml(t.watchers)}</span><strong>${formatCompactNumber(project.github_stats?.watchers || 0)}</strong></div>
                                <div class="github-stat"><span>Issues</span><strong>${formatCompactNumber(project.github_stats?.issues || 0)}</strong></div>
                            </div>
                            <div class="github-chip-row">
                                <span class="github-chip">${escapeHtml(t.created)} / ${escapeHtml(created)}</span>
                                <span class="github-chip">${escapeHtml(t.language)} / ${escapeHtml(project.language || '—')}</span>
                                <span class="github-chip">${escapeHtml(t.lastPush)} / ${escapeHtml(pushed)}</span>
                                ${chipSync}
                            </div>
                            <div class="tag-row">${topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div>
                            <div class="project-links">
                                ${project.live ? `<a href="${escapeHtml(project.live)}" target="_blank" rel="noreferrer">${escapeHtml(t.live)}</a>` : ''}
                                ${project.github ? `<a href="${escapeHtml(project.github)}" target="_blank" rel="noreferrer">${escapeHtml(t.source)}</a>` : ''}
                            </div>
                        </div>
                    </article>
                </div>`;
}

function extractManualCategories(html) {
  const marker = /<!-- GITHUB_PROJECTS_END -->([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/m.exec(html);
  const source = marker ? marker[1] : html;
  const matches = source.matchAll(/data-category="([^"]+)"/g);
  return [...new Set([...matches].map((match) => match[1]).filter(Boolean))];
}

function orderCategories(values) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function replaceBetweenMarkers(html, markerName, innerHtml) {
  const pattern = new RegExp(`(<!-- ${markerName}_START -->)([\\s\\S]*?)(<!-- ${markerName}_END -->)`);
  if (!pattern.test(html)) {
    throw new Error(`Marker not found: ${markerName}`);
  }

  const normalized = innerHtml ? `\n${innerHtml}\n                ` : '\n';
  return html.replace(pattern, `$1${normalized}$3`);
}

function projectMonogram(title) {
  return String(title || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'PR';
}

function humanizeCategory(category) {
  return String(category || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatDate(value, lang, options) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'hu' ? 'hu-HU' : lang === 'de' ? 'de-DE' : 'en-US';
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

await main();
