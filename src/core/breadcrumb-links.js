export function extractBreadcrumbCollectionLinks(jsonLd = []) {
  const breadcrumbItems = jsonLd
    .filter((item) => hasType(item, "BreadcrumbList"))
    .flatMap((item) => Array.isArray(item?.itemListElement) ? item.itemListElement : [])
    .map((entry) => normalizeBreadcrumbEntry(entry))
    .filter(Boolean);

  const collectionEntries = dedupeByPath(breadcrumbItems.filter((entry) => entry.path.startsWith("/collections/")));
  if (collectionEntries.length <= 2) {
    return collectionEntries;
  }

  return collectionEntries.slice(-2);
}

function normalizeBreadcrumbEntry(entry) {
  const item = entry?.item;
  const rawPath = item?.id || item?.["@id"];
  if (typeof rawPath !== "string") {
    return null;
  }

  try {
    const url = rawPath.startsWith("http") ? new URL(rawPath) : new URL(rawPath, "https://example.com");
    return {
      path: url.pathname || "/",
      text: cleanLine(item?.name || url.pathname || "/"),
      group: "collections"
    };
  } catch {
    return null;
  }
}

function dedupeByPath(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (seen.has(entry.path)) {
      return false;
    }
    seen.add(entry.path);
    return true;
  });
}

function hasType(item, type) {
  const value = item?.["@type"];
  const types = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return types.includes(type);
}

function cleanLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
