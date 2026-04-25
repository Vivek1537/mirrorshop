import assert from "node:assert/strict";
import test from "node:test";
import { buildScrapePayload } from "../src/core/scrape-payload.js";
import { ERROR_CODES } from "../src/core/errors.js";
import { runScan } from "../src/core/scan-service.js";

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

test("runScan returns audit plus deterministic llms.txt", async () => {
  const response = await runScan({
    url: "https://glowjar.example/products/ignored",
    identities: ["Vegan", "Affordable", "Next-day shipping"]
  }, {
    scrapeStorefront: async () => scrapePayload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "An AI shopping agent could infer premium handmade skincare.",
      inferred_identities: ["Premium skincare", "Handmade", "Giftable"],
      submitted_results: [
        { label: "Vegan", status: "UNCLEAR", evidence: "No vegan certification evidence found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Vegan proof missing", fix: "Add vegan certification evidence." }
      ],
      llms_txt_descriptions: {
        "/products/vitamin-c-serum": "Brightening serum made in small batches.",
        "/policies/shipping-policy": "Shipping policy page for delivery timing."
      }
    }),
    resolveStoreName: () => "GlowJar"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.inferred_identities[0], "Premium skincare");
  assert.match(response.data.llms_txt, /^# GlowJar/m);
  assert.match(response.data.llms_txt, /\/products\/vitamin-c-serum/);
  assert.equal(response.data.scrape.source_coverage.product_page, true);
});

test("runScan validates https URL and identity count", async () => {
  const response = await runScan({
    url: "http://glowjar.example",
    identities: ["Vegan"]
  }, {});

  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERROR_CODES.BAD_REQUEST);
  assert.match(response.error.message, /https/);
});

test("runScan preserves requested product path for the scraper", async () => {
  let requestedUrl = null;

  const response = await runScan({
    url: "https://glowjar.example/products/vitamin-c-serum?variant=123",
    identities: ["Vegan"]
  }, {
    scrapeStorefront: async (url) => {
      requestedUrl = url;
      return scrapePayload;
    },
    analyzeVisibility: async () => JSON.stringify({
      summary: "An AI shopping agent could infer premium handmade skincare.",
      inferred_identities: ["Premium skincare"],
      submitted_results: [
        { label: "Vegan", status: "UNCLEAR", evidence: "No vegan certification evidence found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Vegan proof missing", fix: "Add vegan certification evidence." }
      ],
      llms_txt_descriptions: {}
    })
  });

  assert.equal(response.ok, true);
  assert.equal(requestedUrl, "https://glowjar.example/products/vitamin-c-serum");
});

test("runScan accepts llms descriptions for scanned product pages even when not present in internal links", async () => {
  const payloadWithoutProductLink = buildScrapePayload({
    storeUrl: "https://glowjar.example",
    homepage: {
      title: "GlowJar",
      h1: "Handmade skincare",
      text: "Premium handmade skincare for gifting.",
      internalLinks: [
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
    url: "https://glowjar.example/products/vitamin-c-serum",
    identities: ["Vegan"]
  }, {
    scrapeStorefront: async () => payloadWithoutProductLink,
    analyzeVisibility: async () => JSON.stringify({
      summary: "An AI shopping agent could infer premium handmade skincare.",
      inferred_identities: ["Premium skincare"],
      submitted_results: [
        { label: "Vegan", status: "UNCLEAR", evidence: "No vegan certification evidence found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Vegan proof missing", fix: "Add vegan certification evidence." }
      ],
      llms_txt_descriptions: {
        "/products/vitamin-c-serum": "Brightening serum made in small batches."
      }
    }),
    resolveStoreName: () => "GlowJar"
  });

  assert.equal(response.ok, true);
  assert.match(response.data.llms_txt, /\/products\/vitamin-c-serum\): Brightening serum made in small batches\./);
});

test("runScan maps invalid analysis output to a structured error", async () => {
  const response = await runScan({
    url: "https://glowjar.example",
    identities: ["Vegan"]
  }, {
    scrapeStorefront: async () => scrapePayload,
    analyzeVisibility: async () => "{not-json"
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERROR_CODES.SCRAPE_FAILED);
  assert.match(response.error.details.cause, /not valid JSON/);
});

test("runScan upgrades premium-style FAIL to UNCLEAR when indirect quality evidence exists", async () => {
  const premiumPayload = buildScrapePayload({
    storeUrl: "https://bombas.example",
    homepage: {
      title: "Bombas",
      h1: "Comfort-first essentials",
      text: "Shop socks built for everyday comfort.",
      internalLinks: [
        { href: "/products/mens-compression-calf-socks", text: "Compression Socks" }
      ]
    },
    productPage: {
      url: "/products/mens-compression-calf-socks",
      title: "Men's Compression Socks",
      h1: "Men's Compression Socks",
      text: "$30 supportive compression socks with engineered cushioning.",
      jsonLd: [
        {
          "@type": "Product",
          name: "Men's Compression Socks",
          description: "Engineered supportive compression socks for long days on your feet.",
          material: "68% Supima cotton, 16% polyester, 9% elastane, 7% nylon",
          offers: {
            "@type": "Offer",
            price: "30.00",
            priceCurrency: "USD"
          }
        }
      ]
    }
  });

  const response = await runScan({
    url: "https://bombas.example/products/mens-compression-calf-socks",
    identities: ["Premium"]
  }, {
    scrapeStorefront: async () => premiumPayload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Comfort-focused"],
      submitted_results: [
        { label: "Premium", status: "FAIL", evidence: "No explicit evidence of premium materials, craftsmanship, or pricing found on the storefront." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Premium proof is missing", fix: "Add premium positioning to the product description." }
      ],
      llms_txt_descriptions: {
        "/products/mens-compression-calf-socks": "Compression product page."
      }
    }),
    resolveStoreName: () => "Bombas"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "UNCLEAR");
  assert.match(response.data.audit.submitted_results[0].evidence, /Indirect quality signals exist/);
});
