# Blind Inference Calibration

Use this before trusting the live Groq prompt.

## Step 1: Poor Man's Scraper

Open a real Shopify product page in Chrome DevTools and run:

```js
['nav', 'footer', 'header', '.cookie-banner', 'script', 'style'].forEach(sel => {
  document.querySelectorAll(sel).forEach(el => el.remove());
});
console.log(document.body.innerText);
```

Save the copied output to a local text file, for example `tmp/raw-shopify.txt`.

## Step 2: Run Calibration

Dry-run the exact Groq request:

```bash
node scripts/calibrate-groq.js --raw-file tmp/raw-shopify.txt --dry-run
```

Call Groq with JSON mode:

```bash
GROQ_API_KEY=... node scripts/calibrate-groq.js \
  --raw-file tmp/raw-shopify.txt \
  --targets "Luxury / Premium,Eco-Friendly Packaging,Fast 2-Day Shipping"
```

The script uses `llama-3.3-70b-versatile`, temperature `0.1`, and JSON mode.

## Quality Checklist

- Hallucination Check: inferred identities must be based on pasted text, not outside brand knowledge.
- Evidence Check: PASS evidence must quote or point to exact pasted text.
- Brutality Check: missing intents must be marked FAIL.
- Actionability Check: fixes must be Shopify-specific, concrete, and name the page/surface to edit.
- Schema Check: output must be valid JSON with no markdown fences.
