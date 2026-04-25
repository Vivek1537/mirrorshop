export const RESULT_STATUSES = ["PASS", "FAIL", "UNCLEAR"];

export function validateAuditResult(result) {
  const errors = [];

  if (!isObject(result)) {
    return ["Audit result must be an object."];
  }

  requireString(result.summary, "summary", errors);
  requireStringArray(result.inferred_identities, "inferred_identities", errors);
  validateSubmittedResults(result.submitted_results, errors);
  validateRecommendations(result.recommendations, errors);
  validateDescriptions(result.llms_txt_descriptions, errors);
  validateSourceCoverage(result.source_coverage, errors);

  return errors;
}

function validateSubmittedResults(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("submitted_results must be an array.");
    return;
  }

  value.forEach((item, index) => {
    const path = `submitted_results[${index}]`;
    if (!isObject(item)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    requireString(item.label, `${path}.label`, errors);
    requireString(item.evidence, `${path}.evidence`, errors);

    if (!RESULT_STATUSES.includes(item.status)) {
      errors.push(`${path}.status must be one of ${RESULT_STATUSES.join(", ")}.`);
    }
  });
}

function validateRecommendations(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("recommendations must be an array.");
    return;
  }

  value.forEach((item, index) => {
    const path = `recommendations[${index}]`;
    if (!isObject(item)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    if (!Number.isInteger(item.priority) || item.priority < 1) {
      errors.push(`${path}.priority must be a positive integer.`);
    }

    requireString(item.surface, `${path}.surface`, errors);
    requireString(item.issue, `${path}.issue`, errors);
    requireString(item.fix, `${path}.fix`, errors);
  });
}

function validateDescriptions(value, errors) {
  if (!isObject(value)) {
    errors.push("llms_txt_descriptions must be an object keyed by real extracted paths.");
    return;
  }

  Object.entries(value).forEach(([path, description]) => {
    if (!path.startsWith("/")) {
      errors.push(`llms_txt_descriptions key "${path}" must be a root-relative path.`);
    }
    requireString(description, `llms_txt_descriptions["${path}"]`, errors);
  });
}

function validateSourceCoverage(value, errors) {
  if (!isObject(value)) {
    errors.push("source_coverage must be an object.");
    return;
  }

  ["homepage", "product_page", "robots_txt", "llms_txt_existing", "json_ld"].forEach((key) => {
    if (typeof value[key] !== "boolean") {
      errors.push(`source_coverage.${key} must be a boolean.`);
    }
  });
}

function requireString(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string.`);
  }
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${path} must be an array of non-empty strings.`);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
