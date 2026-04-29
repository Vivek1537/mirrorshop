# MirrorShop Technical Document

MirrorShop is implemented as a single Node.js server deployed for the live demo on Railway. The current code uses Node's built-in `node:http` server rather than Express, but the runtime shape is intentionally simple: one process serves the static frontend and exposes one scan endpoint at `POST /api/scan`. The server wiring lives in `src/server.js`, where the Playwright scraper, Groq analyzer, and core scan service are composed before requests are handled.

## System Architecture

The system has four main components. The first is the vanilla HTML, CSS, and JavaScript frontend in `public/index.html`, `public/styles.css`, and `src/frontend/client.js`. The frontend collects a Shopify URL and one to three target brand identities, disables the submit button during a local scan, sends the request to `/api/scan`, and renders the returned audit dashboard. The fetch call is issued from `src/frontend/client.js:34`, and the client-side busy state is handled at `src/frontend/client.js:64`.

The second component is the server entry point in `src/server.js`. It serves static assets and routes `POST /api/scan` to `runScan` at `src/server.js:29`. The server constructs the live dependencies once at startup: `createPlaywrightScraper` for browser scraping, `createGroqAnalyzer` for LLM analysis, and `resolveStoreName` for naming the generated artifact (`src/server.js:17` and `src/server.js:21`).

The third component is the scraper adapter in `src/adapters/playwright-scraper.js`. It launches headless Chromium, navigates to the storefront with `waitUntil: "domcontentloaded"` and a 45-second timeout, extracts rendered DOM text, JSON-LD schema, and internal links, then optionally visits a product page. The implementation deliberately avoids `networkidle` because Shopify storefronts often keep background connections open; the relevant navigation calls are at `src/adapters/playwright-scraper.js:56` and `src/adapters/playwright-scraper.js:73`.

The fourth component is the core analysis pipeline in `src/core`. `src/core/scan-service.js` validates input, calls the scraper, builds the Groq prompt, validates the LLM response, applies deterministic refinements, assembles `llms.txt`, and returns one structured JSON response. The main orchestration path is visible from `src/core/scan-service.js:7` through `src/core/scan-service.js:42`.

## Data Flow

A scan begins when the browser posts the submitted URL and identities to `/api/scan`. The server parses the JSON body and calls `runScan` (`src/server.js:29`). `runScan` first validates that the URL is HTTPS and that the request contains one to three identities (`src/core/scan-service.js:48`). This keeps the public demo surface narrow and prevents the LLM pipeline from receiving malformed scan contracts.

The scraper normalizes the store origin, launches Chromium, opens a new browser context, and loads the storefront (`src/adapters/playwright-scraper.js:42`). After navigation, it extracts a homepage snapshot. The snapshot extraction parses each JSON-LD block individually with `JSON.parse`, rather than concatenating script contents into one fragile string (`src/adapters/playwright-scraper.js:324`). It then removes noisy DOM surfaces such as navigation, footer, header, scripts, styles, iframes, cookie banners, and dialogs before reading body text (`src/adapters/playwright-scraper.js:4` and `src/adapters/playwright-scraper.js:335`).

The scraper then chooses a product page. If the submitted URL already looks like a product URL, that path is used. Otherwise, the scraper selects the first discovered `/products/` link from the homepage (`src/adapters/playwright-scraper.js:67` and `src/adapters/playwright-scraper.js:108`). The product page is loaded and extracted using the same snapshot logic. The scraper also fetches `robots.txt` and an existing `llms.txt` if available (`src/adapters/playwright-scraper.js:84`).

The raw snapshots are normalized into a scan payload in `src/core/scrape-payload.js`. The payload preserves homepage and product-page coverage, flattens JSON-LD into a single schema collection, combines evidence text, and deduplicates internal links. The first 20 normalized internal links are retained by the scan contract (`src/core/scrape-payload.js:1` and `src/core/scrape-payload.js:8`). Artifact links for the final `llms.txt` are selected separately in `src/core/artifact-links.js`, which prioritizes the homepage, scanned product, high-signal collections, policies, and helpful pages (`src/core/artifact-links.js:61`).

Next, `src/core/groq-analysis.js` builds a constrained prompt for Groq using `llama-3.3-70b-versatile`. The prompt asks the model to perform blind inference, grade the submitted identities, provide evidence, generate tactical Shopify fixes, and return strict JSON only (`src/core/groq-analysis.js:4`). The Groq adapter requests JSON mode at `src/adapters/groq-client.js:25` and rejects empty or failed responses as `LLM_ERROR` (`src/adapters/groq-client.js:35`).

After Groq returns, MirrorShop parses and validates the JSON contract. The parser rejects invalid JSON, validates the audit shape, and checks that `llms_txt_descriptions` keys are selected only from real extracted paths (`src/core/groq-analysis.js:88` and `src/core/groq-analysis.js:117`). The audit then passes through deterministic post-processing before `src/core/llms-txt.js` assembles the final artifact from verified links.

## Implementation Decisions

The most important implementation decision was using Playwright instead of a static parser. Shopify storefronts frequently render product content, badges, navigation, and structured data after JavaScript execution. A Cheerio-style HTML fetch is faster, but it can miss exactly the public content an AI shopping agent would see. Playwright is heavier, but for this product the browser-observed storefront is the source of truth.

