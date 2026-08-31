# Ridvon

Stock trading dashboard: live quotes, fundamentals, technicals, watchlist, and Grok analysis.

[![CI](https://github.com/mohdquadri/ridvon/actions/workflows/ci.yml/badge.svg)](https://github.com/mohdquadri/ridvon/actions/workflows/ci.yml)

## Setup

```bash
npm install
cp .env.example .env
# add XAI_API_KEY if you want Grok analysis
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## CI/CD

Every push and pull request to `main` runs [GitHub Actions](.github/workflows/ci.yml):

1. `npm ci` — install pinned dependencies from `package-lock.json`
2. `npm run typecheck`
3. `npm run build`

Dependabot opens weekly PRs for npm and Actions updates. Merge a Dependabot PR only after CI is green.

To add deploy (CD), connect the repo to Vercel (or similar) and add `XAI_API_KEY` as a secret. The CI workflow is the gate before that.

Dependencies are pinned in [`package.json`](package.json) and [`package-lock.json`](package-lock.json). Quotes and fundamentals come from Yahoo Finance; earnings surprise from Nasdaq; charts from TradingView; AI analysis from xAI when `XAI_API_KEY` is set.
