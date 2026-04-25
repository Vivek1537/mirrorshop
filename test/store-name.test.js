import assert from "node:assert/strict";
import test from "node:test";
import { resolveStoreName } from "../src/core/store-name.js";

test("resolveStoreName prefers organization or brand identity over product name", () => {
  const name = resolveStoreName({
    store_url: "https://www.allbirds.com",
    pages: [
      {
        role: "homepage",
        title: "Men's Shoes, Flats, and Clothing | Allbirds",
        h1: "Made from natural materials"
      },
      {
        role: "product_page",
        title: "Men's Canvas Cruiser",
        h1: "Men's Canvas Cruiser"
      }
    ],
    json_ld: [
      { "@type": "Product", name: "Men's Canvas Cruiser", brand: { "@type": "Brand", name: "Allbirds" } }
    ]
  });

  assert.equal(name, "Allbirds");
});

test("resolveStoreName falls back to brand-like homepage title segment before product h1", () => {
  const name = resolveStoreName({
    store_url: "https://bombas.com",
    pages: [
      {
        role: "homepage",
        title: "Bombas | Comfort-focused socks and essentials",
        h1: "Comfort-focused socks and essentials"
      },
      {
        role: "product_page",
        title: "Men's Compression Calf Socks",
        h1: "Men's Compression Calf Socks"
      }
    ],
    json_ld: [
      { "@type": "Product", name: "Men's Compression Calf Socks" }
    ]
  });

  assert.equal(name, "Bombas");
});
