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

test("runScan downgrades conditional free shipping PASS to FAIL for unconditional claims", async () => {
  const shippingPayload = buildScrapePayload({
    storeUrl: "https://bombas.example",
    homepage: {
      title: "Bombas",
      h1: "Comfort-first essentials",
      text: "Free Shipping Over $75 + Free Returns",
      internalLinks: [
        { href: "/pages/help-center", text: "Help Center" }
      ]
    },
    productPage: {
      url: "/products/mens-compression-calf-socks",
      title: "Men's Compression Socks",
      h1: "Men's Compression Socks",
      text: "Free Shipping Over $75 + Free Returns"
    }
  });

  const response = await runScan({
    url: "https://bombas.example/products/mens-compression-calf-socks",
    identities: ["free shipping"]
  }, {
    scrapeStorefront: async () => shippingPayload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Comfort-focused"],
      submitted_results: [
        { label: "free shipping", status: "PASS", evidence: "Free Shipping Over $75 + Free Returns is explicitly stated on the product page." }
      ],
      recommendations: [
        { priority: 1, surface: "announcement bar", issue: "Shipping claim is visible", fix: "No changes needed." }
      ],
      llms_txt_descriptions: {
        "/products/mens-compression-calf-socks": "Compression product page."
      }
    }),
    resolveStoreName: () => "Bombas"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "FAIL");
  assert.match(response.data.audit.submitted_results[0].evidence, /conditional, not unconditional/i);
  assert.match(response.data.audit.submitted_results[0].evidence, /over \$75/i);
});

test("runScan keeps unconditional free shipping PASS when evidence is truly unconditional", async () => {
  const shippingPayload = buildScrapePayload({
    storeUrl: "https://allbirds.example",
    homepage: {
      title: "Allbirds",
      h1: "Everyday essentials",
      text: "Enjoy free shipping on every order.",
      internalLinks: []
    },
    productPage: {
      url: "/products/tree-runner",
      title: "Tree Runner",
      h1: "Tree Runner",
      text: "Enjoy free shipping on every order."
    }
  });

  const response = await runScan({
    url: "https://allbirds.example/products/tree-runner",
    identities: ["free shipping"]
  }, {
    scrapeStorefront: async () => shippingPayload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Comfort-focused"],
      submitted_results: [
        { label: "free shipping", status: "PASS", evidence: "Enjoy free shipping on every order." }
      ],
      recommendations: [],
      llms_txt_descriptions: {
        "/products/tree-runner": "Tree Runner product page."
      }
    }),
    resolveStoreName: () => "Allbirds"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "PASS");
});

test("runScan keeps the requested Shopify product when the URL is collection-scoped", async () => {
  const payload = buildScrapePayload({
    storeUrl: "https://rebeccaminkoff.example",
    homepage: {
      title: "Rebecca Minkoff",
      h1: "Designer Clothing & Accessories",
      text: "Designer handbags, clothing, and accessories.",
      internalLinks: [
        { href: "/products/soraya-sunglasses", text: "Soraya Sunglasses" },
        { href: "/pages/help", text: "Help Center" }
      ]
    },
    productPage: {
      url: "/collections/spring-must-haves/products/darren-signature-carryall",
      title: "Darren Signature Carryall",
      h1: "Darren Signature Carryall",
      text: "Designer carryall bag in denim blue."
    }
  });

  const response = await runScan({
    url: "https://rebeccaminkoff.example/collections/spring-must-haves/products/darren-signature-carryall?variant=123",
    identities: ["designer handbag"]
  }, {
    scrapeStorefront: async () => payload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Designer handbags"],
      submitted_results: [
        { label: "designer handbag", status: "PASS", evidence: "Designer carryall bag in denim blue." }
      ],
      recommendations: [],
      llms_txt_descriptions: {
        "/products/darren-signature-carryall": "Darren Signature Carryall product page."
      }
    }),
    resolveStoreName: () => "Rebecca Minkoff"
  });

  assert.equal(response.ok, true);
  assert.match(response.data.llms_txt, /\/products\/darren-signature-carryall/);
  assert.doesNotMatch(response.data.llms_txt, /\/products\/soraya-sunglasses/);
});

test("runScan does not treat shipping text as conditional returns evidence", async () => {
  const payload = buildScrapePayload({
    storeUrl: "https://beauty.example",
    homepage: {
      title: "Beauty Example",
      h1: "Beauty Example",
      text: "FREE SHIPPING ON DOMESTIC ORDERS OVER $60",
      internalLinks: []
    },
    productPage: {
      url: "/products/the-sweetest-refresh",
      title: "The Sweetest Refresh",
      h1: "The Sweetest Refresh",
      text: "FREE SHIPPING ON DOMESTIC ORDERS OVER $60"
    }
  });

  const response = await runScan({
    url: "https://beauty.example/products/the-sweetest-refresh",
    identities: ["free returns"]
  }, {
    scrapeStorefront: async () => payload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Skincare"],
      submitted_results: [
        {
          label: "free returns",
          status: "FAIL",
          evidence: "The storefront evidence is conditional, not unconditional: FREE SHIPPING ON DOMESTIC ORDERS OVER $60."
        }
      ],
      recommendations: [
        { priority: 1, surface: "faq/help page", issue: "Returns policy missing", fix: "Add returns details to the FAQ page." }
      ],
      llms_txt_descriptions: {
        "/products/the-sweetest-refresh": "Skincare bundle product page."
      }
    }),
    resolveStoreName: () => "Beauty Example"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "FAIL");
  assert.equal(response.data.audit.submitted_results[0].evidence, "No evidence of free returns found.");
});

