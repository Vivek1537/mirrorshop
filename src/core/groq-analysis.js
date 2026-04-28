import { validateAuditResult } from "./audit-contract.js";
import { listAllowedDescriptionPaths as listArtifactDescriptionPaths } from "./artifact-links.js";

export function buildVisibilityPrompt({ submittedIdentities, scrapePayload }) {
  const identities = normalizeIdentities(submittedIdentities);
  const allowedPaths = listAllowedDescriptionPaths(scrapePayload);

  return [
    {
      role: "system",
      content: [
        "You are an AI shopping agent simulator analyzing a Shopify storefront.",
        "Your job is to determine how an AI perceives this store based STRICTLY on the provided public storefront evidence.",
        "Phase 1 Blind Inference: deduce the top 2 to 3 brand identities/categories this store projects based ONLY on the evidence. Be ruthlessly objective.",
        "Phase 2 Intent Grading: compare the merchant's target identities against the evidence using a strict hierarchy.",
        "Phase 3 Action Plan: provide tactical Shopify-specific fixes to bridge the gaps.",
        "Return exactly one submitted_results item for each submitted identity, in the same order.",
        "For PASS evidence, quote exact storefront text whenever possible.",
        "If evidence is missing, say what is missing directly and mark the identity FAIL.",
        "Use PASS when direct textual or schema evidence explicitly supports the submitted identity.",
        "Use UNCLEAR only when indirect but relevant evidence exists without an explicit claim.",
        "For premium or luxury claims, indirect signals like price point, material specs, or engineered feature language can justify UNCLEAR, but not PASS.",
        "Use FAIL when no supporting evidence exists in the payload or when the storefront evidence clearly contradicts the claim.",
        "For unconditional claims like free shipping or free returns, any threshold, minimum order amount, or qualifier like over, above, or orders over means the result must be FAIL, not PASS.",
        "Generate exactly one recommendation for each submitted identity marked FAIL or UNCLEAR.",
        "Each recommendation must name the failed target identity, the missing evidence type, and the exact Shopify surface to edit, such as product description, collection description, shipping policy page, FAQ/help page, announcement bar, homepage hero, product metafield, or structured data.",
        "Keep recommendations concrete and merchant-facing. No generic advice.",
        "Do not hallucinate external knowledge about the brand.",
        "Do not claim to represent ChatGPT, Gemini, or any specific product.",
        "Describe what an AI shopping agent could infer from the public storefront content.",
        "Return strict JSON only, with no markdown fences."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Compare merchant-submitted brand identities against what can be inferred from public storefront content.",
        submitted_identities: identities,
        required_json_shape: {
          summary: "One sentence overall AI perception.",
          inferred_identities: ["Up to 3 concise inferred identities."],
          submitted_results: [
            {
              label: "Submitted identity label.",
              status: "PASS | FAIL | UNCLEAR",
              evidence: "Exact evidence quote or clear statement that no evidence was found."
            }
          ],
          recommendations: [
            {
              priority: 1,
              surface: "Specific Shopify surface to edit.",
              issue: "Specific missing evidence gap tied to the target identity.",
              fix: "Concrete merchant-facing fix in 2 sentences max."
            }
          ],
          llms_txt_descriptions: {
            "/real-extracted-path": "One-line description grounded only in provided evidence."
          },
          source_coverage: scrapePayload.source_coverage
        },
        hard_rules: [
          "Return submitted_results for every submitted identity in the same order.",
          "Use PASS only when evidence directly supports the submitted identity.",
          "Use UNCLEAR only when related indirect evidence exists but is insufficient for a direct claim.",
          "Use FAIL when evidence contradicts the submitted identity or no supporting evidence exists.",
          "Do not be generous. Missing explicit evidence is a FAIL, not a soft pass.",
          "For premium or luxury claims, indirect signals like price, materials, or engineered feature language may justify UNCLEAR, but not PASS.",
          "For unconditional claims like free shipping or free returns, conditional evidence such as over $75, orders over $50, above a threshold, or minimum order language must be graded FAIL.",
          "If your evidence says no evidence was found, the status must be FAIL, not UNCLEAR.",
          "Return one recommendation for every FAIL or UNCLEAR submitted identity.",
          "Recommendations must be concrete Shopify storefront fixes, not generic marketing advice.",
          "Each recommendation must identify the target identity, the missing evidence type, and the exact Shopify surface to fix.",
          "Every recommendation must include a non-empty surface field.",
          "llms_txt_descriptions keys must be selected only from extracted_links paths.",
          "Never output an absolute URL in llms_txt_descriptions.",
          "Never invent links."
        ],
        extracted_links: allowedPaths,
        source_coverage: scrapePayload.source_coverage,
        evidence_text: scrapePayload.evidence_text,
        json_ld: scrapePayload.json_ld
      })
    }
  ];
}

