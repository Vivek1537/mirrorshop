# MirrorShop

AI storefront visibility audit for Shopify merchants.

MirrorShop shows merchants how AI shopping agents may perceive their public storefront. A merchant enters a Shopify URL and up to three target brand identities, and the tool compares that intent against rendered storefront evidence, JSON-LD schema, and machine-readable surfaces. The result is a structured audit with AI perception, per-identity grading, evidence, Shopify-specific fixes, and a deterministic `llms.txt` artifact built from real extracted links.

Live demo: <https://mirrorshop-production.up.railway.app>  
Demo video: <https://drive.google.com/file/d/1VR9atqM_Yo5TgpymwnXrWLnWmtap7bXa/view?usp=drive_link>

## Problem Statement

Shopify merchants do not have a reliable way to see how AI shopping agents interpret their public storefront. MirrorShop audits the rendered storefront, structured data, and machine-readable surfaces to show where merchant intent and AI inference match, where they drift apart, and what to fix.

## Submission Docs

- Product document: [docs/product-document.md](/mnt/d/Projects/mirrorshop/docs/product-document.md)
- Technical document: [docs/technical-document.md](/mnt/d/Projects/mirrorshop/docs/technical-document.md)
- Decision log: [docs/decision-log.md](/mnt/d/Projects/mirrorshop/docs/decision-log.md)
- Product walkthrough: [docs/product-walkthrough.md](/mnt/d/Projects/mirrorshop/docs/product-walkthrough.md)

## Tech Stack

- Node.js 18+
- Express-style HTTP API in Node.js
- Playwright with headless Chromium
- Groq `llama-3.3-70b-versatile`
- Vanilla HTML/CSS/JS

## Setup

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/Vivek1537/mirrorshop.git
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

## Product Walkthrough

1. Open the app and enter a Shopify storefront URL.
2. Add one to three target identities the merchant wants AI agents to recognize.
3. Run the audit to collect rendered storefront evidence, schema, and machine-readable signals.
4. Review the AI perception summary, inferred identities, and per-identity `PASS` / `UNCLEAR` / `FAIL` results.
5. Use the recommended Shopify fixes and generated `llms.txt` artifact to improve AI-facing representation.

## Screenshots

Audit dashboard demo:

![MirrorShop audit dashboard](/mnt/d/Projects/mirrorshop/docs/screenshots/mirrorshop-audit-demo.png)

Suggested additional captures if you want to expand this section later:

- Input form with sample identities
- Evidence cards showing one `PASS` and one `FAIL`
- Generated `llms.txt` artifact panel

## Known Limitations

- Evidence extraction can still include occasional storefront UI chrome text (for example, fragments like "Open search" or "Open cart") in edge layouts.
- Recommendation language quality is improving but may still sound generic for some borderline claims.

## Hackathon Context

Built for the Kasparro Agentic Commerce Hackathon, Track 5 - AI Representation Optimizer, April 2026.

This was a solo submission by Vivek Boora. The work split was roughly 60% engineering and 40% product thinking. Product thinking included problem framing, scope decisions, grading rubric design, `llms.txt` spec research, and testing against five real storefronts. Engineering included the Playwright scraper, Groq integration, deterministic post-processing, audit refinement layer, and Railway deployment.
