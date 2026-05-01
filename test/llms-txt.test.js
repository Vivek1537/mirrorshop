import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assembleLlmsTxt } from "../src/core/llms-txt.js";
import { validateAuditResult } from "../src/core/audit-contract.js";

test("audit fixture satisfies revised MirrorShop contract", async () => {
  const result = JSON.parse(await readFile(new URL("./fixtures/audit-result.json", import.meta.url)));

  assert.deepEqual(validateAuditResult(result), []);
});

test("llms.txt assembly uses real extracted links and LLM descriptions only", async () => {
  const result = JSON.parse(await readFile(new URL("./fixtures/audit-result.json", import.meta.url)));
  const llmsTxt = assembleLlmsTxt({
    storeName: "GlowJar",
    storeUrl: "https://glowjar.example/products/ignored-query?x=1",
    extractedLinks: [
      { path: "/", text: "Home" },
      { path: "/products/vitamin-c-serum?variant=1", text: "Vitamin C Serum" },
      { path: "https://glowjar.example/policies/shipping-policy", text: "Shipping Policy" },
      { path: "/products/vitamin-c-serum", text: "Duplicate serum link" },
      { path: "https://outside.example/products/not-allowed", text: "External-looking link normalized by path only" }
    ],
    descriptions: result.llms_txt_descriptions
  });

  assert.match(llmsTxt, /^# GlowJar/m);
  assert.match(llmsTxt, /## Product/);
  assert.match(llmsTxt, /\/products\/vitamin-c-serum\): Vitamin C serum described as brightening/);
  assert.match(llmsTxt, /## Policies And Help/);
  assert.match(llmsTxt, /\/policies\/shipping-policy\): Shipping policy page/);
  assert.doesNotMatch(llmsTxt, /\?variant=1/);
  assert.doesNotMatch(llmsTxt, /ignored-query/);
  assert.equal(countMatches(llmsTxt, "/products/vitamin-c-serum"), 1);
});

test("contract rejects LLM-generated absolute URL description keys", () => {
  const errors = validateAuditResult({
    summary: "Summary",
    inferred_identities: [
      { label: "Skincare", because: "Homepage text says \"Premium handmade skincare.\"." }
    ],
    submitted_results: [{ label: "Vegan", status: "PASS", evidence: "Evidence" }],
    recommendations: [{ priority: 1, surface: "product description", issue: "Issue", fix: "Fix" }],
    llms_txt_descriptions: {
      "https://made-up.example/products/a": "Bad URL ownership"
    },
    source_coverage: {
      homepage: true,
      product_page: true,
      robots_txt: true,
      llms_txt_existing: false,
      json_ld: true
    }
  });

  assert.ok(errors.some((error) => error.includes("must be a root-relative path")));
});

function countMatches(value, needle) {
  return value.split(needle).length - 1;
}
