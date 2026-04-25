import assert from "node:assert/strict";
import test from "node:test";
import { buildScrapePayload, INTERNAL_LINK_LIMIT } from "../src/core/scrape-payload.js";

test("builds merged homepage plus product-page evidence payload", () => {
  const payload = buildScrapePayload({
    storeUrl: "https://glowjar.example/some/path?ignored=true",
    homepage: {
      url: "https://glowjar.example/",
      title: "GlowJar",
      h1: "Handmade skincare",
      text: "Premium handmade skincare for gifting.",
      jsonLd: [{ "@type": "Organization", name: "GlowJar" }],
      internalLinks: [
        { href: "/products/vitamin-c-serum?variant=1", text: "Vitamin C Serum" },
        { href: "/policies/shipping-policy", text: "Shipping" },
        { href: "https://outside.example/products/not-internal", text: "External" }
      ]
    },
    productPage: {
      url: "/products/vitamin-c-serum",
      title: "Vitamin C Serum",
      h1: "Brightening Vitamin C Serum",
      text: "Brightening serum made in small batches.",
      jsonLd: [{ "@type": "Product", name: "Vitamin C Serum" }],
      internalLinks: [
        { href: "/products/vitamin-c-serum", text: "Duplicate product" },
        { href: "/pages/about", text: "About" }
      ]
    },
    robotsTxt: "User-agent: *",
    existingLlmsTxt: null
  });

  assert.equal(payload.store_url, "https://glowjar.example");
  assert.equal(payload.pages.length, 2);
  assert.equal(payload.source_coverage.homepage, true);
  assert.equal(payload.source_coverage.product_page, true);
  assert.equal(payload.source_coverage.robots_txt, true);
  assert.equal(payload.source_coverage.llms_txt_existing, false);
  assert.equal(payload.source_coverage.json_ld, true);
  assert.match(payload.evidence_text, /Premium handmade skincare/);
  assert.match(payload.evidence_text, /Brightening serum made in small batches/);
  assert.deepEqual(payload.internal_links.map((link) => link.path), [
    "/products/vitamin-c-serum",
    "/policies/shipping-policy",
    "/pages/about"
  ]);
});

test("caps merged internal links to the scan contract limit", () => {
  const manyLinks = Array.from({ length: INTERNAL_LINK_LIMIT + 5 }, (_, index) => ({
    href: `/products/item-${index}`,
    text: `Item ${index}`
  }));

  const payload = buildScrapePayload({
    storeUrl: "https://glowjar.example",
    homepage: {
      text: "Homepage text",
      internalLinks: manyLinks
    }
  });

  assert.equal(payload.internal_links.length, INTERNAL_LINK_LIMIT);
  assert.equal(payload.source_coverage.product_page, false);
});

test("rejects missing homepage payload", () => {
  assert.throws(() => {
    buildScrapePayload({
      storeUrl: "https://glowjar.example",
      homepage: null
    });
  }, /homepage page is required/);
});
