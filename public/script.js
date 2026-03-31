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

    setupNavigationSound();
    refreshGithubProjectStats();
});

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

