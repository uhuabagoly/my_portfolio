document.addEventListener('DOMContentLoaded', () => {
    setupRevealAnimations();
    setupProjectFilters();
    setupProjectMedia();
    setupNavigationSound();
    initializeLiveGithubPortfolio();
});


let youtubeApiPromise = null;
const youtubePlayers = new Map();

async function refreshGithubProjectStats() {
    const githubCards = [...document.querySelectorAll('[data-github-repo]')];
    if (!githubCards.length) return;

    const uniqueRepos = [...new Set(
        githubCards
            .map((card) => card.getAttribute('data-github-repo'))
            .filter(Boolean)
    )];

    const results = await Promise.all(uniqueRepos.map(fetchGithubRepoStats));
    const repoStats = new Map(results.filter(Boolean).map((item) => [item.repo, item.stats]));

    githubCards.forEach((card) => {
        const repo = card.getAttribute('data-github-repo');
        const stats = repoStats.get(repo);
        if (!stats) return;

        updateMiniStats(card, stats);
        updateStatGrid(card, stats);
    });
}

async function fetchGithubRepoStats(repo) {
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                Accept: 'application/vnd.github+json'
            }
        });

        if (!response.ok) return null;
        const data = await response.json();

        return {
            repo,
            stats: {
                stars: Number(data.stargazers_count || 0),
                forks: Number(data.forks_count || 0),
                watchers: Number(data.subscribers_count ?? data.watchers_count ?? 0),
                issues: Number(data.open_issues_count || 0)
            }
        };
    } catch {
        return null;
    }
}

function updateMiniStats(card, stats) {
    const miniStats = card.querySelector('.github-mini-stats');
    if (!miniStats) return;

    const spans = miniStats.querySelectorAll('span');
    if (spans[0]) spans[0].innerHTML = `&#9733; ${formatCompactNumber(stats.stars)}`;
    if (spans[1]) {
        const label = extractStatLabel(spans[1].textContent);
        spans[1].textContent = `${label} ${formatCompactNumber(stats.forks)}`;
    }
    if (spans[2]) {
        const label = extractStatLabel(spans[2].textContent);
        spans[2].textContent = `${label} ${formatCompactNumber(stats.watchers)}`;
    }
}

function updateStatGrid(card, stats) {
    const statGrid = card.querySelector('.github-stat-grid');
    if (!statGrid) return;

    const statBlocks = statGrid.querySelectorAll('.github-stat');
    const values = [stats.stars, stats.forks, stats.watchers, stats.issues];

    statBlocks.forEach((block, index) => {
        const valueNode = block.querySelector('strong');
        if (!valueNode) return;
        valueNode.textContent = formatCompactNumber(values[index] || 0);
    });
}

function extractStatLabel(text) {
    return String(text || '')
        .replace(/\d[\d.,KMB]*$/i, '')
        .replace(/★/g, '')
        .trim();
}

function formatCompactNumber(value) {
    return new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(Number(value || 0));
}

function setupProjectMedia(root = document) {
    const mediaCards = [...root.querySelectorAll('[data-project-media]')];
    if (!mediaCards.length) return;

    const youtubeCards = [];

    mediaCards.forEach((card) => {
        const provider = card.dataset.mediaProvider;
        if (provider === 'youtube') {
            youtubeCards.push(card);
            return;
        }

        setupNativeProjectMedia(card);
    });

    if (youtubeCards.length) {
        setupYoutubeProjectMedia(youtubeCards);
    }
}

function setupNativeProjectMedia(card) {
    const video = card.querySelector('.project-media-player-native');
    const button = card.querySelector('.project-media-toggle');
    if (!video) return;

    const markReady = () => {
        card.classList.add('is-media-ready');
        if (button) button.hidden = false;
    };

    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    video.addEventListener('loadeddata', () => {
        markReady();
        playNativeVideo(video, card, button);
    }, { once: true });

    video.addEventListener('error', () => {
        markMediaFallback(card, button);
    }, { once: true });

    if (button) {
        button.addEventListener('click', () => {
            if (card.dataset.playback === 'playing') {
                video.pause();
                setMediaPlaybackState(card, button, false);
            } else {
                playNativeVideo(video, card, button);
            }
        });
    }
}

function playNativeVideo(video, card, button) {
    const playAttempt = video.play();

    if (playAttempt && typeof playAttempt.then === 'function') {
        playAttempt
            .then(() => {
                setMediaPlaybackState(card, button, true);
            })
            .catch(() => {
                setMediaPlaybackState(card, button, false);
            });
        return;
    }

    setMediaPlaybackState(card, button, true);
}

function setupYoutubeProjectMedia(cards) {
    loadYoutubeApi()
        .then(() => {
            cards.forEach((card) => createYoutubePlayer(card));
        })
        .catch(() => {
            cards.forEach((card) => {
                markMediaFallback(card, card.querySelector('.project-media-toggle'));
            });
        });
}

function loadYoutubeApi() {
    if (window.YT && typeof window.YT.Player === 'function') {
        return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    youtubeApiPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-youtube-api]');
        if (existingScript) {
            existingScript.addEventListener('error', reject, { once: true });
            window.onYouTubeIframeAPIReady = () => resolve(window.YT);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.dataset.youtubeApi = 'true';
        script.addEventListener('error', reject, { once: true });
        window.onYouTubeIframeAPIReady = () => resolve(window.YT);
        document.head.appendChild(script);
    });

    return youtubeApiPromise;
}

