const STORE_TYPES = new Set([
  "Organization",
  "Brand",
  "Store",
  "LocalBusiness",
  "Corporation",
  "WebSite"
]);

const GENERIC_SEGMENTS = [
  "shop",
  "store",
  "official site",
  "online store",
  "homepage",
  "home",
  "shipping",
  "returns",
  "return policy",
  "faq",
  "help",
  "support",
  "contact",
  "sale",
  "new arrivals",
  "gift cards"
];

export function resolveStoreName(scrapePayload) {
  const pages = Array.isArray(scrapePayload?.pages) ? scrapePayload.pages : [];
  const homepage = pages.find((page) => page?.role === "homepage") || pages[0];
  const productPage = pages.find((page) => page?.role === "product_page");
  const productNames = collectProductNames(scrapePayload, productPage);
  const domainLabel = extractDomainLabel(scrapePayload?.store_url);
  const candidates = new Map();

  const addCandidate = (name, baseScore) => {
    const normalized = normalizeCandidate(name);
    if (!normalized) {
      return;
    }

    let score = baseScore;
    const lowered = normalized.toLowerCase();

    if (domainLabel && stripSeparators(lowered) === stripSeparators(domainLabel.toLowerCase())) {
      score += 24;
    }

    if (looksGeneric(lowered)) {
      score -= 30;
    }

    if (looksProductLike(normalized, productNames)) {
      score -= 90;
    }

    if (normalized.split(" ").length <= 4) {
      score += 8;
    }

    const existing = candidates.get(lowered);
    if (!existing || existing.score < score) {
      candidates.set(lowered, { name: normalized, score });
    }
  };

  for (const item of scrapePayload?.json_ld || []) {
    const types = toTypeArray(item);

    if (types.some((type) => STORE_TYPES.has(type)) && typeof item?.name === "string") {
      addCandidate(item.name, 140);
    }

    const brandName = extractBrandName(item);
    if (brandName) {
      addCandidate(brandName, 128);
    }
  }

  splitTitle(homepage?.title).forEach((segment) => addCandidate(segment, 110));
  addCandidate(homepage?.title, 80);
  addCandidate(homepage?.h1, 45);

  if (domainLabel) {
    addCandidate(domainLabel, 55);
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .at(0)?.name || "Store";
}

function collectProductNames(scrapePayload, productPage) {
  const names = new Set();

  [productPage?.title, productPage?.h1].forEach((value) => {
    const normalized = normalizeCandidate(value);
    if (normalized) {
      names.add(normalized.toLowerCase());
    }
  });

  for (const item of scrapePayload?.json_ld || []) {
    if (!toTypeArray(item).includes("Product")) {
      continue;
    }

    const normalized = normalizeCandidate(item?.name);
    if (normalized) {
      names.add(normalized.toLowerCase());
    }
  }

  return names;
}

function extractBrandName(item) {
  const brand = item?.brand;
  if (typeof brand === "string") {
    return brand;
  }

  if (brand && typeof brand === "object" && typeof brand.name === "string") {
    return brand.name;
  }

  return null;
}

function splitTitle(value) {
  const normalized = normalizeCandidate(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*(?:\||-|–|—|:|·)\s*/g)
    .map((segment) => normalizeCandidate(segment))
    .filter(Boolean);
}

function looksGeneric(value) {
  return GENERIC_SEGMENTS.some((segment) => value.includes(segment));
}

function looksProductLike(candidate, productNames) {
  const lowered = candidate.toLowerCase();
  if (productNames.has(lowered)) {
    return true;
  }

  return [...productNames].some((name) => {
    if (name === lowered) {
      return true;
    }

    return lowered.length > 10 && (name.includes(lowered) || lowered.includes(name));
  });
}

function extractDomainLabel(storeUrl) {
  try {
    const hostname = new URL(storeUrl).hostname.replace(/^www\./, "");
    const [label] = hostname.split(".");
    return normalizeDomainLabel(label);
  } catch {
    return null;
  }
}

function normalizeDomainLabel(label) {
  if (!label) {
    return null;
  }

  return label
    .split(/[-_]+/g)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
    .join(" ")
    .trim() || null;
}

function normalizeCandidate(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function stripSeparators(value) {
  return value.replace(/[^a-z0-9]/g, "");
}

function toTypeArray(item) {
  const type = item?.["@type"];
  return Array.isArray(type) ? type : typeof type === "string" ? [type] : [];
}
