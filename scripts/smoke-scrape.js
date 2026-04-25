import { chromium } from "playwright-core";
import { createPlaywrightScraper } from "../src/adapters/playwright-scraper.js";

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("Usage: npm run smoke:scrape -- https://shop.example");
  process.exit(1);
}

const scraper = createPlaywrightScraper({ playwright: { chromium } });
const payload = await scraper(targetUrl);
console.log(JSON.stringify(payload, null, 2));
