export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  PASSWORD_PROTECTED: "PASSWORD_PROTECTED",
  SCRAPE_FAILED: "SCRAPE_FAILED",
  LLM_ERROR: "LLM_ERROR",
  TIMEOUT: "TIMEOUT"
};

export class MirrorShopError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MirrorShopError";
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error) {
  if (error instanceof MirrorShopError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
  }

  return {
    ok: false,
    error: {
      code: ERROR_CODES.SCRAPE_FAILED,
      message: "Unexpected MirrorShop scan failure.",
      details: { cause: error && error.message ? error.message : String(error) }
    }
  };
}
