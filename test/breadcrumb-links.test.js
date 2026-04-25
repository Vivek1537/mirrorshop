import assert from "node:assert/strict";
import test from "node:test";
import { extractBreadcrumbCollectionLinks } from "../src/core/breadcrumb-links.js";

test("extractBreadcrumbCollectionLinks keeps the most relevant breadcrumb collections", () => {
  const links = extractBreadcrumbCollectionLinks([
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { item: { id: "/collections/mens", name: "Men's" } },
        { item: { id: "/collections/mens-socks", name: "Socks" } },
        { item: { id: "/collections/mens-knee-high-socks", name: "Knee High" } }
      ]
    }
  ]);

  assert.deepEqual(links, [
    { path: "/collections/mens-socks", text: "Socks", group: "collections" },
    { path: "/collections/mens-knee-high-socks", text: "Knee High", group: "collections" }
  ]);
});