function createYoutubePlayer(card) {
    const host = card.querySelector('.project-media-player-youtube');
    const button = card.querySelector('.project-media-toggle');
    const videoId = host?.dataset.videoId;

    if (!host || !videoId || !(window.YT && typeof window.YT.Player === 'function')) {
        markMediaFallback(card, button);
        return;
    }

    const player = new window.YT.Player(host.id, {
        videoId,
        playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            loop: 1,
            modestbranding: 1,
            mute: 1,
            playlist: videoId,
            playsinline: 1,
            rel: 0
        },
        events: {
            onReady: (event) => {
                youtubePlayers.set(card, event.target);
                card.classList.add('is-media-ready');
                if (button) button.hidden = false;
                event.target.mute();
                event.target.playVideo();
                setMediaPlaybackState(card, button, true);
            },
            onError: () => {
                markMediaFallback(card, button);
            }
        }
    });

    if (button) {
        button.addEventListener('click', () => {
            const currentPlayer = youtubePlayers.get(card) || player;
            if (!currentPlayer) return;

            if (card.dataset.playback === 'playing') {
                currentPlayer.pauseVideo();
                setMediaPlaybackState(card, button, false);
            } else {
                currentPlayer.mute();
                currentPlayer.playVideo();
                setMediaPlaybackState(card, button, true);
            }
        });
    }
}

function markMediaFallback(card, button) {
    card.classList.add('is-media-fallback');
    card.dataset.playback = 'fallback';
    if (button) button.hidden = true;
}

function setMediaPlaybackState(card, button, isPlaying) {
    card.dataset.playback = isPlaying ? 'playing' : 'stopped';
    if (!button) return;

    const playLabel = button.dataset.playLabel || 'Play';
    const stopLabel = button.dataset.stopLabel || 'Stop';
    button.hidden = false;
    button.textContent = isPlaying ? stopLabel : playLabel;
    button.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
}

let navigationClickSound = null;

function setupNavigationSound() {
    const soundPath = window.location.pathname.match(/\/(hu|en|de)\//)
        ? '../voice/mouse-click.mp3'
        : './voice/mouse-click.mp3';

    if (!navigationClickSound) {
        navigationClickSound = new Audio(soundPath);
        navigationClickSound.preload = 'auto';
        navigationClickSound.volume = 1;

        navigationClickSound.addEventListener('canplaythrough', () => {
            console.log('Hang betoltve:', soundPath);
        });

        navigationClickSound.addEventListener('error', () => {
            console.error('Nem toltheto be a hangfajl:', soundPath);
        });
    }

    document.querySelectorAll('a[href]').forEach((link) => {
        if (link.dataset.navigationSoundBound === 'true') return;
        link.dataset.navigationSoundBound = 'true';

        link.addEventListener('click', async (event) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const href = link.getAttribute('href') || '';
            const target = link.getAttribute('target');

            if (
                !href ||
                href.startsWith('#') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:') ||
                href.startsWith('javascript:') ||
                link.hasAttribute('download')
            ) {
                return;
            }

            event.preventDefault();

            try {
                navigationClickSound.pause();
                navigationClickSound.currentTime = 0;
                await navigationClickSound.play();
            } catch (err) {
                console.error('A hang lejatszasa sikertelen:', err);
            }

            setTimeout(() => {
                if (target === '_blank') {
                    window.open(link.href, '_blank', 'noopener,noreferrer');
                } else {
                    window.location.href = link.href;
                }
            }, 300);
        });
    });
}
const LIVE_GITHUB_PORTFOLIO = {
    username: 'uhuabagoly',
    perPage: 100,
    readmeLimit: 220,
    pinnedRefreshIntervalMs: 30000,
    remotePinnedSnapshot: 'https://raw.githubusercontent.com/uhuabagoly/my_portfolio/main/public/data/pinned.json',
    accents: ['accent-red', 'accent-orange', 'accent-yellow'],
    categoryOrder: ['web', 'python', 'game', 'hardware', 'system']
};

const LIVE_GITHUB_TEXT = {
    hu: {
        all: 'Összes',
        categories: { web: 'Web', python: 'Python', game: 'Játék', hardware: 'Hardver', system: 'Rendszer' },
        categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'JÁTÉK', hardware: 'HARDVER', system: 'RENDSZER' },
        sourceGithub: 'GITHUB',
        placeholderGithub: 'GitHub projekt',
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
        syncIntro: (count, last) => `Élő GitHub kapcsolat: ${count} publikus repository. Utolsó lekérés: ${last}.`,
        featuredEmptyTitle: 'Még nincs pinned projekt',
        featuredEmptyCopy: 'Pinelj repositorykat a GitHub profilodon, és itt automatikusan megjelennek.',
        mediaPlay: 'Play',
        mediaStop: 'Stop'
    },
    en: {
        all: 'All',
        categories: { web: 'Web', python: 'Python', game: 'Game', hardware: 'Hardware', system: 'System' },
        categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'GAME', hardware: 'HARDWARE', system: 'SYSTEM' },
        sourceGithub: 'GITHUB',
        placeholderGithub: 'GitHub project',
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
        syncIntro: (count, last) => `Live GitHub connection: ${count} public repositories. Last request: ${last}.`,
        featuredEmptyTitle: 'No pinned projects yet',
        featuredEmptyCopy: 'Pin repositories on your GitHub profile and they will appear here automatically.',
        mediaPlay: 'Play',
        mediaStop: 'Stop'
    },
    de: {
        all: 'Alle',
        categories: { web: 'Web', python: 'Python', game: 'Spiel', hardware: 'Hardware', system: 'System' },
        categoryMeta: { web: 'WEB', python: 'PYTHON', game: 'SPIEL', hardware: 'HARDWARE', system: 'SYSTEM' },
        sourceGithub: 'GITHUB',
        placeholderGithub: 'GitHub-Projekt',
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
        syncIntro: (count, last) => `Live-GitHub-Verbindung: ${count} öffentliche Repositories. Letzte Abfrage: ${last}.`,
        featuredEmptyTitle: 'Noch keine angehefteten Projekte',
        featuredEmptyCopy: 'Hefte Repositories in deinem GitHub-Profil an; sie erscheinen hier automatisch.',
        mediaPlay: 'Play',
        mediaStop: 'Stop'
    }
};

