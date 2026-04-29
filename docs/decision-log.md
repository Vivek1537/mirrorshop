# MirrorShop Decision Log

## Scraping Approach
**Considered:** Cheerio static HTML parsing versus Playwright with headless Chromium.

**Chose:** Playwright.

**Because:** Shopify storefronts often rely on JavaScript-rendered themes such as Dawn. Cheerio can fetch the initial HTML, but it cannot execute JavaScript, so it would often return a skeletal DOM and miss the product content, badges, schema context, and rendered copy that AI shopping agents actually see.

**Outcome:** MirrorShop audits the rendered public storefront instead of a partial server response, which makes the visibility test closer to how an AI shopping agent would inspect the store.

## Deployment Platform
**Considered:** Vercel serverless, an existing K3s cluster, and Railway.

**Chose:** Railway.

**Because:** Vercel serverless was a poor fit for Playwright because Chromium makes the runtime footprint roughly hundreds of megabytes, well beyond typical small function package limits. K3s was already available, but Cloudflare Tunnel setup introduced deployment risk during the hackathon. Railway provided the simplest single-service deploy path without fighting the browser runtime size.

**Outcome:** The live demo runs on Railway, keeping the audit behavior faithful to the product requirement without fighting serverless size constraints.

## Hydration Wait Strategy
**Considered:** Waiting for `networkidle` versus waiting for stable storefront selectors.

**Chose:** Selector-oriented hydration around product and heading content, with `domcontentloaded` navigation as the baseline.

**Because:** Shopify stores often keep persistent background connections open for analytics, Klaviyo, live chat, and performance scripts. `networkidle` can either time out or provide a false sense of readiness. Product and heading selectors are more directly tied to the content MirrorShop needs to audit.

**Outcome:** Scrapes became less sensitive to third-party background traffic and more focused on the storefront content that affects AI perception.

## LLM Output Contract
**Considered:** Freeform prose responses versus structured JSON mode.

**Chose:** Groq JSON mode with an explicit response contract.

**Because:** The UI needs to render per-identity cards, evidence, recommendations, inferred identities, and `llms.txt` descriptions predictably. Prose output would require fragile parsing and would make failures harder to diagnose.

**Outcome:** The frontend can render deterministic sections from a stable audit shape, and invalid model responses can be rejected before they reach the user.

## Grading Tiers
**Considered:** Binary `PASS`/`FAIL` grading versus `PASS`/`UNCLEAR`/`FAIL`.

**Chose:** `PASS`/`UNCLEAR`/`FAIL`.

**Because:** Some submitted identities, especially soft positioning claims such as "premium" or "luxury," can have indirect evidence through materials, pricing, or engineered product language without an explicit storefront claim. A binary system would hard-fail cases like Supima cotton at a higher price point, which is technically strict but product-wise misleading.

**Outcome:** MirrorShop can distinguish between missing evidence and partial evidence, giving merchants a more honest middle-ground result.

## Conditional Claim Grading
**Considered:** Relying on prompt instructions versus enforcing conditional claim rules in code.

**Chose:** A deterministic override in `src/core/audit-refinement.js`.

**Because:** The LLM marked "Free Shipping Over $75" as `PASS` for "free shipping" even after prompt rules said conditional claims must fail unconditional identities. A wrong `PASS` on a customer-facing promise is not defensible.

**Outcome:** Conditional shipping and returns claims are forced to `FAIL` when the evidence contains threshold language. A regression test in `test/scan-service.test.js` protects the behavior.

## llms.txt Generation
**Considered:** Letting the LLM generate the full `llms.txt` file versus deterministic assembly in code.

**Chose:** Code assembles the file structure from real extracted links; the LLM writes description lines only.

**Because:** Full LLM generation produced hallucinated URLs. For a machine-readable commerce artifact, invented links would make the output less trustworthy than no artifact at all.

**Outcome:** MirrorShop generates a paste-ready `llms.txt` that is grounded in extracted storefront paths while still using the LLM for concise, evidence-based descriptions.

## Product Page Scraping
**Considered:** Auditing the homepage only versus auditing the homepage plus a product page.

**Chose:** Homepage plus product page.

**Because:** The homepage alone gives weak evidence for product-specific identities such as materials, price positioning, features, or shipping promises. A product page usually contains the strongest schema and merchandising evidence.

**Outcome:** MirrorShop navigates to the submitted product URL when present, or to the first discovered `/products/` link otherwise, improving the quality of identity grading and `llms.txt` output.
