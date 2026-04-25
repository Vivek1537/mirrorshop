import { ERROR_CODES, MirrorShopError } from "../core/errors.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export function createGroqAnalyzer({
  apiKey = process.env.GROQ_API_KEY,
  fetchImpl = fetch,
  model = DEFAULT_MODEL,
  temperature = 0.1
} = {}) {
  return async function analyzeVisibility(messages) {
    if (!apiKey) {
      throw new MirrorShopError(
        ERROR_CODES.LLM_ERROR,
        "GROQ_API_KEY is required to run a live MirrorShop scan."
      );
    }

    const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages
      })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new MirrorShopError(
        ERROR_CODES.LLM_ERROR,
        "Groq visibility analysis failed.",
        {
          status: response.status,
          cause: payload?.error?.message || response.statusText
        }
      );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new MirrorShopError(
        ERROR_CODES.LLM_ERROR,
        "Groq returned an empty analysis response."
      );
    }

    if (process.env.MIRRORSHOP_DEBUG === "1") {
      console.log("[MirrorShop] Groq raw response:");
      console.log(content);
    }

    return content;
  };
}
