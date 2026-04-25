# Decision 0005: Build the scan flow as an injectable service before wiring HTTP

Date: 2026-04-21

We considered starting with an Express or Next.js route, but chose an injectable scan service first because the product contract can be verified without Cloudflare, K3s, Groq credentials, or Playwright.

The service accepts request data and injected scraper/analyzer functions. The web layer can stay thin and reuse the same verified flow.
