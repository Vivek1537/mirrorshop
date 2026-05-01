const SOFT_POSITIONING_PATTERNS = [
  /\bpremium\b/i,
  /\bluxury\b/i,
  /\bhigh[- ]end\b/i,
  /\bupscale\b/i,
  /\bhigh quality\b/i
];

const FEATURE_TERMS = [
  { pattern: /\bcompression\b/i, label: "compression-specific feature language" },
  { pattern: /\bsupportive\b/i, label: "supportive performance language" },
  { pattern: /\bengineer(?:ed|ing)?\b/i, label: "engineered product language" },
  { pattern: /\bcushion(?:ed|ing)?\b/i, label: "cushioning language" },
  { pattern: /\bmerino\b/i, label: "material-quality language" },
  { pattern: /\bsupima\b/i, label: "material-quality language" },
  { pattern: /\bbreathable\b/i, label: "performance language" }
];

const UNCONDITIONAL_CLAIM_PATTERNS = [
  /\bfree shipping\b/i,
  /\bfree returns?\b/i,
  /\bfree delivery\b/i
];

const CONDITIONAL_QUALIFIER_PATTERNS = [
  /\bover\b/i,
  /\babove\b/i,
  /\bminimum\b/i,
  /\bminimum order\b/i,
  /\bmin(?:imum)?\.?\s+order\b/i,
  /\borders?\s+over\b/i,
  /\borders?\s+above\b/i,
  /\borders?\s+of\b/i,
  /\bspend\b/i,
  /\bthreshold\b/i,
  /\bat least\b/i
];

const MERCHANDISING_SIGNAL_RULES = [
  {
    label: /\bnew arrival\b|\bnew product\b/i,
    status: "PASS",
    signal: /\bNEW\b|\bNEW ARRIVAL\b|\bNEW PRODUCT\b/i,
    evidence: "NEW"
  },
  {
    label: /\bbest[ -]?seller\b/i,
    status: "PASS",
    signal: /\bBEST[ -]?SELLER\b|\bBEST SELLING\b|\bTOP SELLER\b/i,
    evidence: "BEST SELLER"
  },
  {
    label: /\bsale\b|\bdiscount\b|\bdiscounted\b/i,
    status: "PASS",
    signal: /\bSALE\b|\b\d{1,2}%\s+OFF\b|\bSAVE\s+\d{1,2}%\b|\bdiscount(?:ed)?\b|original price|current price/i,
    evidence: ""
  },
  {
    label: /\blimited edition\b|\blimited\b/i,
    status: "PASS",
    signal: /\bLIMITED EDITION\b|\bLIMITED\b/i,
    evidence: "LIMITED EDITION"
  },
  {
    label: /\bpre[- ]?order\b/i,
    status: "PASS",
    signal: /\bPRE[- ]?ORDER\b|\bPREORDER\b/i,
    evidence: "PRE-ORDER"
  }
];

export function refineAuditWithScrapePayload(audit, scrapePayload) {
  if (!audit || typeof audit !== "object") {
    return audit;
  }

  const submittedResults = Array.isArray(audit.submitted_results)
    ? audit.submitted_results.map((item) => refineSubmittedResult(item, scrapePayload))
    : audit.submitted_results;

  return {
    ...audit,
    submitted_results: submittedResults,
    recommendations: refineRecommendations(audit.recommendations, submittedResults)
  };
}

function refineSubmittedResult(item, scrapePayload) {
  if (!item || typeof item !== "object") {
    return item;
  }

  const merchandisingOverride = refineMerchandisingClaim(item, scrapePayload);
  if (merchandisingOverride) {
    return merchandisingOverride;
  }

  const logisticsAlignmentOverride = refineLogisticsEvidenceAlignment(item);
  if (logisticsAlignmentOverride) {
    item = logisticsAlignmentOverride;
  }

  const conditionalOverride = refineConditionalUnconditionalClaim(item, scrapePayload);
  if (conditionalOverride) {
    return conditionalOverride;
  }

  if (!isSoftPositioningClaim(item.label) || item.status !== "FAIL") {
    return item;
  }

  if (!failureLooksLikeMissingProof(item.evidence)) {
    return item;
  }

  const signals = collectIndirectQualitySignals(scrapePayload);
  if (!signals.hasAny) {
    return item;
  }

  return {
    ...item,
    status: "UNCLEAR",
    evidence: buildIndirectEvidenceSummary(signals)
  };
}

function refineMerchandisingClaim(item, scrapePayload) {
  if (item.status === "PASS" || typeof item?.label !== "string") {
    return null;
  }

  const rule = MERCHANDISING_SIGNAL_RULES.find((candidate) => candidate.label.test(item.label));
  if (!rule) {
    return null;
  }

  const signal = findMerchandisingSignal(scrapePayload, rule);
  if (!signal) {
    return null;
  }

  return {
    ...item,
    status: rule.status,
    evidence: signal
  };
}

