import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseProductLink,
  cleanExtractedText,
  isPasswordProtectedSnapshot,
  normalizeRequestedPath,
  normalizeInternalLinks,
  sanitizePageSnapshot
} from "../src/adapters/playwright-scraper.js";

test("chooseProductLink prefers first product path", () => {
  assert.equal(chooseProductLink([
    { path: "/pages/about", text: "About" },
    { path: "/products/shoppy-magnet", text: "Shoppy Magnet" },
    { path: "/products/other", text: "Other" }
  ]), "/products/shoppy-magnet");
});

test("normalizeRequestedPath preserves requested product path", () => {
  assert.equal(
    normalizeRequestedPath(
      "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray?variant=123",
      "https://www.allbirds.com"
    ),
    "/products/mens-cruiser-canvas-sea-spray"
  );

  assert.equal(
    normalizeRequestedPath(
      "https://www.allbirds.com/",
      "https://www.allbirds.com"
    ),
    "/"
  );
});

test("cleanExtractedText removes noise from browser console leakage", () => {
  const cleaned = cleanExtractedText(`
    Enjoy FREE shipping with every single order.

    shopify-perf-kit-spa.min.js:1 POST https://monorail-edge.shopifysvc.com/v1/produce net::ERR_BLOCKED_BY_CLIENT
    de @ shopify-perf-kit-spa.min.js:1

    Add to cart
  `);

  assert.equal(cleaned, "Enjoy FREE shipping with every single order.\nAdd to cart");
});

test("cleanExtractedText removes cookie and cart noise", () => {
  const cleaned = cleanExtractedText(`
    CART (0)
    Your cart is empty.
    Start shopping!
    Cookie Preferences
    Manage Consent Preferences
    Reject All
    Confirm My Choices
    Materials from the Earth
  `);

  assert.equal(cleaned, "Materials from the Earth");
});

test("cleanExtractedText removes consent and location blocks inside long storefront text", () => {
  const cleaned = cleanExtractedText(`
    Spend $75 more to earn free shipping!
    SHOP WOMENS SHOP MENS SHOP SOCKS SHOP WOMEN'S SALE SHOP MEN'S SALE
    SHOP MEN SHOP WOMEN
    NEW ARRIVALS
    Chat Opt-Out Request Honored Cookie Preferences Allow All Manage Consent Preferences Reject All Confirm My Choices
    Close Where are we shipping to? United States Australia Canada CONFIRM
    MATERIALS FROM THE EARTH
  `);

  assert.equal(cleaned, "Spend $75 more to earn free shipping!\nMATERIALS FROM THE EARTH");
});

test("normalizeInternalLinks keeps internal links only and dedupes by path", () => {
  const links = normalizeInternalLinks([
    { href: "/products/shoppy-magnet?variant=1", text: "Shoppy Magnet" },
    { href: "https://shop.example/products/shoppy-magnet", text: "Duplicate" },
    { href: "/pages/shipping-and-returns", text: "Shipping and Returns" },
    { href: "https://outside.example/products/nope", text: "External" }
  ], "https://shop.example");

  assert.deepEqual(links, [
    { path: "/products/shoppy-magnet", text: "Shoppy Magnet" },
    { path: "/pages/shipping-and-returns", text: "Shipping and Returns" }
  ]);
});

test("sanitizePageSnapshot produces scraper-ready page shape", () => {
  const page = sanitizePageSnapshot({
    url: "/products/shoppy-magnet?variant=1",
    title: "  Shoppy Magnet  ",
    h1: " Shoppy Magnet ",
    text: " Add to cart \n\n undefined \n shopify-perf-kit-spa.min.js:1 ERR_BLOCKED_BY_CLIENT \n Overview ",
    jsonLd: [{ "@type": "Product", name: "Shoppy Magnet" }, null],
    internalLinks: [
      { href: "/products/shoppy-magnet", text: "Shoppy Magnet" },
      { href: "/pages/shipping-and-returns", text: "Shipping and Returns" }
    ]
  }, "product_page", "https://shop.example");

  assert.equal(page.role, "product_page");
  assert.equal(page.url, "https://shop.example/products/shoppy-magnet");
  assert.equal(page.title, "Shoppy Magnet");
  assert.equal(page.text, "Add to cart\nundefined\nOverview");
  assert.equal(page.jsonLd.length, 1);
  assert.equal(page.internalLinks.length, 2);
});

test("sanitizePageSnapshot preserves extracted JSON-LD objects", () => {
  const page = sanitizePageSnapshot({
    url: "/products/mens-cruiser-canvas-sea-spray",
    title: "Men's Canvas Cruiser",
    h1: "Men's Canvas Cruiser",
    text: "Canvas upper made from a breathable blend of hemp and organic cotton.",
    jsonLd: [
      { "@type": "Product", name: "Men's Canvas Cruiser" },
      { "@type": "BreadcrumbList" }
    ],
    internalLinks: []
  }, "product_page", "https://www.allbirds.com");

  assert.deepEqual(page.jsonLd.map((item) => item["@type"]), ["Product", "BreadcrumbList"]);
});

