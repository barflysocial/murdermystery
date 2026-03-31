# Barfly Mystery Files — GitHub + Render Deploy

This project is a static multi-case mystery app.

## Files to upload
- index.html
- styles.css
- app.js
- cases.json
- case_001.json
- case_002.json
- case_003.json
- render.yaml

## GitHub (browser upload)
1. Create a new GitHub repository.
2. Click **Add file** > **Upload files**.
3. Upload all files listed above.
4. Commit to your main branch.

## GitHub (git command line)
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Render deploy
This app should be deployed as a **Static Site**.

### Option A — Dashboard
1. In Render, click **New** > **Static Site**.
2. Connect your GitHub repo.
3. Select the branch to deploy.
4. Use these values:
   - **Build Command:** leave blank
   - **Publish Directory:** `.`
5. Create the static site.

### Option B — Blueprint
If Render detects `render.yaml` in the repo root, you can deploy it as a Blueprint.

## Important notes
- This project is fully static. It does **not** need Node, a server, or a database to run.
- The JSON case files must stay in the repo root unless you also update the fetch paths in `app.js` or `cases.json`.
- If you rename files, update the manifest in `cases.json`.

## After deploy
- Open the Render URL and test:
  - Home screen
  - Crime 001
  - Crime 002
  - Crime 003
  - progression unlocks
  - map tabs
  - final accusation flow
