import { inferArtifactGroup } from "./artifact-links.js";

export function assembleLlmsTxt({ storeName, storeUrl, extractedLinks, descriptions }) {
  const safeStoreName = cleanLine(storeName || "Store");
  const safeStoreUrl = normalizeStoreUrl(storeUrl);
  const links = dedupeLinks(extractedLinks);
  const descriptionMap = descriptions || {};
  const homepageDescription = cleanLine(descriptionMap["/"] || `Public homepage for ${safeStoreName}`);

  const lines = [
    `# ${safeStoreName}`,
    "",
    `> Public storefront summary for AI shopping agents. Source: ${safeStoreUrl}`,
    "",
    "## Storefront",
    "",
    `- [Homepage](${safeStoreUrl}): ${homepageDescription}`
  ];

  const productLinks = links.filter((link) => link.path !== "/" && inferGroup(link) === "products");
  const collectionLinks = links.filter((link) => inferGroup(link) === "collections");
  const policyLinks = links.filter((link) => inferGroup(link) === "policies");
  const otherLinks = links.filter((link) => link.path !== "/" && inferGroup(link) === "helpful");

  appendSection(lines, productLinks.length > 1 ? "Products" : "Product", safeStoreUrl, productLinks, descriptionMap);
  appendSection(lines, "Collections", safeStoreUrl, collectionLinks, descriptionMap);
  appendSection(lines, "Policies And Help", safeStoreUrl, policyLinks, descriptionMap);
  appendSection(lines, "Helpful Pages", safeStoreUrl, otherLinks, descriptionMap);

  return `${lines.join("\n")}\n`;
}

function appendSection(lines, title, storeUrl, links, descriptions) {
  if (links.length === 0) {
    return;
  }

  lines.push("", `## ${title}`, "");

  links.forEach((link) => {
    const description = cleanLine(descriptions[link.path] || defaultDescriptionFor(link));
    lines.push(`- [${cleanLine(link.text || link.path)}](${storeUrl}${link.path}): ${description}`);
  });
}

function dedupeLinks(links = []) {
  const seen = new Set();
  const deduped = [];

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
      text: cleanLine(link.text || normalizedPath),
      group: link.group
    });
  });

  return deduped;
}

function normalizeStoreUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

function normalizePath(value) {
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(value, "https://example.com");
    return url.pathname === "" ? "/" : url.pathname;
  } catch {
    return "";
  }
}

function cleanLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function inferGroup(link) {
  if (link.group) {
    return link.group;
  }

  if (link.path.startsWith("/products/")) {
    return "products";
  }

  return inferArtifactGroup(link);
}

function defaultDescriptionFor(link) {
  const text = cleanLine(link.text || link.path);
  const group = inferGroup(link);

  if (group === "collections") {
    return `Collection page for ${text}`;
  }

  if (group === "policies") {
    return `${text} page`;
  }

  return text || "Public storefront page";
}
