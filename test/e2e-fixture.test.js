import assert from "node:assert/strict";
import test from "node:test";
import { buildScrapePayload } from "../src/core/scrape-payload.js";
import { runScan } from "../src/core/scan-service.js";

test("fixture end-to-end scan produces dashboard-ready audit payload", async () => {
  const scrapePayload = buildScrapePayload({
    storeUrl: "https://glowjar.example",
    homepage: {
      title: "GlowJar",
      h1: "Handmade skincare",
      text: "Premium handmade skincare for gifting.",
      internalLinks: [
        { href: "/products/vitamin-c-serum", text: "Vitamin C Serum" },
        { href: "/policies/shipping-policy", text: "Shipping Policy" }
      ]
    },
    productPage: {
      url: "/products/vitamin-c-serum",
      title: "Vitamin C Serum",
      h1: "Brightening Vitamin C Serum",
      text: "Brightening serum made in small batches."
    },
    robotsTxt: "User-agent: *"
  });

  const response = await runScan({
    url: "https://glowjar.example",
    identities: ["Vegan", "Affordable", "Next-day shipping"]
  }, {
    scrapeStorefront: async () => scrapePayload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "An AI shopping agent could infer premium handmade skincare, but shipping speed is not evidenced.",
      inferred_identities: [
        { label: "Premium skincare", because: "Homepage text says \"Premium handmade skincare for gifting.\"." },
        { label: "Handmade", because: "Homepage text says \"Premium handmade skincare for gifting.\"." },
        { label: "Giftable", because: "Homepage text says \"Premium handmade skincare for gifting.\"." }
      ],
      submitted_results: [
        { label: "Vegan", status: "UNCLEAR", evidence: "No vegan certification evidence found." },
        { label: "Affordable", status: "FAIL", evidence: "Storefront language emphasizes premium positioning." },
        { label: "Next-day shipping", status: "FAIL", evidence: "No next-day shipping claim found." }
      ],
      recommendations: [
        { priority: 1, surface: "shipping policy page", issue: "Shipping speed is not evidenced", fix: "Add a shipping policy page with explicit next-day delivery language." }
      ],
      llms_txt_descriptions: {
        "/products/vitamin-c-serum": "Brightening serum made in small batches.",
        "/policies/shipping-policy": "Shipping policy page for delivery timing."
      }
    }),
    resolveStoreName: () => "GlowJar"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results.length, 3);
  assert.match(response.data.llms_txt, /# GlowJar/);
  assert.match(response.data.llms_txt, /\/policies\/shipping-policy/);
  assert.equal(response.data.scrape.source_coverage.product_page, true);
});
