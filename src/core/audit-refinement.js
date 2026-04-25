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

export function refineAuditWithScrapePayload(audit, scrapePayload) {
  if (!audit || typeof audit !== "object") {
    return audit;
  }

  return {
    ...audit,
    submitted_results: Array.isArray(audit.submitted_results)
      ? audit.submitted_results.map((item) => refineSubmittedResult(item, scrapePayload))
      : audit.submitted_results
  };
}

function refineSubmittedResult(item, scrapePayload) {
  if (!item || typeof item !== "object") {
    return item;
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

function isSoftPositioningClaim(label) {
  if (typeof label !== "string") {
    return false;
  }

  return SOFT_POSITIONING_PATTERNS.some((pattern) => pattern.test(label));
}

function hasType(item, type) {
  const value = item?.["@type"];
  const types = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return types.includes(type);
}