const LIVE_GITHUB_STATE = {
    projectMap: new Map(),
    topGrid: null,
    pinnedSignature: null,
    pinnedRefreshTimer: null,
    pinnedRefreshInFlight: false,
    pinnedLifecycleBound: false
};

async function initializeLiveGithubPortfolio() {
    const workGrid = document.getElementById('projectGrid');
    const topGrid = findTopProjectGrid();

    if (!workGrid && !topGrid) return;

    try {
        const repositories = await fetchAllPublicGithubRepositories(LIVE_GITHUB_PORTFOLIO.username);

        // A README/portfolio.json hidratálás visszaadja a projekt saját képét,
        // videóját, leírását és egyéb metaadatait. A localStorage cache miatt
        // változatlan repónál egy sima oldalfrissítés nem kér mindent újra.
        const hydratedProjects = await mapWithConcurrencyLive(
            repositories,
            4,
            (repo, index) => hydrateLiveGithubProject(repo, index, null)
        );

        const projectMap = new Map(
            hydratedProjects.map((project) => [normalizeRepoKeyLive(project.github_full_name), project])
        );

        if (workGrid) {
            renderLiveWorkProjects(hydratedProjects);
        }

        LIVE_GITHUB_STATE.projectMap = projectMap;
        LIVE_GITHUB_STATE.topGrid = topGrid;

        if (topGrid) {
            await refreshLivePinnedTop({ force: true });
            startLivePinnedAutoRefresh();
        }

        // A dinamikusan beszúrt munkakártyák a DOMContentLoaded elején még nem
        // léteztek, ezért a média inicializálást a work gridre újra lefuttatjuk.
        if (workGrid) setupProjectMedia(workGrid);
    } catch (error) {
        // GitHub/API hiba esetén a statikusan generált tartalék marad a DOM-ban.
        console.error('Az élő GitHub portfólió betöltése sikertelen. A statikus tartalék megmarad.', error);
    }
}

async function refreshLivePinnedTop(options = {}) {
    const grid = LIVE_GITHUB_STATE.topGrid;
    if (!grid || LIVE_GITHUB_STATE.pinnedRefreshInFlight) return;

    LIVE_GITHUB_STATE.pinnedRefreshInFlight = true;

    try {
        const pinnedNames = await fetchPinnedRepositoryNames();
        if (pinnedNames === null) return;

        const normalizedNames = [...new Set(
            pinnedNames
                .map((name) => String(name || '').trim())
                .filter(Boolean)
        )].slice(0, 6);
        const signature = normalizedNames
            .map(normalizeRepoKeyLive)
            .join('|');

        if (!options.force && signature === LIVE_GITHUB_STATE.pinnedSignature) {
            return;
        }

        const pinnedProjects = [];

        for (const [index, fullName] of normalizedNames.entries()) {
            const key = normalizeRepoKeyLive(fullName);
            let project = LIVE_GITHUB_STATE.projectMap.get(key) || null;

            // Ha olyan publikus repo van pinelve, amely nincs a saját owner repo
            // listában, csak azt az egy repót kell külön hidratálni.
            if (!project) {
                const repo = await fetchPublicRepositoryByFullName(fullName);
                if (repo && !repo.private) {
                    project = await hydrateLiveGithubProject(repo, index, null);
                    LIVE_GITHUB_STATE.projectMap.set(key, project);
                }
            }

            if (!project) continue;

            pinnedProjects.push({
                ...project,
                featured: true,
                pinned_rank: index,
                sync_note: 'Pinned on GitHub profile'
            });
        }

        renderLiveTopProjects(grid, pinnedProjects);
        LIVE_GITHUB_STATE.pinnedSignature = signature;

        // Csak az új TOP kártyák médiaelemeit inicializáljuk.
        setupProjectMedia(grid);
        setupNavigationSound();
    } catch (error) {
        console.warn('A dinamikus TOP frissítése sikertelen; a jelenlegi TOP megmarad.', error);
    } finally {
        LIVE_GITHUB_STATE.pinnedRefreshInFlight = false;
    }
}

function startLivePinnedAutoRefresh() {
    if (!LIVE_GITHUB_STATE.topGrid) return;

    if (!LIVE_GITHUB_STATE.pinnedRefreshTimer) {
        LIVE_GITHUB_STATE.pinnedRefreshTimer = window.setInterval(() => {
            if (document.hidden) return;
            refreshLivePinnedTop();
        }, LIVE_GITHUB_PORTFOLIO.pinnedRefreshIntervalMs);
    }

    if (!LIVE_GITHUB_STATE.pinnedLifecycleBound) {
        LIVE_GITHUB_STATE.pinnedLifecycleBound = true;

        window.addEventListener('focus', () => {
            refreshLivePinnedTop();
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshLivePinnedTop();
        });
    }
}

async function mapWithConcurrencyLive(items, concurrency, mapper) {
    const source = Array.isArray(items) ? items : [];
    const results = new Array(source.length);
    let cursor = 0;

    async function worker() {
        while (true) {
            const index = cursor++;
            if (index >= source.length) return;
            results[index] = await mapper(source[index], index);
        }
    }

    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, source.length || 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

async function fetchAllPublicGithubRepositories(username) {
    const repositories = [];
    let page = 1;

    while (true) {
        const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/repos`);
        url.searchParams.set('type', 'owner');
        url.searchParams.set('sort', 'updated');
        url.searchParams.set('direction', 'desc');
        url.searchParams.set('per_page', String(LIVE_GITHUB_PORTFOLIO.perPage));
        url.searchParams.set('page', String(page));

        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub repository API hiba: ${response.status}`);
        }

        const batch = await response.json();
        if (!Array.isArray(batch) || batch.length === 0) break;

        repositories.push(...batch.filter((repo) => !repo.private));

        if (batch.length < LIVE_GITHUB_PORTFOLIO.perPage) break;
        page += 1;
    }

    return repositories;
}

