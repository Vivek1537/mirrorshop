import { buildScrapePayload } from "../core/scrape-payload.js";
import { ERROR_CODES, MirrorShopError } from "../core/errors.js";

const DEFAULT_BLOCKED_SELECTORS = [
  "nav",
  "footer",
  "header",
  ".cookie-banner",
  "[id*='cookie']",
  "[class*='cookie']",
  "[id*='consent']",
  "[class*='consent']",
  "[aria-label*='cookie']",
  "[aria-label*='consent']",
  "[data-testid*='cookie']",
  "[data-testid*='consent']",
  "[role='dialog']",
  "script",
  "style",
  "iframe"
];

const PRODUCT_BADGE_PATTERNS = [
  "\\bnew\\b",
  "\\bbest ?seller\\b",
  "\\bsale\\b",
  "\\blimited(?: edition)?\\b",
  "\\bexclusive\\b",
  "\\bpre[- ]?order\\b",
  "\\bsold out\\b"
];

export function createPlaywrightScraper({
  playwright,
  browserOptions = {},
  blockedSelectors = DEFAULT_BLOCKED_SELECTORS
}) {
  if (!playwright || !playwright.chromium) {
    throw new TypeError("playwright.chromium is required.");
  }

  return async function scrapeStorefront(inputUrl) {
    const storeUrl = normalizeOrigin(inputUrl);
    const requestedPath = normalizeRequestedPath(inputUrl, storeUrl);
    let browser;

    try {
      browser = await playwright.chromium.launch({
        headless: true,
        ...browserOptions
      });

      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(storeUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      const homepage = sanitizePageSnapshot(
        await extractPageSnapshot(page, storeUrl, blockedSelectors),
        "homepage",
        storeUrl
      );

      if (isPasswordProtectedSnapshot(homepage)) {
        throw new MirrorShopError(ERROR_CODES.PASSWORD_PROTECTED, "Storefront is password protected.");
      }

      const productPath = isProductLikePath(requestedPath)
        ? requestedPath
        : chooseProductLink(homepage.internalLinks);
      let productPage = null;

      if (productPath) {
        await page.goto(new URL(productPath, storeUrl).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        productPage = sanitizePageSnapshot(
          await extractPageSnapshot(page, new URL(productPath, storeUrl).toString(), blockedSelectors),
          "product_page",
          storeUrl
        );
      }

      const robotsTxt = await fetchAuxiliaryText(context, `${storeUrl}/robots.txt`);
      const llmsTxt = await fetchAuxiliaryText(context, `${storeUrl}/llms.txt`);

      return buildScrapePayload({
        storeUrl,
        homepage,
        productPage,
        robotsTxt,
        existingLlmsTxt: llmsTxt
      });
    } catch (error) {
      if (error instanceof MirrorShopError) {
        throw error;
      }

      throw new MirrorShopError(ERROR_CODES.SCRAPE_FAILED, "Playwright storefront scrape failed.", {
        cause: error?.message || String(error)
      });
    } finally {
      await browser?.close().catch(() => {});
    }
  };
}

export function chooseProductLink(links = []) {
  const candidate = links.find((link) => typeof link?.path === "string" && isProductLikePath(link.path));
  return candidate ? candidate.path : null;
}

export function normalizeRequestedPath(inputUrl, storeUrl) {
  const url = new URL(inputUrl, storeUrl);
  return url.pathname || "/";
}

function isProductLikePath(path) {
  return typeof path === "string" && path.includes("/products/");
}

export function sanitizePageSnapshot(snapshot, role, storeUrl) {
  return {
    role,
    url: normalizePageUrl(snapshot.url || storeUrl, storeUrl),
    title: normalizeWhitespace(snapshot.title || ""),
    h1: normalizeWhitespace(snapshot.h1 || ""),
    text: cleanExtractedText(snapshot.text || ""),
    jsonLd: normalizeJsonLd(snapshot.jsonLd, snapshot.url || storeUrl),
    internalLinks: normalizeInternalLinks(snapshot.internalLinks || [], storeUrl)
  };
}

export function isPasswordProtectedSnapshot(snapshot) {
  const haystack = [
    snapshot?.title || "",
    snapshot?.h1 || "",
    snapshot?.text || ""
  ].join("\n").toLowerCase();

  return [
    "enter using password",
    "opening soon",
    "store using password",
    "password page",
    "this store is password protected"
  ].some((needle) => haystack.includes(needle));
}

export function cleanExtractedText(text) {
  const cleaned = String(text)
    .replace(/Cookie Preferences[\s\S]*?Confirm My Choices/gi, " ")
    .replace(/Close Where are we shipping to\?[\s\S]*?CONFIRM/gi, " ")
    .replace(/Where are we shipping to\?[\s\S]*?CONFIRM/gi, " ")
    .replace(/Chat Opt-Out Request Honored/gi, " ")
    .replace(/CART \(\d+\)/gi, " ")
    .replace(/Your cart is empty\.?\s*Start shopping!?/gi, " ")
    .replace(/SHOP WOMENS SHOP MENS SHOP SOCKS SHOP WOMEN'S SALE SHOP MEN'S SALE/gi, " ")
    .replace(/SHOP MEN SHOP WOMEN/gi, " ")
    .replace(/NEW ARRIVALS/gi, " ")
    .replace(/\bChat\b/gi, " ")
    .replace(/Pause/gi, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/ERR_BLOCKED_BY_CLIENT|shopify-perf-kit|monorail-edge/i.test(line))
    .filter((line) => !/cookie preferences|manage consent preferences|strictly necessary cookies|performance cookies|targeting cookies|reject all|confirm my choices|allow all/i.test(line))
    .filter((line) => !/^cart \(\d+\)$/i.test(line))
    .filter((line) => !/^your cart is empty\.?$/i.test(line))
    .filter((line) => !/^start shopping!?$/i.test(line));

  return dedupeLines(cleaned).join("\n");
}

export function normalizeInternalLinks(links, storeUrl) {
  const origin = normalizeOrigin(storeUrl);
  const seen = new Set();

  return links
    .map((link) => normalizeLink(link, origin))
    .filter(Boolean)
    .filter((link) => {
      if (seen.has(link.path)) {
        return false;
      }
      seen.add(link.path);
      return true;
    });
}

function normalizeJsonLd(items, pageUrl) {
  if (!Array.isArray(items)) {
    return [];
  }

  const pagePath = new URL(pageUrl, "https://example.com").pathname;
  const flatItems = flattenJsonLdItems(items);
  const normalized = [];
  let representativeVariant = null;
  let keptProduct = false;
  let keptAggregateRating = false;
  let keptBreadcrumb = false;

  flatItems
    .forEach((item) => {
      const types = toTypeArray(item);

      if (types.includes("BreadcrumbList") && !keptBreadcrumb) {
        normalized.push(item);
        keptBreadcrumb = true;
        return;
      }

      if (types.includes("AggregateRating") && !keptAggregateRating) {
        normalized.push(item);
        keptAggregateRating = true;
        return;
      }

      if (types.includes("ProductGroup") && !keptProduct) {
        const itemPath = extractProductPath(item);
        if (itemPath && itemPath !== pagePath) {
          return;
        }

        normalized.push(pruneProductJsonLd(item));
        keptProduct = true;
        return;
      }

      if (!types.includes("Product") || keptProduct) {
        return;
      }

      const itemPath = extractProductPath(item);
      if (itemPath && itemPath !== pagePath) {
        return;
      }

      if (isVariantProduct(item)) {
        representativeVariant ??= item;
        return;
      }

      normalized.push(pruneProductJsonLd(item));
      keptProduct = true;
    });

  if (!keptProduct && representativeVariant) {
    normalized.unshift(pruneProductJsonLd(representativeVariant, { canonicalPath: pagePath }));
  }

  return normalized;
}

function normalizeLink(link, origin) {
  const href = link?.href || link?.path;
  if (typeof href !== "string" || href.trim() === "") {
    return null;
  }

  let url;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) {
    return null;
  }

  return {
    path: url.pathname || "/",
    text: normalizeWhitespace(link?.text || url.pathname || "/")
  };
}

async function extractPageSnapshot(page, url, blockedSelectors) {
  const html = await page.content();

  return page.evaluate(({ blockedSelectors, url, badgePatterns }) => {
    function normalizeLocalWhitespace(value) {
      return String(value).replace(/\s+/g, " ").trim();
    }

    function collectVisibleBadgeSignals() {
      const titleRect = document.querySelector("h1")?.getBoundingClientRect();
      const patterns = badgePatterns.map((pattern) => new RegExp(pattern, "i"));

      const candidates = Array.from(document.querySelectorAll("span, div, p, strong, em, button, a"))
        .map((node) => {
          const text = normalizeLocalWhitespace(node.textContent || "");
          if (!text || text.length > 24 || !patterns.some((pattern) => pattern.test(text))) {
            return null;
          }

          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          const visible = rect.width > 0
            && rect.height > 0
            && style.visibility !== "hidden"
            && style.display !== "none";

          if (!visible) {
            return null;
          }

          if (titleRect) {
            const verticallyNearTitle = Math.abs(rect.top - titleRect.top) < 220;
            const horizontallyNearTitle = rect.left > titleRect.left - 120 && rect.left < titleRect.right + 320;
            if (!verticallyNearTitle || !horizontallyNearTitle) {
              return null;
            }
          }

          return text.toUpperCase();
        })
        .filter(Boolean);

      return [...new Set(candidates)];
    }

    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((node) => {
        try {
          return JSON.parse(node.textContent || "");
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((item) => Array.isArray(item) ? item : [item]);

    blockedSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => element.remove());
    });

    const internalLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((node) => ({
        href: node.getAttribute("href") || "",
        text: node.textContent || ""
      }));

    const badgeSignals = collectVisibleBadgeSignals();

    return {
      url,
      title: document.title || "",
      h1: document.querySelector("h1")?.textContent || "",
      text: [badgeSignals.join("\n"), document.body?.innerText || ""].filter(Boolean).join("\n"),
      jsonLd,
      internalLinks
    };
  }, { blockedSelectors, url, badgePatterns: PRODUCT_BADGE_PATTERNS }).then((snapshot) => {
    const fallbackJsonLd = extractJsonLdFromHtml(html);
    return {
      ...snapshot,
      jsonLd: snapshot.jsonLd.length > 0 ? snapshot.jsonLd : fallbackJsonLd
    };
  });
}

async function fetchAuxiliaryText(context, url) {
  const request = await context.request.get(url, { failOnStatusCode: false, timeout: 10000 });
  if (!request.ok()) {
    return null;
  }

  const text = await request.text();
  return normalizeWhitespace(text);
}

function normalizeOrigin(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

function normalizePageUrl(value, storeUrl) {
  const url = new URL(value, storeUrl);
  return `${url.origin}${url.pathname}`;
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function dedupeLines(lines) {
  const deduped = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }
  return deduped;
}

function extractJsonLdFromHtml(html) {
  const matches = Array.from(
    String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );

  return flattenJsonLdItems(matches
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean));
}

function toTypeArray(item) {
  const type = item?.["@type"];
  return Array.isArray(type) ? type : typeof type === "string" ? [type] : [];
}

function isVariantProduct(item) {
  if (item?.isVariantOf || item?.size) {
    return true;
  }

  const offerUrl = item?.offers?.url;
  if (typeof offerUrl === "string") {
    try {
      return Boolean(new URL(offerUrl).search);
    } catch {
      return offerUrl.includes("?");
    }
  }

  return false;
}

function extractProductPath(item) {
  const candidateUrls = [item?.url, item?.offers?.url].filter((value) => typeof value === "string");

  for (const value of candidateUrls) {
    try {
      return new URL(value).pathname;
    } catch {
      continue;
    }
  }

  return null;
}

function pruneProductJsonLd(item, { canonicalPath } = {}) {
  const pruned = {
    "@type": "Product"
  };

  [
    "@id",
    "name",
    "description",
    "sku",
    "brand",
    "category",
    "color",
    "material",
    "url",
    "aggregateRating"
  ].forEach((key) => {
    if (item[key] !== undefined) {
      pruned[key] = item[key];
    }
  });

  if (Array.isArray(item.image)) {
    pruned.image = item.image.slice(0, 4);
  } else if (item.image) {
    pruned.image = item.image;
  }

  if (item.offers && typeof item.offers === "object") {
    pruned.offers = {};
    ["@type", "availability", "price", "priceCurrency", "url"].forEach((key) => {
      if (item.offers[key] !== undefined) {
        pruned.offers[key] = item.offers[key];
      }
    });
  }

  if (canonicalPath) {
    if (typeof pruned.url === "string") {
      try {
        const canonicalUrl = new URL(pruned.url);
        canonicalUrl.search = "";
        canonicalUrl.hash = "";
        canonicalUrl.pathname = canonicalPath;
        pruned.url = canonicalUrl.toString();
      } catch {
        pruned.url = canonicalPath;
      }
    } else {
      pruned.url = canonicalPath;
    }

    if (typeof pruned.offers?.url === "string") {
      try {
        const canonicalOfferUrl = new URL(pruned.offers.url);
        canonicalOfferUrl.search = "";
        canonicalOfferUrl.hash = "";
        canonicalOfferUrl.pathname = canonicalPath;
        pruned.offers.url = canonicalOfferUrl.toString();
      } catch {
        pruned.offers.url = canonicalPath;
      }
    }
  }

  return pruned;
}

function flattenJsonLdItems(items) {
  return items
    .filter((item) => item && typeof item === "object")
    .flatMap((item) => {
      if (Array.isArray(item["@graph"])) {
        return flattenJsonLdItems(item["@graph"]);
      }

      if (Array.isArray(item)) {
        return flattenJsonLdItems(item);
      }

      return [item];
    });
}