test("runScan removes no-issue recommendations and caps actions to non-pass claims", async () => {
  const payload = buildScrapePayload({
    storeUrl: "https://beauty.example",
    homepage: {
      title: "Beauty Example",
      h1: "Beauty Example",
      text: "Sale pricing across skincare bundles.",
      internalLinks: []
    },
    productPage: {
      url: "/products/the-sweetest-refresh",
      title: "The Sweetest Refresh",
      h1: "The Sweetest Refresh",
      text: "Current price: $56.10. Original price: $66.00."
    }
  });

  const response = await runScan({
    url: "https://beauty.example/products/the-sweetest-refresh",
    identities: ["discount", "free returns", "2-day shipping"]
  }, {
    scrapeStorefront: async () => payload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Skincare"],
      submitted_results: [
        { label: "discount", status: "PASS", evidence: "Current price: $56.10. Original price: $66.00." },
        { label: "free returns", status: "FAIL", evidence: "No evidence of free returns found." },
        { label: "2-day shipping", status: "FAIL", evidence: "No evidence of 2-day shipping found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "No issue, as discounts are already being promoted", fix: "No action needed." },
        { priority: 2, surface: "faq/help page", issue: "Missing free returns policy information", fix: "Add returns details to the FAQ page." },
        { priority: 3, surface: "shipping policy page", issue: "Missing 2-day shipping option details", fix: "Create a shipping policy page with delivery windows." }
      ],
      llms_txt_descriptions: {
        "/products/the-sweetest-refresh": "Skincare bundle product page."
      }
    }),
    resolveStoreName: () => "Beauty Example"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.recommendations.length, 2);
  assert.doesNotMatch(response.data.audit.recommendations[0].issue, /no issue/i);
  assert.doesNotMatch(response.data.audit.recommendations[0].fix, /no action needed/i);
});

test("runScan supports explicit new-arrival badge claims when NEW is present in product text", async () => {
  const payload = buildScrapePayload({
    storeUrl: "https://beardbrand.example",
    homepage: {
      title: "Beardbrand",
      h1: "Beardbrand",
      text: "Premium beard care.",
      internalLinks: []
    },
    productPage: {
      url: "/products/norse-winter-beard-balm",
      title: "Norse Winter Beard Balm",
      h1: "Norse Winter Beard Balm",
      text: "NEW\nNorse Winter Beard Balm hydrates, conditions, and softens beard and head hair."
    }
  });

  const response = await runScan({
    url: "https://beardbrand.example/products/norse-winter-beard-balm",
    identities: ["new arrival"]
  }, {
    scrapeStorefront: async () => payload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Men's grooming"],
      submitted_results: [
        {
          label: "new arrival",
          status: "PASS",
          evidence: "NEW"
        }
      ],
      recommendations: [],
      llms_txt_descriptions: {
        "/products/norse-winter-beard-balm": "Beard balm product page with fragrance and ingredient details."
      }
    }),
    resolveStoreName: () => "Beardbrand"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "PASS");
  assert.equal(response.data.audit.submitted_results[0].evidence, "NEW");
});

test("runScan upgrades failed merchandising labels when explicit badge evidence exists", async () => {
  const payload = buildScrapePayload({
    storeUrl: "https://beardbrand.example",
    homepage: {
      title: "Beardbrand",
      h1: "Beardbrand",
      text: "30% Off Cologne Sets",
      internalLinks: []
    },
    productPage: {
      url: "/products/norse-winter-beard-balm",
      title: "Norse Winter Beard Balm",
      h1: "Norse Winter Beard Balm",
      text: "NEW\nNorse Winter Beard Balm\nProduct price: $39.00"
    }
  });

  const response = await runScan({
    url: "https://beardbrand.example/products/norse-winter-beard-balm",
    identities: ["new arrival", "sale", "best seller"]
  }, {
    scrapeStorefront: async () => payload,
    analyzeVisibility: async () => JSON.stringify({
      summary: "Summary",
      inferred_identities: ["Men's grooming"],
      submitted_results: [
        { label: "new arrival", status: "FAIL", evidence: "No evidence of a new arrival label found." },
        { label: "sale", status: "FAIL", evidence: "No general sale section found." },
        { label: "best seller", status: "FAIL", evidence: "No best seller label found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Missing new arrival label", fix: "Add a new arrival label." },
        { priority: 2, surface: "announcement bar", issue: "Missing sale section", fix: "Add a sale promotion." },
        { priority: 3, surface: "collection description", issue: "Missing best seller label", fix: "Add a best seller collection." }
      ],
      llms_txt_descriptions: {
        "/products/norse-winter-beard-balm": "Beard balm product page."
      }
    }),
    resolveStoreName: () => "Beardbrand"
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.audit.submitted_results[0].status, "PASS");
  assert.equal(response.data.audit.submitted_results[0].evidence, "NEW");
  assert.equal(response.data.audit.submitted_results[1].status, "PASS");
  assert.match(response.data.audit.submitted_results[1].evidence, /30% Off Cologne Sets/i);
  assert.equal(response.data.audit.submitted_results[2].status, "FAIL");
  assert.equal(response.data.audit.recommendations.length, 1);
  assert.match(response.data.audit.recommendations[0].issue, /best seller/i);
});