export function parseGroqAuditResponse(rawContent, allowedPaths, sourceCoverage) {
  let parsed;

  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Groq response was not valid JSON: ${error.message}`);
  }

  const normalized = normalizeAuditResult({
    ...parsed,
    source_coverage: parsed.source_coverage || sourceCoverage
  });

  const contractErrors = validateAuditResult(normalized);
  const pathErrors = validateDescriptionPaths(normalized.llms_txt_descriptions, allowedPaths);
  const errors = [...contractErrors, ...pathErrors];

  if (errors.length > 0) {
    throw new Error(`Groq response failed MirrorShop contract: ${errors.join(" ")}`);
  }

  return normalized;
}

export function listAllowedDescriptionPaths(scrapePayload) {
  return listArtifactDescriptionPaths(scrapePayload);
}

function validateDescriptionPaths(descriptions, allowedPaths) {
  const allowed = new Set(allowedPaths);
  return Object.keys(descriptions || {})
    .filter((path) => !allowed.has(path))
    .map((path) => `llms_txt_descriptions["${path}"] was not in extracted links.`);
}

function normalizeIdentities(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("submittedIdentities must be an array.");
  }

  const identities = value.map((item) => String(item).trim()).filter(Boolean);
  if (identities.length < 1 || identities.length > 3) {
    throw new RangeError("submittedIdentities must contain 1 to 3 labels.");
  }

  return identities;
}

function normalizeAuditResult(result) {
  return {
    ...result,
    submitted_results: Array.isArray(result?.submitted_results)
      ? result.submitted_results.map((item) => normalizeSubmittedResult(item))
      : result?.submitted_results,
    recommendations: Array.isArray(result?.recommendations)
      ? result.recommendations.map((item) => normalizeRecommendation(item))
      : result?.recommendations
  };
}

function normalizeSubmittedResult(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  const evidence = typeof item.evidence === "string" ? item.evidence.trim() : item.evidence;
  let status = item.status;

  if (status === "UNCLEAR" && evidenceSignalsMissingProof(evidence)) {
    status = "FAIL";
  }

  return {
    ...item,
    status,
    evidence
  };
}

function normalizeRecommendation(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  const issue = typeof item.issue === "string" ? item.issue.trim() : item.issue;
  const fix = typeof item.fix === "string" ? item.fix.trim() : item.fix;

  return {
    ...item,
    surface: normalizeSurface(item.surface, issue, fix),
    issue,
    fix
  };
}

function evidenceSignalsMissingProof(value) {
  if (typeof value !== "string") {
    return false;
  }

  const evidence = value.toLowerCase();
  const missingSignals = [
    "no evidence",
    "no explicit",
    "not found",
    "missing",
    "absent",
    "does not mention",
    "not stated",
    "not shown",
    "not visible",
    "not surfaced",
    "not provided",
    "could not find"
  ];
  const partialSignals = ["partial", "mixed", "some", "limited", "suggests", "suggestive", "indirect"];

  return missingSignals.some((signal) => evidence.includes(signal))
    && !partialSignals.some((signal) => evidence.includes(signal));
}

function normalizeSurface(surface, issue, fix) {
  const text = [surface, issue, fix].filter(Boolean).join(" ").toLowerCase();

  if (includesAny(text, ["json-ld", "schema", "structured data", "shippingdetails", "offer schema"])) {
    return "structured data";
  }

  if (includesAny(text, ["shipping policy", "shipping and returns", "shipping & returns", "returns page", "/pages/shipping"])) {
    return "shipping policy page";
  }

  if (includesAny(text, ["faq", "help center", "help page", "support page"])) {
    return "faq/help page";
  }

  if (includesAny(text, ["announcement bar", "banner"])) {
    return "announcement bar";
  }

  if (includesAny(text, ["collection description", "collection page"])) {
    return "collection description";
  }

  if (includesAny(text, ["homepage hero", "homepage", "home page"])) {
    return "homepage hero";
  }

  if (includesAny(text, ["metafield"])) {
    return "product metafield";
  }

  if (includesAny(text, ["product description", "product page", "product pages", "pdp"])) {
    return "product description";
  }

  if (includesAny(text, ["shipping", "delivery"])) {
    return "shipping policy page";
  }

  return typeof surface === "string" && surface.trim() ? surface.trim() : "product description";
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}
