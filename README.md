# MirrorShop

MirrorShop is an AI storefront visibility audit for Shopify merchants.

It measures the gap between what a merchant wants AI shopping agents to understand and what an AI shopping agent can actually infer from the public storefront.

`llms.txt` is an output artifact, not the product headline.

## Why it exists

AI shopping agents do not see a brand the way a merchant sees it internally. They infer identity from whatever is publicly visible on the storefront: product copy, policy pages, pricing, structured data, shipping claims, and category navigation.

MirrorShop turns that into a constrained audit:

- scrape the storefront as a public shopper would encounter it
- run a structured AI visibility analysis against merchant-submitted identity claims
- show what the storefront actually supports, what is missing, and where the merchant should fix it
- generate a deterministic `llms.txt` artifact from curated real storefront paths

## What it does

Given a Shopify product URL and one to three target identities, MirrorShop:

1. scrapes the homepage and the product page with Playwright
2. extracts public text, internal links, `robots.txt`, `llms.txt` if present, and JSON-LD
3. sends a constrained prompt to Groq for blind inference plus identity grading
4. validates the response against a strict contract
5. renders an audit showing summary, inferred identities, evidence, recommendations, and deterministic `llms.txt`

## Current capabilities

- Live storefront scraping with Playwright
- Real LLM-backed visibility analysis via Groq
- Strict audit contract validation
- Deterministic `llms.txt` generation with curated real links only
- Store-name resolution from storefront evidence
- Recommendation surfaces normalized to concrete Shopify content areas
- Test coverage for scraping, contract validation, artifact generation, and dashboard rendering

## Stack

- Node.js
- Playwright
- Groq API
- Vanilla HTML, CSS, and JavaScript

## Local setup

### Requirements

- Node.js 20+
- A local Playwright browser install in `.ms-playwright`
- `GROQ_API_KEY` for live analysis

### Install

```bash
npm install
```

### Run the app

```bash
GROQ_API_KEY=your_key_here npm run dev
```

The app will start on `http://127.0.0.1:3000`.

### Run tests

```bash
npm test
```

## Project structure

- `src/adapters/` — Playwright and Groq integrations
- `src/core/` — audit contract, scan pipeline, deterministic artifact logic
- `src/frontend/` — dashboard rendering and client behavior
- `public/` — static shell and styles
- `test/` — unit and integration coverage

## Status

MirrorShop is past the mock stage and already runs end to end on real storefronts. The current work is focused on quality tightening: sharper recommendations, better evidence grading for soft claims, and stronger artifact quality.
