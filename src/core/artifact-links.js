import { extractBreadcrumbCollectionLinks } from "./breadcrumb-links.js";

const MAX_COLLECTION_LINKS = 2;
const MAX_POLICY_LINKS = 4;
const MAX_HELPFUL_LINKS = 3;

const POLICY_KEYWORDS = [
  "shipping",
  "return",
  "refund",
  "exchange",
  "delivery",
  "policy",
  "faq",
  "help",
  "support",
  "contact",
  "customer-service",
  "customer care",
  "size-guide",
  "sizing",
  "care",
  "materials",
  "sustain",
  "warranty"
];

const GENERIC_COLLECTION_KEYWORDS = [
  "men",
  "mens",
  "women",
  "womens",
  "kids",
  "accessories",
  "sale",
  "shop-all",
  "all-products",
  "all",
  "new-arrivals",
  "new",
  "catalog"
];

const HIGH_SIGNAL_COLLECTION_KEYWORDS = [
  "compression",
  "gift",
  "travel",
  "running",
  "hiking",
  "bundle",
  "pack",
  "bestseller",
  "organic",
  "cotton",
  "wool",
  "performance",
  "sustain",
  "material"
];

export function selectArtifactLinks(scrapePayload) {
  const selected = [];
  const seen = new Set();
  const pageLinks = buildPageLinks(scrapePayload?.pages || []);
  const breadcrumbCollections = extractBreadcrumbCollectionLinks(scrapePayload?.json_ld || []);
  const internalLinks = dedupeLinks(scrapePayload?.internal_links || []);

  pageLinks
    .filter((link) => link.group === "storefront")
    .forEach((link) => addUnique(selected, seen, link));

  pageLinks
    .filter((link) => link.group === "products")
    .forEach((link) => addUnique(selected, seen, link));

  if (!selected.some((link) => link.group === "products")) {
    const internalProduct = rankLinks(internalLinks.filter((link) => link.path.startsWith("/products/"))).at(0);
    if (internalProduct) {
      addUnique(selected, seen, { ...internalProduct, group: "products" });
    }
  }

  breadcrumbCollections.forEach((link) => addUnique(selected, seen, { ...link, group: "collections" }));

  rankLinks(internalLinks.filter((link) => classifyLink(link) === "collections"))
    .slice(0, Math.max(0, MAX_COLLECTION_LINKS - selected.filter((link) => link.group === "collections").length))
    .forEach((link) => addUnique(selected, seen, { ...link, group: "collections" }));

  rankLinks(internalLinks.filter((link) => classifyLink(link) === "policies"))
    .slice(0, MAX_POLICY_LINKS)
    .forEach((link) => addUnique(selected, seen, { ...link, group: "policies" }));

  rankLinks(internalLinks.filter((link) => classifyLink(link) === "helpful"))
    .slice(0, MAX_HELPFUL_LINKS)
    .forEach((link) => addUnique(selected, seen, { ...link, group: "helpful" }));

  return selected;
}

export function listAllowedDescriptionPaths(scrapePayload) {
  return selectArtifactLinks(scrapePayload).map((link) => link.path);
}

export function inferArtifactGroup(link) {
  return classifyLink(link);
}

function buildPageLinks(pages) {
  return pages
    .map((page) => {
      try {
        const path = new URL(page.url).pathname || "/";
        return {
          path,
          text: cleanLine(page.h1 || page.title || path),
          group: path === "/" ? "storefront" : path.startsWith("/products/") ? "products" : classifyLink({
            path,
            text: page.h1 || page.title || path
          })
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function dedupeLinks(links) {
  const deduped = [];
  const seen = new Set();

  links.forEach((link) => {
    if (!link || typeof link.path !== "string") {
      return;
    }

    const normalizedPath = normalizePath(link.path);
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }

    seen.add(normalizedPath);
    deduped.push({
      path: normalizedPath,
      text: cleanLine(link.text || normalizedPath)
    });
  });

  return deduped;
}

function rankLinks(links) {
  return [...links].sort((left, right) => {
    const scoreDelta = scoreLink(right) - scoreLink(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const depthDelta = pathDepth(left.path) - pathDepth(right.path);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    return left.path.localeCompare(right.path);
  });
}

function scoreLink(link) {
  const haystack = `${link.path} ${link.text}`.toLowerCase();
  let score = 0;

  if (classifyLink(link) === "policies") {
    score += 200;
  }

  if (haystack.includes("/pages/")) {
    score += 40;
  }

  if (haystack.includes("/policies/")) {
    score += 50;
  }

  POLICY_KEYWORDS.forEach((keyword, index) => {
    if (haystack.includes(keyword)) {
      score += 30 - Math.min(index, 10);
    }
  });

  HIGH_SIGNAL_COLLECTION_KEYWORDS.forEach((keyword) => {
    if (haystack.includes(keyword)) {
      score += 25;
    }
  });

  GENERIC_COLLECTION_KEYWORDS.forEach((keyword) => {
    if (haystack.includes(keyword)) {
      score -= 22;
    }
  });

  if (link.path.startsWith("/collections/")) {
    score += 20;
  }

  if (link.path.startsWith("/products/")) {
    score -= 80;
  }

  if (isUtilityPath(link.path)) {
    score -= 120;
  }

  return score;
}

function classifyLink(link) {
  const haystack = `${link?.path || ""} ${link?.text || ""}`.toLowerCase();

  if (!haystack || isUtilityPath(link?.path || "")) {
    return "other";
  }

  if (isPolicyPath(haystack) || isSupportPath(haystack)) {
    return "policies";
  }

  if (isHighSignalCollection(haystack)) {
    return "collections";
  }

  if (isHelpfulPage(haystack)) {
    return "helpful";
  }

  return "other";
}

function isPolicyPath(haystack) {
  return ["/policies/", "shipping", "returns", "refund", "exchange", "delivery", "privacy", "terms"].some((keyword) => haystack.includes(keyword));
}

function isSupportPath(haystack) {
  return ["faq", "help", "support", "contact", "size guide", "size-guide", "sizing", "warranty", "care", "materials"].some((keyword) => haystack.includes(keyword));
}

function isHelpfulPage(haystack) {
  return haystack.includes("/pages/") && ["about", "story", "sustain", "materials", "faq", "help", "guide", "contact"].some((keyword) => haystack.includes(keyword));
}

function isHighSignalCollection(haystack) {
  if (!haystack.includes("/collections/")) {
    return false;
  }

  const hasSignal = HIGH_SIGNAL_COLLECTION_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const isGeneric = GENERIC_COLLECTION_KEYWORDS.some((keyword) => haystack.includes(keyword));
  return hasSignal && !isGeneric;
}

function isUtilityPath(path) {
  return ["/account", "/cart", "/checkout", "/search", "/blogs/"].some((segment) => path.startsWith(segment));
}

function addUnique(selected, seen, link) {
  const normalizedPath = normalizePath(link.path);
  if (!normalizedPath || seen.has(normalizedPath)) {
    return;
  }

  seen.add(normalizedPath);
  selected.push({
    path: normalizedPath,
    text: cleanLine(link.text || normalizedPath),
    group: link.group || classifyLink(link)
  });
}

function normalizePath(value) {
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(value, "https://example.com");
    return url.pathname === "" ? "/" : url.pathname;
  } catch {
    return "";
  }
}

function pathDepth(path) {
  return path.split("/").filter(Boolean).length;
}

function cleanLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
