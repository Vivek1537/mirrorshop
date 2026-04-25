export const POOR_MANS_SCRAPER_SNIPPET = `['nav', 'footer', 'header', '.cookie-banner', 'script', 'style'].forEach(sel => {
  document.querySelectorAll(sel).forEach(el => el.remove());
});
console.log(document.body.innerText);`;

export function buildBlindInferenceCalibrationMessages({ targetIdentities, rawScrapedText }) {
  const identities = normalizeTargets(targetIdentities);
  const rawText = String(rawScrapedText || "").trim();

  if (!rawText) {
    throw new Error("rawScrapedText is required.");
  }

  return [
    {
      role: "system",
      content: `You are an AI shopping agent simulator analyzing a Shopify storefront.
Your job is to determine how an AI perceives this store based STRICTLY on the provided scraped text.

CRITICAL RULES:
1. Phase 1 (Blind Inference): Deduce the top 2 brand identities/categories this store projects based ONLY on the text. Be ruthlessly objective.
2. Phase 2 (Intent Grading): Compare the merchant's target identities against the text. If explicit evidence is missing, mark it FAIL.
3. Phase 3 (Action Plan): Provide 1-2 tactical Shopify-specific fixes to bridge the highest-priority failed target identities.
4. DO NOT hallucinate external knowledge about the brand.
5. For PASS evidence, quote exact text from the scraped text. For FAIL, explain exactly what evidence is missing.
6. Each action item must name the failed target identity and the Shopify surface to edit, such as product page, Shipping and Returns page, product description, announcement bar, or structured data.
7. You MUST output ONLY valid JSON matching this exact schema:

{
  "inferred_identities": ["Identity 1", "Identity 2"],
  "intent_gaps": [
    {
      "label": "[Merchant Target Identity]",
      "status": "PASS|FAIL|UNCLEAR",
      "evidence": "[Exact quote from text, or explanation of what is missing]"
    }
  ],
  "action_plan": ["Actionable fix 1", "Actionable fix 2"]
}`
    },
    {
      role: "user",
      content: `MERCHANT TARGET IDENTITIES:
${identities.map((identity, index) => `${index + 1}. ${identity}`).join("\n")}

RAW SCRAPED TEXT:
${rawText}`
    }
  ];
}

export function validateCalibrationResult(result, targetIdentities) {
  const errors = [];

  if (!isObject(result)) {
    return ["Calibration result must be an object."];
  }

  if (!Array.isArray(result.inferred_identities) || result.inferred_identities.length !== 2) {
    errors.push("inferred_identities must contain exactly 2 identities.");
  }

  if (!Array.isArray(result.intent_gaps)) {
    errors.push("intent_gaps must be an array.");
  } else {
    const expectedLabels = normalizeTargets(targetIdentities);
    const actualLabels = result.intent_gaps.map((gap) => gap && gap.label);

    expectedLabels.forEach((label) => {
      if (!actualLabels.includes(label)) {
        errors.push(`intent_gaps is missing target identity "${label}".`);
      }
    });

    result.intent_gaps.forEach((gap, index) => {
      if (!isObject(gap)) {
        errors.push(`intent_gaps[${index}] must be an object.`);
        return;
      }

      if (!["PASS", "FAIL", "UNCLEAR"].includes(gap.status)) {
        errors.push(`intent_gaps[${index}].status must be PASS, FAIL, or UNCLEAR.`);
      }

      if (typeof gap.evidence !== "string" || gap.evidence.trim() === "") {
        errors.push(`intent_gaps[${index}].evidence must be a non-empty string.`);
      }
    });
  }

  if (!Array.isArray(result.action_plan) || result.action_plan.length < 1 || result.action_plan.length > 2) {
    errors.push("action_plan must contain 1 to 2 fixes.");
  }

  return errors;
}

export function parseCalibrationJson(rawContent, targetIdentities) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Calibration output was not valid JSON: ${error.message}`);
  }

  const errors = validateCalibrationResult(parsed, targetIdentities);
  if (errors.length > 0) {
    throw new Error(`Calibration output failed schema: ${errors.join(" ")}`);
  }

  return parsed;
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) {
    throw new Error("targetIdentities must be an array.");
  }

  const identities = value.map((item) => String(item).trim()).filter(Boolean);
  if (identities.length < 1 || identities.length > 3) {
    throw new Error("targetIdentities must contain 1 to 3 labels.");
  }

  return identities;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
