import assert from "node:assert/strict";
import test from "node:test";
import { selectArtifactLinks } from "../src/core/artifact-links.js";

test("selectArtifactLinks keeps homepage, scanned product, and high-signal support pages", () => {
  const links = selectArtifactLinks({
    pages: [
      { role: "homepage", url: "https://shop.example/", title: "Shop Example", h1: "Shop Example" },
      { role: "product_page", url: "https://shop.example/products/compression-calf-sock", title: "Compression Calf Sock", h1: "Compression Calf Sock" }
    ],
    json_ld: [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { item: { id: "/collections/mens", name: "Men's" } },
          { item: { id: "/collections/mens-socks", name: "Socks" } },
          { item: { id: "/collections/compression-socks", name: "Compression Socks" } }
        ]
      }
    ],
    internal_links: [
      { path: "/products/other-sock", text: "Other Sock" },
      { path: "/policies/shipping-policy", text: "Shipping Policy" },
      { path: "/pages/returns", text: "Returns" },
      { path: "/pages/help", text: "Help Center" },
      { path: "/collections/compression-socks", text: "Compression Socks" },
      { path: "/collections/mens", text: "Mens" },
      { path: "/cart", text: "Cart" }
    ]
  });

  assert.deepEqual(links.map((link) => link.path), [
    "/",
    "/products/compression-calf-sock",
    "/collections/mens-socks",
    "/collections/compression-socks",
    "/policies/shipping-policy",
    "/pages/returns",
    "/pages/help"
  ]);
});

test("selectArtifactLinks canonicalizes collection-scoped Shopify product pages to the scanned product path", () => {
  const links = selectArtifactLinks({
    pages: [
      { role: "homepage", url: "https://shop.example/", title: "Shop Example", h1: "Shop Example" },
      {
        role: "product_page",
        url: "https://shop.example/collections/spring-must-haves/products/darren-signature-carryall",
        title: "Darren Signature Carryall",
        h1: "Darren Signature Carryall"
      }
    ],
    json_ld: [],
    internal_links: [
      { path: "/products/soraya-sunglasses", text: "Soraya Sunglasses" },
      { path: "/pages/help", text: "Help Center" }
    ]
  });

  assert.deepEqual(links.map((link) => link.path), [
    "/",
    "/products/darren-signature-carryall",
    "/pages/help"
  ]);
});