async function fetchPublicRepositoryByFullName(fullName) {
    try {
        const response = await fetch(`https://api.github.com/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`, {
            cache: 'no-store',
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

async function fetchPinnedRepositoryNames() {
    // Go Live és GitHub Pages alatt is elsőként egy CORS-kompatibilis, publikus
    // pinned endpointot használunk. Ehhez nem kell GitHub token a böngészőbe.
    const liveNames = await fetchPinnedRepositoryNamesFromPublicApi();
    if (liveNames !== null) return liveNames;

    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

    // Ha az élő endpoint átmenetileg nem elérhető, Go Live alatt a watcher által
    // frissített helyi snapshot, publikus oldalon az Action snapshotja a fallback.
    if (isLocal) {
        const localNames = await fetchPinnedRepositoryNamesFromLocalSnapshot();
        if (localNames !== null) return localNames;
        return fetchPinnedRepositoryNamesFromRemoteSnapshot();
    }

    const remoteNames = await fetchPinnedRepositoryNamesFromRemoteSnapshot();
    if (remoteNames !== null) return remoteNames;
    return fetchPinnedRepositoryNamesFromLocalSnapshot();
}

async function fetchPinnedRepositoryNamesFromPublicApi() {
    const endpoint = new URL(`https://pinned.berrysauce.dev/get/${encodeURIComponent(LIVE_GITHUB_PORTFOLIO.username)}`);
    endpoint.searchParams.set('_', String(Date.now()));

    try {
        const response = await fetch(endpoint, {
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`Pinned public API hiba: ${response.status}`);

        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error('Pinned public API válasza nem lista.');

        const repositories = payload
            .map((item) => {
                const owner = String(item?.author || item?.owner || '').trim();
                const name = String(item?.name || item?.repo || '').trim();
                return owner && name ? `${owner}/${name}` : '';
            })
            .filter(Boolean);

        return [...new Set(repositories.map((name) => name.trim()).filter(Boolean))].slice(0, 6);
    } catch (error) {
        console.warn('Az élő pinned API nem érhető el; snapshot fallback következik.', error);
        return null;
    }
}

async function fetchPinnedRepositoryNamesFromRemoteSnapshot() {
    try {
        const url = new URL(LIVE_GITHUB_PORTFOLIO.remotePinnedSnapshot);
        url.searchParams.set('_', String(Date.now()));
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Remote pinned snapshot hiba: ${response.status}`);
        return parsePinnedSnapshot(await response.json());
    } catch (error) {
        console.warn('A remote pinned snapshot nem érhető el, helyi fallback következik.', error);
        return null;
    }
}

async function fetchPinnedRepositoryNamesFromLocalSnapshot() {
    try {
        const base = window.location.pathname.match(/\/(hu|en|de)(?:\/|$)/)
            ? '../data/pinned.json'
            : './data/pinned.json';
        const url = new URL(base, window.location.href);
        url.searchParams.set('_', String(Date.now()));

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Pinned snapshot hiba: ${response.status}`);
        return parsePinnedSnapshot(await response.json());
    } catch (error) {
        console.error('A pinned GitHub lista nem tölthető be. A statikus TOP tartalék megmarad.', error);
        return null;
    }
}

function parsePinnedSnapshot(payload) {
    if (!Array.isArray(payload?.repositories)) {
        throw new Error('A pinned.json repositories mezője hiányzik.');
    }

    const validSources = new Set(['github-graphql-pinnedItems', 'github-profile-html']);
    if (!validSources.has(String(payload?.source || ''))) {
        throw new Error(`A pinned.json még nem hiteles GitHub pinned adatforrásból készült: ${payload?.source || 'unknown'}`);
    }

    return [...new Set(payload.repositories.map(String).map((item) => item.trim()).filter(Boolean))];
}

async function hydrateLiveGithubProject(repo, index, pinnedOrder) {
    const [manifest, readme] = await Promise.all([
        fetchLivePortfolioManifest(repo),
        fetchLiveReadmeBundle(repo)
    ]);

    return buildLiveGithubProject(repo, manifest, readme, index, pinnedOrder);
}

async function fetchLivePortfolioManifest(repo) {
    const cacheKey = `portfolio-manifest:${repo.full_name}`;
    const version = String(repo.pushed_at || repo.updated_at || '');
    const cached = readLiveCache(cacheKey, version);
    if (cached !== undefined) return cached;

    const owner = encodeURIComponent(repo.owner?.login || '');
    const name = encodeURIComponent(repo.name || '');
    const branch = encodeURIComponent(repo.default_branch || 'main');
    const url = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/portfolio.json`;

    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            writeLiveCache(cacheKey, version, null);
            return null;
        }

        const parsed = await response.json();
        const value = parsed && typeof parsed === 'object' ? parsed : null;
        writeLiveCache(cacheKey, version, value);
        return value;
    } catch {
        writeLiveCache(cacheKey, version, null);
        return null;
    }
}

async function fetchLiveReadmeBundle(repo) {
    const cacheKey = `portfolio-readme:${repo.full_name}`;
    const version = String(repo.pushed_at || repo.updated_at || '');
    const cached = readLiveCache(cacheKey, version);
    if (cached !== undefined) return cached;

    const empty = { excerpt: null, image: null, image_source: null, media: null };

    try {
        const response = await fetch(`https://api.github.com/repos/${repo.full_name.split('/').map(encodeURIComponent).join('/')}/readme`, {
            cache: 'no-store',
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (response.status === 404) {
            writeLiveCache(cacheKey, version, empty);
            return empty;
        }
        if (!response.ok) return empty;

        const data = await response.json();
        let markdown = '';

        if (data?.content) {
            markdown = decodeBase64Utf8Live(data.content);
        }

        if (!markdown && data?.download_url) {
            const rawResponse = await fetch(data.download_url, { cache: 'no-store' });
            if (rawResponse.ok) markdown = await rawResponse.text();
        }

        if (!markdown) {
            writeLiveCache(cacheKey, version, empty);
            return empty;
        }

        const media = extractReadmeVideoLive(markdown, repo);
        const image = extractReadmeImageLive(markdown, repo);
        const value = {
            excerpt: markdownExcerptLive(markdown, LIVE_GITHUB_PORTFOLIO.readmeLimit),
            image: image?.url || null,
            image_source: image?.source || null,
            media
        };

        writeLiveCache(cacheKey, version, value);
        return value;
    } catch {
        return empty;
    }
}

function decodeBase64Utf8Live(value) {
    try {
        const binary = atob(String(value || '').replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return '';
    }
}

function readLiveCache(key, version) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== version) return undefined;
        return parsed.value;
    } catch {
        return undefined;
    }
}

function writeLiveCache(key, version, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ version, value }));
    } catch {
        // A cache csak optimalizálás; nélküle is működik az élő lista.
    }
}

