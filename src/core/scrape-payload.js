export const INTERNAL_LINK_LIMIT = 20;

export function buildScrapePayload({ storeUrl, homepage, productPage, robotsTxt = null, existingLlmsTxt = null }) {
  const origin = normalizeOrigin(storeUrl);
  const home = normalizePage(homepage, "homepage", origin);
  const product = productPage ? normalizePage(productPage, "product_page", origin) : null;

  const internalLinks = mergeInternalLinks([
    ...(home.internalLinks || []),
    ...((product && product.internalLinks) || [])
  ], origin).slice(0, INTERNAL_LINK_LIMIT);

  const pages = product ? [home, product] : [home];

  return {
    store_url: origin,
    pages,
    internal_links: internalLinks,
    json_ld: pages.flatMap((page) => page.jsonLd),
    evidence_text: pages.map(formatPageEvidence).join("\n\n"),
    robots_txt: typeof robotsTxt === "string" ? robotsTxt : null,
    llms_txt_existing: typeof existingLlmsTxt === "string" ? existingLlmsTxt : null,
    source_coverage: {
      homepage: true,
      product_page: Boolean(product),
      robots_txt: typeof robotsTxt === "string",
      llms_txt_existing: typeof existingLlmsTxt === "string",
      json_ld: pages.some((page) => page.jsonLd.length > 0)
    }
  };
}

function normalizePage(page, role, origin) {
  if (!page || typeof page !== "object") {
    throw new TypeError(`${role} page is required.`);
  }

  return {
    role,
    url: normalizeUrl(page.url || origin, origin),
    title: cleanText(page.title || ""),
    h1: cleanText(page.h1 || ""),
    text: cleanText(page.text || ""),
    jsonLd: Array.isArray(page.jsonLd) ? page.jsonLd.filter((item) => item && typeof item === "object") : [],
    internalLinks: mergeInternalLinks(page.internalLinks || [], origin)
  };
}

function mergeInternalLinks(links, origin) {
  const seen = new Set();
  const merged = [];

  links.forEach((link) => {
    const normalized = normalizeLink(link, origin);
    if (!normalized || seen.has(normalized.path)) {
      return;
    }

    seen.add(normalized.path);
    merged.push(normalized);
  });

  return merged;
}

function normalizeLink(link, origin) {
  if (!link || typeof link !== "object") {
    return null;
  }

  const rawHref = link.href || link.path;
  if (typeof rawHref !== "string" || rawHref.trim() === "") {
    return null;
  }

  let url;
  try {
    url = new URL(rawHref, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) {
    return null;
  }

  return {
    path: url.pathname || "/",
    text: cleanText(link.text || url.pathname || "/")
  };
}

function normalizeOrigin(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

function normalizeUrl(value, origin) {
  const url = new URL(value, origin);
  return `${url.origin}${url.pathname}`;
}

function formatPageEvidence(page) {
  const header = [`[${page.role}]`, page.title, page.h1].filter(Boolean).join(" ");
  return `${header}\n${page.text}`.trim();
}

function cleanText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