The scan service is dependency-injected rather than tightly bound to HTTP. `runScan` accepts `scrapeStorefront`, `analyzeVisibility`, and `resolveStoreName` as dependencies (`src/core/scan-service.js:7`). This made it possible to test the product contract with fixtures before relying on live Shopify pages, Groq credentials, or the deployment environment.

The scraper also treats schema as first-class evidence. JSON-LD blocks are parsed into objects and later normalized to avoid variant-heavy product noise. ProductGroup, Product, BreadcrumbList, and AggregateRating data are preserved only when relevant to the scanned page (`src/adapters/playwright-scraper.js:191`). This keeps the LLM input closer to the storefront meaning rather than flooding it with repeated variant objects.

## AI and Deterministic Boundaries

The LLM is responsible for judgment and language. It writes the perception summary, inferred identities, per-identity `PASS`, `FAIL`, or `UNCLEAR` grades, evidence explanations, recommendations, and one-line `llms.txt` descriptions. These are tasks where semantic interpretation matters and where natural language output is useful.

Deterministic code handles rules that must not hallucinate. Conditional shipping and returns claims are the clearest example. The prompt already tells the model that "free shipping over $75" must fail an unconditional "free shipping" identity, but MirrorShop does not rely on instruction following alone. The post-processing layer detects unconditional logistics claims and forces `FAIL` when the evidence contains threshold language (`src/core/audit-refinement.js:177`). That override is called during submitted-result refinement at `src/core/audit-refinement.js:103`.

The `llms.txt` boundary is similarly strict. The LLM may provide descriptions keyed by paths, but it never assembles the file or invents URLs. `src/core/groq-analysis.js:75` instructs the model to use only extracted paths, `src/core/groq-analysis.js:117` validates that constraint, and `src/core/llms-txt.js:3` assembles the file from deduplicated real links. This line was drawn because a hallucinated URL in a machine-readable commerce file would be worse than no generated file at all.

The deterministic layer also removes recommendation noise. The prompt asks for recommendations only for `FAIL` or `UNCLEAR` identities, and `refineAuditWithScrapePayload` rebuilds recommendations against the refined submitted results (`src/core/audit-refinement.js:72`). That prevents passing claims from producing unnecessary fix cards after deterministic overrides have been applied.

## Failure Handling

Password-protected storefronts are treated as a first-class scrape failure. Playwright does not throw simply because Shopify shows a password page, so the scraper inspects the extracted page snapshot for password-wall language and throws `PASSWORD_PROTECTED` explicitly (`src/adapters/playwright-scraper.js:63` and `src/adapters/playwright-scraper.js:134`). The server maps that code to HTTP 403 (`src/server.js:180`).

Playwright navigation and auxiliary fetches use explicit timeouts. Homepage and product-page navigation each use 45 seconds (`src/adapters/playwright-scraper.js:56` and `src/adapters/playwright-scraper.js:73`), while `robots.txt` and `llms.txt` fetches use 10 seconds (`src/adapters/playwright-scraper.js:365`). Unexpected scraper errors are wrapped as `SCRAPE_FAILED` with the original message preserved in `details.cause` (`src/adapters/playwright-scraper.js:99`). Browser cleanup runs in a `finally` block and deliberately catches close errors, so Chromium is closed even if the scan fails after a response path has started (`src/adapters/playwright-scraper.js:102`).

Groq failures are wrapped separately as `LLM_ERROR`. Missing API keys, non-2xx Groq responses, and empty model content all produce structured errors from `src/adapters/groq-client.js` (`src/adapters/groq-client.js:12`, `src/adapters/groq-client.js:35`, and `src/adapters/groq-client.js:46`). The server maps both scrape and LLM failures to HTTP 502 so the frontend can display a clean failure message instead of hanging (`src/server.js:182`).

Malformed scan requests are handled before scraping. Invalid URLs, non-HTTPS URLs, missing identity arrays, and too many identities become `BAD_REQUEST` errors from `src/core/scan-service.js:48`. Malformed JSON bodies currently fall through the top-level server catch in `src/server.js:68`, which returns a structured `SERVER_ERROR`; this should be tightened to return `BAD_REQUEST` for `SyntaxError`.

## Known Limitations and Improvements

The current implementation does not include a server-side concurrency guard. The frontend disables the submit button during a scan, but two clients can still trigger simultaneous scans. For the demo environment, a single-process in-memory guard returning HTTP 429 `BUSY` would be a practical next improvement.

The current frontend does not use `AbortController` for a 45-second client-side timeout. Browser navigation has Playwright timeouts, but the client fetch can still wait for the server response. Adding a client abort would make failed scans feel cleaner and match the timeout behavior already present in the scraper.

Context trimming is also an area to improve. The pipeline preserves schema and evidence text, but it does not yet enforce a hard 5,000-token ceiling before sending content to Groq. The next version should keep JSON-LD and selected links intact while trimming noisy body text and untrimmed `robots.txt` content first.

Some storefront text noise remains despite DOM sanitization. The scraper removes common navigation, footer, cookie, script, style, iframe, and dialog content, but Shopify themes vary widely. More theme-aware extraction and stronger content ranking would reduce irrelevant text in the LLM payload.

MirrorShop is currently stateless. Each scan runs live and returns its result without persistence. That is appropriate for a hackathon demo, but a production version should store scan history, allow before-and-after comparisons, and record which storefront surfaces changed after each recommendation.
