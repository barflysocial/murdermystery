# Noir Nightlife Mystery Series

A mobile-first, browser-based mystery game with a reusable case engine, progression system, interactive maps, and multiple playable crimes.

## Included Cases
- Crime 001 — The Karaoke Killer
- Crime 002 — The Dead Aim
- Crime 003 — The House Never Mourns

## Project Files
- `index.html` — app shell
- `styles.css` — visual styling
- `app.js` — game engine and UI logic
- `cases.json` — case manifest and progression order
- `case_001.json` — Crime 001 content
- `case_002.json` — Crime 002 content
- `case_003.json` — Crime 003 content
- `render.yaml` — Render deploy config

## Run Locally
Open `index.html` in a browser.

For the cleanest test, use an incognito/private window or clear site storage first so old local saves do not interfere with progression or case state.

## Deploy to GitHub + Render
1. Create a new GitHub repository.
2. Upload all files in this folder.
3. Commit to the `main` branch.
4. In Render, create a new Static Site connected to that repo.
5. Leave the build command blank.
6. Set the publish directory to `.` if Render asks.
7. Deploy.

You can also keep `render.yaml` in the repo root and deploy using Render Blueprint flow.

## Notes
- This is a static client-side app.
- Case JSON files are readable in the repo and browser network requests.
- Save data and progression are stored in browser local storage.