function extractReadmeVideoLive(markdown, repo) {
    const posterImage = extractReadmeVideoPosterLive(markdown, repo);

    for (const candidate of collectReadmeAssetCandidatesLive(markdown)) {
        const youtube = parseYouTubeVideoCandidateLive(candidate);
        if (youtube) {
            return {
                media_type: 'video',
                media_provider: 'youtube',
                media_id: youtube.videoId,
                media_url: youtube.watchUrl,
                media_embed_url: youtube.embedUrl,
                poster_image: posterImage || youtube.posterImage,
                media_source: 'readme'
            };
        }

        const nativeVideo = parseNativeVideoCandidateLive(candidate, repo);
        if (nativeVideo) {
            return {
                ...nativeVideo,
                poster_image: posterImage,
                media_source: 'readme'
            };
        }
    }

    return null;
}

function extractReadmeImageLive(markdown, repo) {
    const candidates = [];

    for (const match of markdown.matchAll(/!\[[^\]]*\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi)) {
        candidates.push(match[1]);
    }
    for (const match of markdown.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        candidates.push(match[1]);
    }

    for (const candidate of candidates) {
        const resolved = resolveRepoAssetUrlLive(candidate, repo, true);
        if (resolved) return { url: resolved, source: 'readme' };
    }

    return null;
}

function extractReadmeVideoPosterLive(markdown, repo) {
    const match = /<video\b[^>]*\bposter=["']([^"']+)["']/i.exec(markdown);
    return match?.[1] ? resolveRepoAssetUrlLive(match[1], repo, true) : null;
}

function collectReadmeAssetCandidatesLive(markdown) {
    const candidates = [];
    const seen = new Set();
    const push = (value) => {
        const cleaned = String(value || '')
            .trim()
            .replace(/^<|>$/g, '')
            .replace(/&amp;/g, '&')
            .replace(/[.,;]+$/g, '');
        if (!cleaned || seen.has(cleaned)) return;
        seen.add(cleaned);
        candidates.push(cleaned);
    };

    const patterns = [
        /<video[^>]+src=["']([^"']+)["']/gi,
        /<source[^>]+src=["']([^"']+)["']/gi,
        /<iframe[^>]+src=["']([^"']+)["']/gi,
        /!\[[^\]]*\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi,
        /\[[^\]]+\]\((?:<)?([^)\r\n>]+)(?:>)?(?:\s+"[^"]*")?\)/gi
    ];

    for (const pattern of patterns) {
        for (const match of markdown.matchAll(pattern)) push(match[1]);
    }
    for (const match of markdown.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) push(match[0]);

    return candidates;
}

