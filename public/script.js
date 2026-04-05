document.addEventListener('DOMContentLoaded', () => {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    reveals.forEach((element) => observer.observe(element));

    const filterButtons = document.querySelectorAll('#projectFilters button');
    const projectItems = document.querySelectorAll('.project-item');

    if (filterButtons.length && projectItems.length) {
        filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const filter = button.dataset.filter;
                filterButtons.forEach((item) => item.classList.remove('active'));
                button.classList.add('active');

                projectItems.forEach((project) => {
                    const isVisible = filter === 'all' || project.dataset.category === filter;
                    project.classList.toggle('is-hidden', !isVisible);
                });
            });
        });
    }

    setupProjectMedia();
    setupNavigationSound();
    refreshGithubProjectStats();
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

function setupProjectMedia() {
    const mediaCards = [...document.querySelectorAll('[data-project-media]')];
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

function setupNavigationSound() {
    const navigationLinks = document.querySelectorAll('a[href]');
    const soundPath = window.location.pathname.match(/\/(hu|en|de)\//)
        ? '../voice/mouse-click.mp3'
        : './voice/mouse-click.mp3';

    const clickSound = new Audio(soundPath);
    clickSound.preload = 'auto';
    clickSound.volume = 1;

    clickSound.addEventListener('canplaythrough', () => {
        console.log('Hang betoltve:', soundPath);
    });

    clickSound.addEventListener('error', () => {
        console.error('Nem toltheto be a hangfajl:', soundPath);
    });

    navigationLinks.forEach((link) => {
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
                clickSound.pause();
                clickSound.currentTime = 0;
                await clickSound.play();
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