function refineLogisticsEvidenceAlignment(item) {
  if (typeof item?.label !== "string" || typeof item?.evidence !== "string") {
    return null;
  }

  const label = item.label.toLowerCase();
  const evidence = item.evidence.toLowerCase();
  const mentionsShipping = /\bshipping\b|\bdelivery\b/.test(evidence);
  const mentionsReturns = /\breturn\b|\brefund\b|\bexchange\b/.test(evidence);

  if (/\bfree returns?\b/.test(label) && mentionsShipping && !mentionsReturns) {
    return {
      ...item,
      evidence: "No evidence of free returns found."
    };
  }

  if (/\bfree shipping\b|\bfree delivery\b/.test(label) && mentionsReturns && !mentionsShipping) {
    return {
      ...item,
      evidence: "No evidence of free shipping found."
    };
  }

  return null;
}

function refineConditionalUnconditionalClaim(item, scrapePayload) {
  const claimType = detectUnconditionalClaimType(item.label);
  if (!claimType) {
    return null;
  }

  if (typeof item.evidence === "string" && item.evidence.includes("CONFLICT DETECTED")) {
    return null;
  }

  const signal = findConditionalClaimSignal(item, scrapePayload, claimType);
  if (!signal) {
    return null;
  }

  return {
    ...item,
    status: "FAIL",
    evidence: `The storefront evidence is conditional, not unconditional: ${signal}.`
  };
}

function collectIndirectQualitySignals(scrapePayload) {
  const productPage = scrapePayload?.pages?.find((page) => page?.role === "product_page");
  const productJsonLd = scrapePayload?.json_ld?.find((item) => hasType(item, "Product")) || {};
  const evidenceText = [productJsonLd.description, productPage?.text].filter(Boolean).join(" ");
  const price = formatPrice(productJsonLd?.offers?.price, productJsonLd?.offers?.priceCurrency);
  const material = summarizeMaterial(productJsonLd?.material);
  const featureSignal = FEATURE_TERMS.find((term) => term.pattern.test(evidenceText))?.label || "";

  return {
    hasAny: Boolean(price || material || featureSignal),
    price,
    material,
    featureSignal
  };
}

function buildIndirectEvidenceSummary(signals) {
  const parts = [];

  if (signals.price) {
    parts.push(`price point (${signals.price})`);
  }

  if (signals.material) {
    parts.push(`material specification (${signals.material})`);
  }

  if (signals.featureSignal) {
    parts.push(signals.featureSignal);
  }

  return `Indirect quality signals exist in public storefront content, including ${joinParts(parts)}, but no explicit premium or luxury positioning claim was found.`;
}