function parseNativeVideoCandidateLive(candidate, repo) {
    const extensionMatch = /\.(mp4|webm)(?:$|[?#])/i.exec(String(candidate || ''));
    if (!extensionMatch) return null;

    const provider = extensionMatch[1].toLowerCase();
    const resolved = resolveRepoAssetUrlLive(candidate, repo, true);
    if (!resolved) return null;

    return {
        media_type: 'video',
        media_provider: provider,
        media_id: null,
        media_url: resolved,
        media_embed_url: resolved
    };
}

function parseYouTubeVideoCandidateLive(candidate) {
    const value = String(candidate || '').trim();
    if (!value) return null;

    try {
        const url = new URL(value.startsWith('//') ? `https:${value}` : value);
        const host = url.hostname.replace(/^www\./i, '').toLowerCase();
        let videoId = '';

        if (host === 'youtu.be') {
            videoId = url.pathname.split('/').filter(Boolean)[0] || '';
        } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
            if (url.pathname === '/watch') {
                videoId = url.searchParams.get('v') || '';
            } else {
                const segments = url.pathname.split('/').filter(Boolean);
                if (['embed', 'shorts', 'live'].includes(segments[0])) videoId = segments[1] || '';
            }
        }

        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

        const params = new URLSearchParams({
            autoplay: '1', mute: '1', loop: '1', controls: '0', playlist: videoId,
            playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1'
        });

        return {
            videoId,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`,
            posterImage: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
    } catch {
        return null;
    }
}

function resolveRepoAssetUrlLive(assetPath, repo, preserveQuery = false) {
    if (!assetPath) return null;

    let value = String(assetPath).trim().replace(/^<|>$/g, '');
    if (!value || value.startsWith('data:')) return null;

    const querySuffix = preserveQuery ? (value.match(/\?[^#]*/) || [''])[0] : '';
    value = value.replace(/[?#].*$/, '');

    if (/^https?:\/\//i.test(value)) return `${value}${querySuffix}`;
    if (value.startsWith('//')) return `https:${value}${querySuffix}`;

    const owner = encodeURIComponent(repo.owner?.login || '');
    const name = encodeURIComponent(repo.name || '');
    const branch = encodeURIComponent(repo.default_branch || 'main');

    if (value.startsWith('/')) {
        return `https://raw.githubusercontent.com/${owner}/${name}/${branch}${value}${querySuffix}`;
    }

    const normalized = value.replace(/^(\.\/)+/, '').replace(/^\//, '');
    if (!normalized) return null;

    return `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${normalized.split('/').map(encodeURIComponent).join('/')}${querySuffix}`;
}

function markdownExcerptLive(markdown, limit) {
    const text = String(markdown || '')
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

function buildLiveGithubProject(repo, manifest, readme, index, pinnedOrder) {
    const repoKey = normalizeRepoKeyLive(repo.full_name);
    const pinnedRank = pinnedOrder?.has(repoKey) ? pinnedOrder.get(repoKey) : null;
    const category = normalizeCategoryLive(manifest?.category || inferCategoryLive(repo));
    const language = manifest?.language || repo.language || null;
    const createdAt = repo.created_at || null;
    const updatedAt = repo.pushed_at || repo.updated_at || null;
    const title = manifest?.title || humanRepoNameLive(repo.name);
    const description = manifest?.summary || manifest?.description || readme.excerpt || repo.description || `${title} repository on GitHub.`;
    const cover = manifest?.cover ? resolveRepoAssetUrlLive(manifest.cover, repo, false) : null;
    const image = cover || readme.image || readme.media?.poster_image || `https://opengraph.githubassets.com/portfolio-live/${repo.full_name}`;
    const posterImage = cover || readme.image || readme.media?.poster_image || image;
    const tags = Array.isArray(manifest?.tags) && manifest.tags.length ? manifest.tags.map(String) : [language].filter(Boolean);

    return {
        title,
        type: manifest?.type || inferTypeLive(category, language),
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
        accent: LIVE_GITHUB_PORTFOLIO.accents[index % LIVE_GITHUB_PORTFOLIO.accents.length],
        source: 'github',
        repo: repo.name,
        github_full_name: repo.full_name,
        sync_note: pinnedRank !== null ? 'Pinned on GitHub profile' : 'Live GitHub profile data',
        created_at: createdAt,
        updated_at: updatedAt,
        language,
        default_branch: repo.default_branch || 'main',
        visibility: repo.visibility || (repo.private ? 'private' : 'public'),
        github_stats: {
            stars: Number(repo.stargazers_count || 0),
            forks: Number(repo.forks_count || 0),
            watchers: Number(repo.watchers_count || 0),
            issues: Number(repo.open_issues_count || 0)
        }
    };
}

function renderLiveWorkProjects(projects) {
    const grid = document.getElementById('projectGrid');
    if (!grid) return;

    const oldGithubItems = [...grid.querySelectorAll('.project-item')]
        .filter((item) => item.querySelector('[data-github-repo]'));
    oldGithubItems.forEach((item) => item.remove());

    const firstManualItem = [...grid.querySelectorAll('.project-item')]
        .find((item) => !item.querySelector('[data-github-repo]')) || null;
    const fragment = htmlToFragmentLive(projects.map((project, index) => renderLiveWorkCard(project, index)).join(''));
    grid.insertBefore(fragment, firstManualItem);

    updateLiveProjectFilters();
    updateLiveSyncIntro(projects.length);
    setupProjectFilters();
    setupRevealAnimations(grid);
}

function renderLiveTopProjects(grid, projects) {
    if (!grid) return;

    if (!projects.length) {
        const lang = currentPortfolioLanguageLive();
        const t = LIVE_GITHUB_TEXT[lang];
        grid.innerHTML = `<div class="col-12">
            <article class="guide-card reveal">
                <span class="guide-label">GitHub</span>
                <h2>${escapeHtmlLive(t.featuredEmptyTitle)}</h2>
                <p>${escapeHtmlLive(t.featuredEmptyCopy)}</p>
            </article>
        </div>`;
    } else {
        grid.innerHTML = projects.map((project, index) => renderLiveHomeCard(project, index)).join('');
    }

    setupRevealAnimations(grid);
}

function renderLiveWorkCard(project, index) {
    const lang = currentPortfolioLanguageLive();
    const t = LIVE_GITHUB_TEXT[lang];
    const created = formatDateLive(project.created_at, lang) || project.year || '—';
    const pushed = formatDateLive(project.updated_at, lang) || '—';
    const visibility = t.visibility[String(project.visibility || 'public').toLowerCase()] || String(project.visibility || 'public');
    const topics = Array.isArray(project.topics) ? project.topics.slice(0, 4) : [];
    const overlay = `<div class="project-thumb-overlay">
        <span class="guide-label">${escapeHtmlLive(t.exhibition)}</span>
        <strong>${escapeHtmlLive(project.github_full_name || project.title)}</strong>
    </div>`;

    return `<div class="col-12 project-item" data-category="${escapeHtmlLive(project.category || 'system')}" data-live-github-project>
        <article class="project-card project-card-large github-gallery-card reveal reveal-delay-${Math.min((index % 3) + 1, 3)} ${escapeHtmlLive(project.accent)}" data-github-repo="${escapeHtmlLive(project.github_full_name)}">
            ${renderLiveProjectMedia(project, { large: true, context: 'work', index, overlayHtml: overlay, placeholderLabel: t.placeholderGithub })}
            <div class="project-body">
                <div class="project-topline">
                    <div class="project-stamp wide"><span>${String(index + 1).padStart(2, '0')}</span><small>${escapeHtmlLive(created)}</small></div>
                    <div class="project-meta"><span>${escapeHtmlLive(visibility)}</span><span>${escapeHtmlLive(project.default_branch || 'main')}</span></div>
                </div>
                <h2>${escapeHtmlLive(project.title)}</h2>
                <p>${escapeHtmlLive(project.description || '')}</p>
                <p class="project-source-note">${escapeHtmlLive(t.descriptionSource)}: ${escapeHtmlLive(project.description_source || 'GitHub metadata')}.</p>
                <div class="github-stat-grid">
                    <div class="github-stat"><span>Stars</span><strong>${formatCompactNumber(project.github_stats?.stars || 0)}</strong></div>
                    <div class="github-stat"><span>${escapeHtmlLive(t.forks)}</span><strong>${formatCompactNumber(project.github_stats?.forks || 0)}</strong></div>
                    <div class="github-stat"><span>${escapeHtmlLive(t.watchers)}</span><strong>${formatCompactNumber(project.github_stats?.watchers || 0)}</strong></div>
                    <div class="github-stat"><span>Issues</span><strong>${formatCompactNumber(project.github_stats?.issues || 0)}</strong></div>
                </div>
                <div class="github-chip-row">
                    <span class="github-chip">${escapeHtmlLive(t.created)} / ${escapeHtmlLive(created)}</span>
                    <span class="github-chip">${escapeHtmlLive(t.language)} / ${escapeHtmlLive(project.language || '—')}</span>
                    <span class="github-chip">${escapeHtmlLive(t.lastPush)} / ${escapeHtmlLive(pushed)}</span>
                    <span class="github-chip">${escapeHtmlLive(project.sync_note)}</span>
                </div>
                <div class="tag-row">${topics.map((topic) => `<span>${escapeHtmlLive(topic)}</span>`).join('')}</div>
                <div class="project-links">
                    ${project.live ? `<a href="${escapeHtmlLive(project.live)}" target="_blank" rel="noreferrer">${escapeHtmlLive(t.live)}</a>` : ''}
                    <a href="${escapeHtmlLive(project.github)}" target="_blank" rel="noreferrer">${escapeHtmlLive(t.source)}</a>
                </div>
            </div>
        </article>
    </div>`;
}

function renderLiveHomeCard(project, index) {
    const lang = currentPortfolioLanguageLive();
    const t = LIVE_GITHUB_TEXT[lang];
    const tags = Array.isArray(project.tags) ? project.tags : [];
    const categoryMeta = t.categoryMeta[project.category] || humanizeCategoryLive(project.category).toUpperCase();

    return `<div class="col-lg-4 col-md-6" data-live-top-project>
        <article class="project-card reveal reveal-delay-${Math.min(index + 1, 3)} ${escapeHtmlLive(project.accent)}" data-github-repo="${escapeHtmlLive(project.github_full_name)}">
            ${renderLiveProjectMedia(project, { context: 'home', index, placeholderLabel: t.placeholderGithub })}
            <div class="project-body">
                <div class="project-stamp"><span>${String(index + 1).padStart(2, '0')}</span><small>${escapeHtmlLive(project.language || project.year || project.type || '')}</small></div>
                <div class="project-meta"><span>${escapeHtmlLive(project.type || '')}</span><span>${escapeHtmlLive(categoryMeta)}</span><span>${escapeHtmlLive(t.sourceGithub)}</span></div>
                <h3>${escapeHtmlLive(project.title)}</h3>
                <p>${escapeHtmlLive(project.description || '')}</p>
                <div class="github-mini-stats"><span>★ ${formatCompactNumber(project.github_stats?.stars || 0)}</span><span>${escapeHtmlLive(t.forks)} ${formatCompactNumber(project.github_stats?.forks || 0)}</span><span>${escapeHtmlLive(t.watchers)} ${formatCompactNumber(project.github_stats?.watchers || 0)}</span></div>
                <div class="tag-row">${tags.map((tag) => `<span>${escapeHtmlLive(tag)}</span>`).join('')}</div>
                <div class="project-links">${project.live ? `<a href="${escapeHtmlLive(project.live)}" target="_blank" rel="noreferrer">${escapeHtmlLive(t.live)}</a>` : ''}<a href="${escapeHtmlLive(project.github)}" target="_blank" rel="noreferrer">${escapeHtmlLive(t.source)}</a></div>
            </div>
        </article>
    </div>`;
}

function renderLiveProjectMedia(project, options = {}) {
    if (project.media_type === 'video' && project.media_provider && (project.media_url || project.media_embed_url)) {
        return renderLiveProjectVideo(project, options);
    }

    if (project.image) {
        const classes = ['project-thumb'];
        if (options.large) classes.push('project-thumb-large');
        if (project.image_source === 'readme') classes.push('readme-thumb');
        return `<div class="${classes.join(' ')}"><img src="${escapeHtmlLive(project.image)}" alt="${escapeHtmlLive(project.title)}" loading="lazy">${options.overlayHtml || ''}</div>`;
    }

    return renderLiveProjectPlaceholder(project, options);
}

function renderLiveProjectVideo(project, options = {}) {
    const lang = currentPortfolioLanguageLive();
    const t = LIVE_GITHUB_TEXT[lang];
    const classes = ['project-thumb'];
    if (options.large) classes.push('project-thumb-large');
    classes.push('project-media-frame');

    const mediaId = `project-media-live-${sanitizeDomTokenLive(options.context || 'project')}-${sanitizeDomTokenLive(project.github_full_name || project.title)}-${options.index || 0}`;
    const fallbackImage = project.poster_image || project.image;
    const fallback = fallbackImage
        ? `<img class="project-media-fallback" src="${escapeHtmlLive(fallbackImage)}" alt="${escapeHtmlLive(project.title)}" loading="lazy">`
        : renderLiveProjectPlaceholder(project, options, true);

    let player = '';
    if (project.media_provider === 'youtube' && project.media_id && project.media_embed_url) {
        player = `<div class="project-media-player project-media-player-youtube" id="${escapeHtmlLive(mediaId)}" data-video-id="${escapeHtmlLive(project.media_id)}" data-embed-url="${escapeHtmlLive(project.media_embed_url)}"></div>`;
    } else if (['mp4', 'webm'].includes(project.media_provider) && project.media_url) {
        const mime = project.media_provider === 'webm' ? 'video/webm' : 'video/mp4';
        player = `<video class="project-media-player project-media-player-native" muted loop playsinline preload="metadata"${project.poster_image ? ` poster="${escapeHtmlLive(project.poster_image)}"` : ''}><source src="${escapeHtmlLive(project.media_url)}" type="${mime}"></video>`;
    }

    if (!player) return renderLiveProjectMedia({ ...project, media_type: null }, options);

    return `<div class="${classes.join(' ')}" data-project-media data-media-provider="${escapeHtmlLive(project.media_provider)}" data-playback="playing">
        ${fallback}${player}
        <button class="project-media-toggle" type="button" hidden data-play-label="${escapeHtmlLive(t.mediaPlay)}" data-stop-label="${escapeHtmlLive(t.mediaStop)}">${escapeHtmlLive(t.mediaStop)}</button>
        ${options.overlayHtml || ''}
    </div>`;
}

function renderLiveProjectPlaceholder(project, options = {}, fallbackOnly = false) {
    const classes = ['project-thumb'];
    if (options.large) classes.push('project-thumb-large');
    classes.push('project-thumb-placeholder', project.accent || 'accent-red');
    if (fallbackOnly) classes.push('project-media-fallback', 'project-media-fallback-placeholder');

    const monogram = String(project.title || '')
        .split(/\s+/).filter(Boolean).slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '').join('') || 'PR';

    return `<div class="${classes.join(' ')}"><span class="placeholder-kicker">${escapeHtmlLive(options.placeholderLabel || 'Project')}</span><strong>${escapeHtmlLive(monogram)}</strong><small>${escapeHtmlLive(project.type || '')}</small></div>`;
}

function updateLiveProjectFilters() {
    const filters = document.getElementById('projectFilters');
    const grid = document.getElementById('projectGrid');
    if (!filters || !grid) return;

    const lang = currentPortfolioLanguageLive();
    const t = LIVE_GITHUB_TEXT[lang];
    const categories = [...new Set(
        [...grid.querySelectorAll('.project-item')]
            .map((item) => item.dataset.category)
            .filter(Boolean)
    )].sort((a, b) => {
        const ia = LIVE_GITHUB_PORTFOLIO.categoryOrder.indexOf(a);
        const ib = LIVE_GITHUB_PORTFOLIO.categoryOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    filters.innerHTML = [
        `<button class="active" data-filter="all" type="button">${escapeHtmlLive(t.all)}</button>`,
        ...categories.map((category) => `<button data-filter="${escapeHtmlLive(category)}" type="button">${escapeHtmlLive(t.categories[category] || humanizeCategoryLive(category))}</button>`)
    ].join('');
}

function updateLiveSyncIntro(count) {
    const card = document.querySelector('.github-sync-intro-card');
    if (!card) return;

    const lang = currentPortfolioLanguageLive();
    const t = LIVE_GITHUB_TEXT[lang];
    const date = new Intl.DateTimeFormat(lang === 'hu' ? 'hu-HU' : lang === 'de' ? 'de-DE' : 'en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date());

    const paragraph = card.querySelector('p');
    if (paragraph) paragraph.textContent = t.syncIntro(count, date);

    const values = card.querySelectorAll('.github-hero-stat strong');
    if (values[0]) values[0].textContent = String(count);
    if (values[1]) values[1].textContent = String(count);
    if (values[2]) values[2].textContent = String(count);
    if (values[3]) values[3].textContent = 'LIVE';
}

function findTopProjectGrid() {
    const heading = [...document.querySelectorAll('.section-heading h2')]
        .find((node) => String(node.textContent || '').trim().toUpperCase() === 'TOP');
    return heading?.closest('section')?.querySelector('.row.g-4.mt-1') || null;
}

function setupProjectFilters() {
    const filterButtons = document.querySelectorAll('#projectFilters button');
    if (!filterButtons.length) return;

    filterButtons.forEach((button) => {
        if (button.dataset.filterBound === 'true') return;
        button.dataset.filterBound = 'true';

        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            document.querySelectorAll('#projectFilters button').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');

            document.querySelectorAll('#projectGrid .project-item').forEach((project) => {
                const isVisible = filter === 'all' || project.dataset.category === filter;
                project.classList.toggle('is-hidden', !isVisible);
            });
        });
    });
}

let liveRevealObserver = null;
function setupRevealAnimations(root = document) {
    if (!('IntersectionObserver' in window)) {
        root.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
        return;
    }

    if (!liveRevealObserver) {
        liveRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    liveRevealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });
    }

    root.querySelectorAll('.reveal:not([data-reveal-bound])').forEach((element) => {
        element.dataset.revealBound = 'true';
        liveRevealObserver.observe(element);
    });
}

function htmlToFragmentLive(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;

    async function worker() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
    return results;
}

function inferCategoryLive(repo) {
    const value = `${repo.language || ''} ${repo.name || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
    if (/unity|godot|game|csharp/.test(value)) return 'game';
    if (/python|discord|bot/.test(value)) return 'python';
    if (/arduino|raspberry|hardware|electronics|iot/.test(value)) return 'hardware';
    if (/html|css|php|javascript|typescript|react|next|web|site/.test(value)) return 'web';
    return 'system';
}

function inferTypeLive(category, language) {
    if (category === 'web') return 'Website / Web Build';
    if (category === 'python') return 'Python Tool';
    if (category === 'game') return 'Game / Prototype';
    if (category === 'hardware') return 'Hardware / Automation';
    return language ? `${language} Project` : 'System Project';
}

function normalizeCategoryLive(value) {
    return String(value || 'system').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'system';
}

function normalizeRepoKeyLive(value) {
    return String(value || '').trim().toLowerCase();
}

function humanRepoNameLive(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeCategoryLive(value) {
    return String(value || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateLive(value, lang) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const locale = lang === 'hu' ? 'hu-HU' : lang === 'de' ? 'de-DE' : 'en-US';
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function currentPortfolioLanguageLive() {
    const match = window.location.pathname.match(/\/(hu|en|de)(?:\/|$)/);
    return match?.[1] || document.documentElement.lang || 'hu';
}

function sanitizeDomTokenLive(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function escapeHtmlLive(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

