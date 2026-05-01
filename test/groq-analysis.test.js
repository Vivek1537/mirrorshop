import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibilityPrompt, parseGroqAuditResponse } from "../src/core/groq-analysis.js";

const scrapePayload = {
  internal_links: [
    { path: "/products/vitamin-c-serum", text: "Vitamin C Serum" },
    { path: "/policies/shipping-policy", text: "Shipping Policy" }
  ],
  evidence_text: "[homepage] GlowJar Handmade skincare\nPremium handmade skincare.\n\n[product_page] Vitamin C Serum\nBrightening serum.",
  json_ld: [{ "@type": "Product", name: "Vitamin C Serum" }],
  source_coverage: {
    homepage: true,
    product_page: true,
    robots_txt: true,
    llms_txt_existing: false,
    json_ld: true
  }
};

test("prompt uses defensible AI shopping agent language and bans URL invention", () => {
  const messages = buildVisibilityPrompt({
    submittedIdentities: ["Vegan", "Affordable", "Next-day shipping"],
    scrapePayload
  });

  const combined = messages.map((message) => message.content).join("\n");

  assert.match(combined, /AI shopping agent could infer/);
  assert.doesNotMatch(combined, /what ChatGPT\/Gemini would say/i);
  assert.match(combined, /Never invent links/);
  assert.match(combined, /\/products\/vitamin-c-serum/);
  assert.match(combined, /conditional evidence such as over \$75/i);
  assert.match(combined, /CONFLICT DETECTED/);
  assert.match(combined, /two distinct storefront surfaces or sections/i);
  assert.match(combined, /Do not use CONFLICT DETECTED for one conditional statement on a single page/i);
});

test("parser accepts valid revised audit result", () => {
  const parsed = parseGroqAuditResponse(JSON.stringify({
    summary: "An AI shopping agent could infer premium handmade skincare.",
    inferred_identities: [
      { label: "Premium skincare", because: "Homepage text says \"Premium handmade skincare.\"." },
      { label: "Handmade", because: "Homepage text says \"Premium handmade skincare.\"." }
    ],
    submitted_results: [
      { label: "Vegan", status: "UNCLEAR", evidence: "No vegan certification evidence found." }
    ],
    recommendations: [
      { priority: 1, surface: "product description", issue: "Vegan claim lacks proof", fix: "Add vegan ingredient proof on product pages." }
    ],
    llms_txt_descriptions: {
      "/products/vitamin-c-serum": "Brightening serum made for daily skincare routines."
    }
  }), scrapePayload.internal_links.map((link) => link.path), scrapePayload.source_coverage);

  assert.equal(parsed.source_coverage.product_page, true);
  assert.equal(parsed.inferred_identities[0].label, "Premium skincare");
  assert.match(parsed.inferred_identities[0].because, /Premium handmade skincare/);
});

test("parser upgrades no-evidence UNCLEAR results to FAIL", () => {
  const parsed = parseGroqAuditResponse(JSON.stringify({
    summary: "Summary",
    inferred_identities: [
      { label: "Skincare", because: "Homepage text says \"Premium handmade skincare.\"." }
    ],
    submitted_results: [
      { label: "Premium", status: "UNCLEAR", evidence: "No explicit premium proof found on the storefront." }
    ],
    recommendations: [
      { priority: 1, surface: "product description", issue: "Premium claim lacks proof", fix: "Add premium proof to the product page." }
    ],
    llms_txt_descriptions: {
      "/products/vitamin-c-serum": "Serum product page."
    }
  }), ["/products/vitamin-c-serum"], scrapePayload.source_coverage);

  assert.equal(parsed.submitted_results[0].status, "FAIL");
});

test("parser rejects descriptions for links the scraper did not extract", () => {
  assert.throws(() => {
    parseGroqAuditResponse(JSON.stringify({
      summary: "Summary",
      inferred_identities: [
        { label: "Skincare", because: "Homepage text says \"Premium handmade skincare.\"." }
      ],
      submitted_results: [
        { label: "Vegan", status: "FAIL", evidence: "No evidence found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Issue", fix: "Fix" }
      ],
      llms_txt_descriptions: {
        "/made-up": "Invented link"
      },
      source_coverage: scrapePayload.source_coverage
    }), scrapePayload.internal_links.map((link) => link.path), scrapePayload.source_coverage);
  }, /was not in extracted links/);
});

test("prompt requires 1 to 3 submitted identities", () => {
  assert.throws(() => {
    buildVisibilityPrompt({
      submittedIdentities: ["One", "Two", "Three", "Four"],
      scrapePayload
    });
  }, /1 to 3/);
});

test("parser infers structured recommendation surface from fix text", () => {
  const parsed = parseGroqAuditResponse(JSON.stringify({
    summary: "Summary",
    inferred_identities: [
      { label: "Skincare", because: "Homepage text says \"Premium handmade skincare.\"." }
    ],
    submitted_results: [
      { label: "Shipping", status: "FAIL", evidence: "No shipping SLA found." }
    ],
    recommendations: [
      {
        priority: 1,
        issue: "Shipping SLA is missing",
        fix: "Create a /pages/shipping policy page with a clear delivery window."
      }
    ],
    llms_txt_descriptions: {
      "/products/vitamin-c-serum": "Serum product page."
    }
  }), ["/products/vitamin-c-serum"], scrapePayload.source_coverage);

  assert.equal(parsed.recommendations[0].surface, "shipping policy page");
});

test("parser rejects inferred identities that include extra fields", () => {
  assert.throws(() => {
    parseGroqAuditResponse(JSON.stringify({
      summary: "Summary",
      inferred_identities: [
        {
          label: "Skincare",
          because: "Homepage text says \"Premium handmade skincare.\".",
          confidence: "high"
        }
      ],
      submitted_results: [
        { label: "Vegan", status: "FAIL", evidence: "No evidence found." }
      ],
      recommendations: [
        { priority: 1, surface: "product description", issue: "Issue", fix: "Fix" }
      ],
      llms_txt_descriptions: {
        "/products/vitamin-c-serum": "Serum product page."
      }
    }), ["/products/vitamin-c-serum"], scrapePayload.source_coverage);
  }, /only label and because fields/);
});