function joinParts(parts) {
  if (parts.length <= 1) {
    return parts[0] || "supporting product signals";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function summarizeMaterial(value) {
  if (typeof value !== "string") {
    return "";
  }

  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87)}...` : compact;
}

function formatPrice(price, currency = "USD") {
  if (price === undefined || price === null || price === "") {
    return "";
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: numericPrice % 1 === 0 ? 0 : 2
    }).format(numericPrice);
  } catch {
    return `$${numericPrice}`;
  }
}

function failureLooksLikeMissingProof(value) {
  if (typeof value !== "string") {
    return false;
  }

  const evidence = value.toLowerCase();
  return [
    "no explicit",
    "no evidence",
    "not found",
    "missing",
    "supporting evidence"
  ].some((signal) => evidence.includes(signal));
}

function detectUnconditionalClaimType(label) {
  if (typeof label !== "string") {
    return "";
  }

  if (/\bfree returns?\b/i.test(label)) {
    return "returns";
  }

  if (/\bfree delivery\b/i.test(label)) {
    return "delivery";
  }

  if (/\bfree shipping\b/i.test(label)) {
    return "shipping";
  }

  return "";
}

function isSoftPositioningClaim(label) {
  if (typeof label !== "string") {
    return false;
  }

  return SOFT_POSITIONING_PATTERNS.some((pattern) => pattern.test(label));
}

function findConditionalClaimSignal(item, scrapePayload, claimType) {
  const candidates = [
    item?.evidence,
    scrapePayload?.evidence_text,
    ...collectPageTexts(scrapePayload)
  ];

  for (const candidate of candidates) {
    const signal = extractConditionalFreeClaim(candidate, claimType);
    if (signal) {
      return signal;
    }
  }

  return "";
}

function collectPageTexts(scrapePayload) {
  if (!Array.isArray(scrapePayload?.pages)) {
    return [];
  }

  return scrapePayload.pages.map((page) => page?.text).filter((value) => typeof value === "string" && value.trim());
}

function collectEvidenceCandidates(scrapePayload) {
  return [
    ...collectPageTexts(scrapePayload),
    scrapePayload?.evidence_text,
    ...collectJsonLdText(scrapePayload)
  ].filter((value) => typeof value === "string" && value.trim());
}

function collectJsonLdText(scrapePayload) {
  if (!Array.isArray(scrapePayload?.json_ld)) {
    return [];
  }

  return scrapePayload.json_ld.flatMap((item) => [
    item?.name,
    item?.description,
    item?.category
  ]).filter((value) => typeof value === "string" && value.trim());
}

function findMerchandisingSignal(scrapePayload, rule) {
  for (const candidate of collectEvidenceCandidates(scrapePayload)) {
    const signal = extractMerchandisingSignal(candidate, rule);
    if (signal) {
      return signal;
    }
  }

  return "";
}

function extractMerchandisingSignal(value, rule) {
  const compact = value.replace(/\s+/g, " ").trim();
  const match = compact.match(rule.signal);
  if (!match) {
    return "";
  }

  if (rule.evidence) {
    return rule.evidence;
  }

  const start = Math.max(0, match.index - 40);
  const end = Math.min(compact.length, match.index + match[0].length + 80);
  return summarizeConditionalSignal(compact.slice(start, end));
}

function extractConditionalFreeClaim(value, claimType) {
  if (typeof value !== "string") {
    return "";
  }

  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }

  const normalized = compact.toLowerCase();
  const freeClaimPatterns = freeClaimPatternsFor(claimType);

  for (const pattern of freeClaimPatterns) {
    const matches = compact.match(pattern) || [];
    for (const match of matches) {
      if (looksConditional(match)) {
        return summarizeConditionalSignal(match);
      }
    }
  }

  if (claimType === "shipping" && normalized.includes("spend") && normalized.includes("free shipping")) {
    const sentence = extractSentenceContaining(compact, "free shipping");
    if (looksConditional(sentence)) {
      return summarizeConditionalSignal(sentence);
    }
  }

  return "";
}

function freeClaimPatternsFor(claimType) {
  switch (claimType) {
    case "returns":
      return [
        /free returns?[^.!\n]*/gi,
        /returns?[^.!\n]*free[^.!\n]*/gi,
        /refunds?[^.!\n]*free[^.!\n]*/gi,
        /exchanges?[^.!\n]*free[^.!\n]*/gi
      ];
    case "delivery":
      return [/free delivery[^.!\n]*/gi];
    case "shipping":
    default:
      return [/free shipping[^.!\n]*/gi];
  }
}

function looksConditional(text) {
  const normalized = text.toLowerCase();
  return CONDITIONAL_QUALIFIER_PATTERNS.some((pattern) => pattern.test(normalized))
    || /\$\s?\d+/i.test(normalized)
    || /\b\d+\s*(usd|dollars?)\b/i.test(normalized);
}

function extractSentenceContaining(text, needle) {
  const sentences = text.split(/[\n.!?]+/);
  return sentences.find((sentence) => sentence.toLowerCase().includes(needle))?.trim() || text;
}

function summarizeConditionalSignal(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function refineRecommendations(recommendations, submittedResults) {
  if (!Array.isArray(recommendations)) {
    return recommendations;
  }

  const passResults = Array.isArray(submittedResults)
    ? submittedResults.filter((item) => item && item.status === "PASS")
    : [];
  const actionableCount = Array.isArray(submittedResults)
    ? submittedResults.filter((item) => item && item.status !== "PASS").length
    : recommendations.length;

  return recommendations
    .filter((item) => !looksLikeNoIssueRecommendation(item))
    .filter((item) => !targetsPassedClaim(item, passResults))
    .slice(0, actionableCount);
}

function looksLikeNoIssueRecommendation(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  const text = [item.issue, item.fix].filter(Boolean).join(" ").toLowerCase();
  return [
    "no issue",
    "no action needed",
    "already being promoted",
    "already promoted",
    "already stated",
    "already present",
    "already offered"
  ].some((signal) => text.includes(signal));
}

function targetsPassedClaim(recommendation, passResults) {
  if (!passResults.length || !recommendation || typeof recommendation !== "object") {
    return false;
  }

  const text = [recommendation.issue, recommendation.fix].filter(Boolean).join(" ").toLowerCase();
  return passResults.some((result) => claimTokens(result.label).some((token) => text.includes(token)));
}

function claimTokens(label) {
  if (typeof label !== "string") {
    return [];
  }

  const normalized = label.toLowerCase();
  const tokens = [normalized];

  if (/\bnew arrival\b|\bnew product\b/.test(normalized)) {
    tokens.push("new arrival", "new product");
  }

  if (/\bbest[ -]?seller\b/.test(normalized)) {
    tokens.push("best seller", "bestseller");
  }

  if (/\bsale\b|\bdiscount\b/.test(normalized)) {
    tokens.push("sale", "discount");
  }

  if (/\blimited edition\b|\blimited\b/.test(normalized)) {
    tokens.push("limited edition");
  }

  if (/\bpre[- ]?order\b/.test(normalized)) {
    tokens.push("pre-order", "preorder");
  }

  return [...new Set(tokens.filter((token) => token.length >= 4))];
}

function hasType(item, type) {
  const value = item?.["@type"];
  const types = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return types.includes(type);
}
