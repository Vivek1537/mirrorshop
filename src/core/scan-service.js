import { assembleLlmsTxt } from "./llms-txt.js";
import { selectArtifactLinks } from "./artifact-links.js";
import { refineAuditWithScrapePayload } from "./audit-refinement.js";
import { buildVisibilityPrompt, listAllowedDescriptionPaths, parseGroqAuditResponse } from "./groq-analysis.js";
import { ERROR_CODES, MirrorShopError, toErrorResponse } from "./errors.js";

export async function runScan(request, dependencies) {
  try {
    const normalizedRequest = validateScanRequest(request);
    const scrapePayload = await dependencies.scrapeStorefront(normalizedRequest.url);
    const messages = buildVisibilityPrompt({
      submittedIdentities: normalizedRequest.identities,
      scrapePayload
    });
    const artifactLinks = selectArtifactLinks(scrapePayload);
    const allowedPaths = listAllowedDescriptionPaths(scrapePayload);
    const rawAnalysis = await dependencies.analyzeVisibility(messages);
    const rawAudit = parseGroqAuditResponse(
      rawAnalysis,
      allowedPaths,
      scrapePayload.source_coverage
    );
    const audit = refineAuditWithScrapePayload(rawAudit, scrapePayload);
    const llmsTxt = assembleLlmsTxt({
      storeName: dependencies.resolveStoreName ? dependencies.resolveStoreName(scrapePayload) : "Store",
      storeUrl: scrapePayload.store_url,
      extractedLinks: artifactLinks,
      descriptions: audit.llms_txt_descriptions
    });

    return {
      ok: true,
      data: {
        audit,
        llms_txt: llmsTxt,
        scrape: {
          store_url: scrapePayload.store_url,
          source_coverage: scrapePayload.source_coverage,
          internal_links: scrapePayload.internal_links
        }
      }
    };
  } catch (error) {
    return toErrorResponse(error);
  }
}

function validateScanRequest(request) {
  if (!request || typeof request !== "object") {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Request body must be an object.");
  }

  const url = validateUrl(request.url);
  const identities = validateIdentities(request.identities);

  return { url, identities };
}

function validateUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Shopify store URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Shopify store URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Shopify store URL must start with https://.");
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

function validateIdentities(value) {
  if (!Array.isArray(value)) {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Identities must be an array.");
  }

  const identities = value.map((item) => String(item).trim()).filter(Boolean);
  if (identities.length < 1 || identities.length > 3) {
    throw new MirrorShopError(ERROR_CODES.BAD_REQUEST, "Enter 1 to 3 brand identities.");
  }

  return identities;
}
