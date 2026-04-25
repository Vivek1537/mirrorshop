# Decision 0009: Keep the scraper adapter thin and test helper logic separately

Date: 2026-04-21

We considered tightly coupling Playwright page automation and extraction logic in one large function, but chose a thin adapter over testable helper functions because the browser runtime is the unstable part of this environment, not the payload shaping rules.

The adapter handles navigation and DOM evaluation. Pure helpers handle text cleaning, product-link choice, internal-link normalization, and page snapshot shaping.
