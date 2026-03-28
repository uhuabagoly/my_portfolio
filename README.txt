Ez a csomag a portfolio_static_ready.zip kibővített változata.

Mit tartalmaz:
- .github/workflows/update-portfolio-pages.yml
- scripts/sync-github-projects.mjs
- scripts/render-static.mjs
- scripts/prepare-public-dir.mjs
- package.json
- módosított hu/en/de index.html és work.html fájlok marker kommentekkel

Mit csinál:
1) lekéri a GitHub repóadatokat API-ból
2) frissíti a data/projects.json és data/github_sync_meta.json fájlokat
3) újrarendereli a statikus HTML oldalakat
4) előkészíti a public/ mappát
5) deployolja GitHub Pages-re

GitHub beállítás:
- Repo Settings > Pages > Source: GitHub Actions
- Opcionális secret: PORTFOLIO_GITHUB_TOKEN
- Branch: main

Lokális build parancs:
- npm run build:pages

Fontos:
- nincs szükség PHP-ra
- a GitHub Pages-re a workflow a public/ mappát deployolja
