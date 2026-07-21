# Gibly's Trap Team Collection Tracker

A polished mobile-first static PWA for tracking a complete Skylanders: Trap Team villain and Traptanium Trap collection.

## Dataset

- 46 trappable villains in `src/data/villains.json`.
- 60 core physical Trap releases in `src/data/traps.json`.
- 6 separately listed factory-loaded villain-variant Traps in `src/data/traps.json`.
- Element color metadata in `src/data/elements.json`.
- The uploaded board photo is preserved at `public/board-reference.jpg`.

## Run Locally

Serve the folder with any static file server, then open the local URL in a browser.

```bash
python -m http.server 5173
```

Then visit `http://localhost:5173`.

## Deploy

This app has no build step. Deploy the repository root as a static site.

- Vercel: import the project and keep the build command empty.
- GitHub Pages: the included workflow publishes the repository root from `main`.

## Features

- Villain status tracking: Not Found, Defeated, Trapped, Evolved.
- Trap ownership, quantity, matching element, mold, official name, edition, variant group, and assigned villain.
- Search and filters for element, villain, Trap mold, and variant group.
- Local auto-save with JSON export/import backup.
- Installable PWA shell with offline asset caching.
- Mobile-first board, rack, and reference photo views.
