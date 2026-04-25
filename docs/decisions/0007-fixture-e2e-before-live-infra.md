# Decision 0007: Verify fixture end-to-end before live infra

Date: 2026-04-21

We considered waiting for Cloudflare, K3s, Playwright, and Groq before testing the full flow, but chose a fixture end-to-end path first because it proves the product contract, dashboard shape, and deterministic `llms.txt` boundary without network risk.

Live infrastructure still needs to be wired next; this fixture is not a substitute for a real Shopify scan.
