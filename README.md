# Callsito — Zero-Trust AI Execution Gateway (Mockup)

A fully local, mocked frontend prototype. No backend, no network calls,
no environment variables — everything is simulated in the browser.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push this repo to GitHub (see steps below).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Edit `vite.config.js` and set `base` to `/<your-repo-name>/`
   (e.g. `/guardian-agent-demo/`). If your repo is named
   `<your-username>.github.io`, set `base: "/"` instead.
4. Push to `main` — the included workflow
   (`.github/workflows/deploy.yml`) builds and deploys automatically.
5. Your site will be live at `https://<your-username>.github.io/<your-repo-name>/`.
