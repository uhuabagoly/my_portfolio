BRUTALISTA PORTFÓLIÓ VERZIÓ – GITHUB SYNC FRISSÍTÉS

Ez a kiadás a brutalista / tárlatvezetéses vizuális irányt megtartja,
de két fontos kérést is beépít:
- a sárga accent árnyalat át lett húzva melegebb, narancsos-amber tónusba
- bekerült egy GitHub sync rendszer, ami automatikusan be tudja húzni a repóidat

FŐ VÁLTOZTATÁSOK
- fehér–fekete alapú, plakátszerű megjelenés
- piros + narancs + narancsos-amber accent paletta
- az About oldalon a korábbi timeline helyén már a GitHub sync blokk van
- a Work oldal most már tud kézi projektekből és GitHub cache-ből együtt dolgozni
- ha egy GitHub projektnek nincs külön borítóképe, akkor poszterszerű monogramos placeholder jelenik meg

ÚJ / FONTOS FÁJLOK
- sync_projects.php
  GitHub API alapú szinkron script.
  Lekéri a repókat, megpróbálja beolvasni a portfolio.json fájlokat,
  majd létrehozza a data/projects.json cache-t.

- github_sync_config.sample.php
  Minta konfiguráció. Ezt másold le github_sync_config.php néven,
  ha saját beállításokat vagy secretet szeretnél.

- portfolio.template.json
  Minta meta-fájl, amit külön repókba tehetsz.
  Ezzel tudod szépen szabályozni a címeket, sorrendet, tageket, képet és accentet.

- data/projects.json
  A legenerált lokális cache a GitHub-ból érkező projektekhez.

- data/github_sync_meta.json
  A legutóbbi sync állapota, darabszámokkal és státusszal.

- .github/workflows/portfolio-sync.yml
  GitHub Actions példa a napi automatikus frissítéshez és kézi indításhoz.

HASZNÁLAT – GYORSAN
1. Másold át a github_sync_config.sample.php fájlt github_sync_config.php névre.
2. Állítsd be benne a GitHub felhasználónevet és opcionálisan a tokent.
3. Futtasd a sync_projects.php fájlt.
4. A generált projektek megjelennek a Work oldalon.
5. Ha egy projektet szépen akarsz szabályozni, tegyél a repóba portfolio.json fájlt.


DÁTUMMEGJELENÍTÉS JAVÍTÁSA
- ha a data/projects.json cache-ben még nincs created_at mező, az oldal betöltésekor
  megpróbálja közvetlenül a GitHub API-ból lekérni a repository létrehozási dátumát
  és visszaírja a cache-be
- így a projektkártyán a bélyeg és a "Készült" chip napra pontos dátumot tud mutatni
- ha a tárhely kimenő kérései tiltva vannak, futtasd le újra a sync_projects.php-t
