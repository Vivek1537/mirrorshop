# MirrorShop Product Walkthrough

This walkthrough can be used directly in the README, demo narration, or submission notes.

## 1. Input

The merchant lands on a simple audit form and enters:

- A Shopify storefront URL
- One to three target identities, such as `Luxury / Premium`, `Eco-Friendly Packaging`, or `Fast 2-Day Shipping`

This step captures merchant intent before any AI interpretation happens.

## 2. Live Audit

MirrorShop launches a headless browser, loads the public storefront, extracts rendered evidence, gathers JSON-LD schema, and checks machine-readable surfaces such as `robots.txt` and `llms.txt`.

This is intentionally based on the storefront that an AI shopping agent can actually see, not on private Shopify Admin data.

## 3. AI Perception Summary

After evidence collection, MirrorShop returns a concise summary of what an AI shopping agent is likely to infer from the storefront.

This gives the merchant a high-level answer to the core question: "What does AI think my store is about?"

## 4. Identity Comparison

The report separates:

- Submitted identities: what the merchant wants AI to recognize
- Inferred identities: what the storefront actually proves

This gap is the core product insight. It shows whether brand intent is legible to AI systems.

## 5. Evidence Per Identity

Each submitted identity receives a `PASS`, `UNCLEAR`, or `FAIL` result with supporting storefront evidence.

Examples:

- `PASS` when the storefront clearly proves the claim
- `UNCLEAR` when evidence is partial or indirect
- `FAIL` when the claim is missing or contradicted

## 6. Action Plan

MirrorShop then recommends concrete fixes tied to Shopify-controlled surfaces such as:

- Product descriptions
- Policy pages
- Announcement bars
- Collection copy
- Structured metadata

This keeps the output actionable instead of generic.

## 7. Deterministic llms.txt

Finally, MirrorShop generates a deterministic `llms.txt` artifact from real extracted storefront links. The language model can help summarize those links, but it does not invent URLs.

This gives merchants a machine-readable asset they can paste into their storefront with confidence.
