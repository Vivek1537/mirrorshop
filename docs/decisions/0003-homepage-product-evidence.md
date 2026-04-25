# Decision 0003: Merge homepage and first product page into one audit payload

Date: 2026-04-21

We considered auditing only the homepage, but chose to merge homepage evidence with the first discovered product page because Shopify product detail pages usually contain the strongest evidence for product category, ingredients, price posture, shipping claims, and structured product schema.

The scraper payload keeps source coverage explicit so the dashboard can show which public inputs were inspected.
