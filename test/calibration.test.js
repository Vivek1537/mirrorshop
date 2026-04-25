import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlindInferenceCalibrationMessages,
  parseCalibrationJson,
  POOR_MANS_SCRAPER_SNIPPET
} from "../src/core/calibration.js";

test("calibration prompt matches blind inference protocol", () => {
  const messages = buildBlindInferenceCalibrationMessages({
    targetIdentities: ["Luxury / Premium", "Eco-Friendly Packaging", "Fast 2-Day Shipping"],
    rawScrapedText: "Single origin coffee. Ships in recyclable mailers."
  });
  const combined = messages.map((message) => message.content).join("\n");

  assert.match(combined, /Phase 1 \(Blind Inference\)/);
  assert.match(combined, /If explicit evidence is missing, mark it FAIL/);
  assert.match(combined, /Shopify surface to edit/);
  assert.match(combined, /output ONLY valid JSON/);
  assert.match(combined, /Exact quote from text/);
  assert.match(combined, /Luxury \/ Premium/);
});

test("poor man's scraper snippet removes noisy DOM areas", () => {
  assert.match(POOR_MANS_SCRAPER_SNIPPET, /querySelectorAll/);
  assert.match(POOR_MANS_SCRAPER_SNIPPET, /nav/);
  assert.match(POOR_MANS_SCRAPER_SNIPPET, /footer/);
  assert.match(POOR_MANS_SCRAPER_SNIPPET, /document.body.innerText/);
});

test("calibration parser validates exact protocol schema", () => {
  const parsed = parseCalibrationJson(JSON.stringify({
    inferred_identities: ["Premium coffee", "Small-batch roaster"],
    intent_gaps: [
      { label: "Luxury / Premium", status: "PASS", evidence: "\"Single origin coffee\"" },
      { label: "Eco-Friendly Packaging", status: "FAIL", evidence: "No packaging evidence found." },
      { label: "Fast 2-Day Shipping", status: "FAIL", evidence: "No 2-day shipping evidence found." }
    ],
    action_plan: [
      "Add a product-page shipping block that explicitly says whether 2-day fulfillment is available.",
      "Add packaging details near the add-to-cart button if eco-friendly packaging is a real claim."
    ]
  }), ["Luxury / Premium", "Eco-Friendly Packaging", "Fast 2-Day Shipping"]);

  assert.equal(parsed.inferred_identities.length, 2);
});

test("calibration parser rejects markdown-wrapped or incomplete output", () => {
  assert.throws(() => {
    parseCalibrationJson("```json\n{}\n```", ["Luxury / Premium"]);
  }, /not valid JSON/);

  assert.throws(() => {
    parseCalibrationJson(JSON.stringify({
      inferred_identities: ["Premium coffee"],
      intent_gaps: [],
      action_plan: []
    }), ["Luxury / Premium"]);
  }, /exactly 2/);
});
