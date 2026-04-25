import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assembleLlmsTxt } from "../src/core/llms-txt.js";
import { renderDashboard, renderPage } from "../src/frontend/dashboard.js";

test("dashboard renders all five revised MirrorShop sections", async () => {
  const audit = JSON.parse(await readFile(new URL("./fixtures/audit-result.json", import.meta.url)));
  const llmsTxt = assembleLlmsTxt({
    storeName: "GlowJar",
    storeUrl: "https://glowjar.example",
    extractedLinks: [
      { path: "/products/vitamin-c-serum", text: "Vitamin C Serum" },
      { path: "/policies/shipping-policy", text: "Shipping Policy" }
    ],
    descriptions: audit.llms_txt_descriptions
  });
  const scrape = { source_coverage: audit.source_coverage };
  const html = renderDashboard({ audit, llmsTxt, scrape });

  [
    "ai-perception-summary",
    "identity-comparison",
    "evidence-per-identity",
    "action-plan",
    "llms-txt-panel"
  ].forEach((section) => {
    assert.match(html, new RegExp(`data-section="${section}"`));
  });

  assert.match(html, /What an AI shopping agent could infer/);
  assert.match(html, /Submitted Identities/);
  assert.match(html, /Inferred Identities/);
  assert.match(html, /Deterministic llms\.txt/);
});

test("dashboard escapes user-controlled audit content", () => {
  const html = renderPage({
    audit: {
      summary: "<script>alert(1)</script>",
      inferred_identities: ["<b>Luxury</b>"],
      submitted_results: [
        { label: "Vegan", status: "FAIL", evidence: "<img src=x onerror=alert(1)>" }
      ],
      recommendations: [
        { surface: "<surface>", issue: "<bad>", fix: "Use proof" }
      ]
    },
    llmsTxt: "# Store\n\n<script>",
    scrape: {
      source_coverage: {
        homepage: true
      }
    }
  });

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&lt;surface&gt;/);
});