test("sanitizePageSnapshot drops variant-heavy product JSON-LD noise", () => {
  const page = sanitizePageSnapshot({
    url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray",
    title: "Men's Canvas Cruiser",
    h1: "Men's Canvas Cruiser",
    text: "Canvas upper made from a breathable blend of hemp and organic cotton.",
    jsonLd: [
      {
        "@type": "Product",
        name: "Men's Canvas Cruiser",
        description: "Classic court style.",
        url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray",
        image: ["a", "b", "c", "d", "e"],
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 75,
          priceCurrency: "USD",
          url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray"
        }
      },
      {
        "@type": "Product",
        name: "Men's Canvas Cruiser Size 10",
        isVariantOf: { "@id": "#mens-cruiser-canvas" },
        size: "10",
        offers: {
          "@type": "Offer",
          url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray?size=10"
        }
      },
      {
        "@type": "AggregateRating",
        ratingValue: "5",
        reviewCount: "2"
      }
    ],
    internalLinks: []
  }, "product_page", "https://www.allbirds.com");

  assert.equal(page.jsonLd.length, 2);
  assert.equal(page.jsonLd[0]["@type"], "Product");
  assert.equal(page.jsonLd[0].image.length, 4);
  assert.equal(page.jsonLd[1]["@type"], "AggregateRating");
});

test("sanitizePageSnapshot keeps a representative variant when no canonical product exists", () => {
  const page = sanitizePageSnapshot({
    url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray",
    title: "Men's Canvas Cruiser",
    h1: "Men's Canvas Cruiser",
    text: "Canvas upper made from a breathable blend of hemp and organic cotton.",
    jsonLd: [
      {
        "@type": "Product",
        name: "Men's Canvas Cruiser - Size 10",
        isVariantOf: { "@id": "#mens-cruiser-canvas" },
        size: "10",
        url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray?size=10",
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 75,
          priceCurrency: "USD",
          url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray?size=10"
        }
      }
    ],
    internalLinks: []
  }, "product_page", "https://www.allbirds.com");

  assert.equal(page.jsonLd.length, 1);
  assert.equal(page.jsonLd[0]["@type"], "Product");
  assert.equal(page.jsonLd[0].url, "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray");
  assert.equal(page.jsonLd[0].offers.url, "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray");
});

test("sanitizePageSnapshot preserves ProductGroup JSON-LD when it matches the page path", () => {
  const page = sanitizePageSnapshot({
    url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray",
    title: "Men's Canvas Cruiser",
    h1: "Men's Canvas Cruiser",
    text: "Classic court style.",
    jsonLd: [
      {
        "@context": "https://schema.org/",
        "@type": "ProductGroup",
        "@id": "#mens-cruiser-canvas",
        name: "Men's Canvas Cruiser",
        description: "Classic court style.",
        sku: "MENS_CRUISER_CANVAS",
        image: ["a", "b", "c", "d", "e"],
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 75,
          priceCurrency: "USD",
          url: "https://www.allbirds.com/products/mens-cruiser-canvas-sea-spray"
        }
      }
    ],
    internalLinks: []
  }, "product_page", "https://www.allbirds.com");

  assert.equal(page.jsonLd.length, 1);
  assert.equal(page.jsonLd[0]["@type"], "Product");
  assert.equal(page.jsonLd[0].name, "Men's Canvas Cruiser");
  assert.equal(page.jsonLd[0].image.length, 4);
});

test("sanitizePageSnapshot still works when page URL is relative and raw JSON-LD is present", () => {
  const page = sanitizePageSnapshot({
    url: "/products/example-product",
    title: "Example Product",
    h1: "Example Product",
    text: "Product body copy",
    jsonLd: [
      {
        "@type": "Product",
        name: "Example Product",
        url: "https://shop.example/products/example-product",
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: 75,
          priceCurrency: "USD"
        }
      }
    ],
    internalLinks: []
  }, "product_page", "https://shop.example");

  assert.equal(page.jsonLd.length, 1);
  assert.equal(page.jsonLd[0]["@type"], "Product");
  assert.equal(page.jsonLd[0].name, "Example Product");
});

test("isPasswordProtectedSnapshot only flags real storefront password walls", () => {
  assert.equal(isPasswordProtectedSnapshot({
    title: "Opening Soon",
    h1: "Enter using password",
    text: "This store is password protected."
  }), true);

  assert.equal(isPasswordProtectedSnapshot({
    title: "Allbirds",
    h1: "Men's Cruiser",
    text: "Change password for your account and manage shipping preferences."
  }), false);
});
