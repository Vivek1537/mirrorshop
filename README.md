# MirrorShop

AI storefront visibility audit for Shopify merchants.

MirrorShop shows merchants how AI shopping agents may perceive their public storefront. A merchant enters a Shopify URL and up to three target brand identities, and the tool compares that intent against rendered storefront evidence, JSON-LD schema, and machine-readable surfaces. The result is a structured audit with AI perception, per-identity grading, evidence, Shopify-specific fixes, and a deterministic `llms.txt` artifact built from real extracted links.

Live demo: <https://mirrorshop-production.up.railway.app>  
Demo video: final recording link pending before submission

## Tech Stack

- Node.js 18+
- Express-style HTTP API in Node.js
- Playwright with headless Chromium
- Groq `llama-3.3-70b-versatile`
- Vanilla HTML/CSS/JS

## Setup

Requirements: Node.js 18+ and npm.

```bash
git clone <repo-url>
cd mirrorshop
npm install
```

`npm install` runs `playwright-core install chromium` automatically through `postinstall`.

Create `.env` in the repo root:

```bash
GROQ_API_KEY=your_groq_key
INTERNAL_API_KEY=optional_internal_key
PORT=3000
```

Start the app:

```bash
npm start
```

The app runs at `http://localhost:3000`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | Yes | Calls Groq for visibility analysis. |
| `INTERNAL_API_KEY` | No | Reserved for authenticating internal service calls in multi-service deployments; not required for the public demo flow. |
| `PORT` | No | Server port; defaults to `3000`. |

## Tests

```bash
npm test
```

## Known Limitations

- Evidence extraction can still include occasional storefront UI chrome text (for example, fragments like "Open search" or "Open cart") in edge layouts.
- Recommendation language quality is improving but may still sound generic for some borderline claims.

## Hackathon Context

Built for the Kasparro Agentic Commerce Hackathon, Track 5 - AI Representation Optimizer, April 2026.

This was a solo submission by Vivek Boora. The work split was roughly 60% engineering and 40% product thinking. Product thinking included problem framing, scope decisions, grading rubric design, `llms.txt` spec research, and testing against five real storefronts. Engineering included the Playwright scraper, Groq integration, deterministic post-processing, audit refinement layer, and Railway deployment.
