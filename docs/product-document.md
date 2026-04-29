# MirrorShop Product Document

MirrorShop is an AI storefront visibility audit tool for Shopify merchants, built for Track 5 of the Kasparro Agentic Commerce Hackathon. This submission was developed solo by Vivek Boora, a third-year B.Tech Computer Science and Engineering student at BMS College of Engineering. The live demo is available at <https://mirrorshop-production.up.railway.app>.

## Problem

Shopify merchants increasingly depend on AI-mediated discovery, but they do not know how AI shopping agents perceive their storefronts. Systems such as ChatGPT, Gemini, and Perplexity do not evaluate a merchant's private Shopify Admin data when making product recommendations. They infer meaning from public, machine-visible surfaces: the rendered storefront DOM, JSON-LD schema, and files such as `llms.txt`.

This creates a visibility gap. A merchant may believe their store clearly communicates identities such as vegan, affordable, premium, sustainable, or fast shipping, while the storefront itself may expose incomplete, indirect, or contradictory evidence. When those signals are weak, AI agents may skip the store, recommend it for the wrong reason, or misstate what the merchant actually offers. The merchant currently has no direct way to inspect this gap before it affects discovery and recommendation quality.

The problem matters because AI shopping agents are becoming a new layer between customers and storefronts. Traditional SEO tools help merchants understand search crawlers and keyword rankings, but they do not answer whether an AI system can accurately infer the merchant's intended brand promises from the public storefront. MirrorShop treats that inference problem as a product surface in its own right.

## Target User

The target user is a Shopify merchant who wants better discoverability and more accurate representation inside AI shopping experiences. This merchant is not necessarily technical, but they care about how their store appears when a customer asks an AI assistant for product recommendations. Their current experience is mostly guesswork. They update product copy, theme content, metadata, and policy pages, then hope that AI systems interpret the store correctly.

The merchant's core question is simple: "What does AI think my store is about?" Today, answering that question requires manually inspecting page content, schema, and external agent behavior, then guessing which missing signals caused a weak recommendation. MirrorShop gives the merchant a direct audit of that perception layer and turns the result into concrete storefront fixes.

## Product

MirrorShop asks the merchant to enter a Shopify storefront URL and three core brand identities they want AI agents to recognize, such as "vegan," "affordable," or "next-day shipping." The tool then loads the storefront with a real headless browser, captures the rendered public surface, and runs a constrained AI visibility test against the merchant's stated intent.

The core journey is designed around comparison between intent and inference. First, the merchant states the identities they believe their store should communicate. Next, MirrorShop extracts what the storefront actually makes visible to an AI agent. The report then shows an AI perception summary, inferred identities, per-identity grades, evidence for each judgment, an action plan tied to exact Shopify surfaces, and a deterministic `llms.txt` file ready to paste into the storefront.

The product is not trying to score the store generically. Its main job is to reveal whether the merchant's intended positioning is legible to an AI shopping agent. That distinction shaped the report structure: every grade is connected to evidence, every recommendation is tied to a storefront surface the merchant controls, and the generated `llms.txt` output is treated as an implementation artifact rather than the product's main value.

## Scope Decisions

MirrorShop intentionally does not use the Shopify Admin API or OAuth. That integration would add significant setup complexity and account-authorization work, but it is not required for the diagnostic layer. AI shopping agents primarily evaluate public storefront content, so the first version focuses on the surfaces those agents can actually see.

The product also does not include an automatic product description rewriter. That feature would make MirrorShop feel like a generic LLM copywriting tool and dilute the sharper diagnostic purpose. The important problem is not producing nicer prose; it is identifying whether the existing storefront gives AI agents enough accurate evidence to understand the store.

Web search simulation through tools such as Tavily was also excluded from this version. The demo store does not have meaningful indexed external data, so web retrieval would test a different problem from the one MirrorShop is built to solve. The product focuses on public storefront interpretation because that is the controllable surface for the merchant.

Finally, MirrorShop avoids becoming a checklist scanner. Products such as ShopAudit and FoundGPT already cover broad checklist-style audits, and the hackathon brief explicitly discouraged shallow wrappers. MirrorShop is built around a more specific product insight: the mismatch between what a merchant wants AI agents to infer and what the storefront actually proves.

## Product Decisions

The most important product decision was separating submitted identities from inferred identities. The merchant's submitted identities represent intent, while the inferred identities represent what an AI agent can reasonably conclude from the storefront. The gap between the two is the core diagnostic output. This makes the audit more useful than a generic score because it directly explains where brand intent fails to become machine-visible evidence.

MirrorShop also introduces an `UNCLEAR` grade between `PASS` and `FAIL`. Many storefront claims are supported indirectly rather than explicitly. For example, a store may imply affordability through low prices, or sustainability through material language, without making the claim clear enough for reliable AI interpretation. Marking those cases as `FAIL` would be too harsh, while marking them as `PASS` would create false confidence. `UNCLEAR` gives merchants a more honest signal: there is some evidence, but not enough to trust the identity in an AI recommendation flow.

Another decision was to enforce conditional claim handling deterministically. A claim such as "free shipping over $75" should not pass an identity of "free shipping" without qualification. MirrorShop treats that as a failure for the broad claim because the condition materially changes the promise. This rule is enforced in code rather than left to model judgment, which keeps grading stable and prevents the report from overstating what the storefront supports.

The `llms.txt` output follows the same reliability principle. The language model may help write descriptions, but the file itself is assembled deterministically from extracted storefront data. The model never invents URLs. Code controls the links and structure, while the model contributes only where natural-language summarization is useful. This gives merchants an output that is both readable and grounded in real storefront evidence.

## Tradeoffs

The implementation uses Playwright and a real headless browser instead of a static parser such as Cheerio. This adds runtime weight, but it is necessary because many Shopify themes render key content through JavaScript. A static parser can return a skeletal DOM that misses the exact content an AI agent would evaluate. For this product, accuracy of the observed storefront matters more than the simplicity of the crawler.

Deployment also required an infrastructure tradeoff. Playwright with Chromium is large, roughly in the hundreds of megabytes, which does not fit cleanly within Vercel's serverless package constraints. MirrorShop therefore runs on Railway for the live demo instead of relying on Vercel serverless. That choice keeps the audit behavior faithful to the product requirement: render the storefront like a real browser and inspect the result.

For inference, the demo uses Groq with Llama 3 rather than OpenAI. The decision was driven by hackathon constraints: Groq provided low latency, a usable free tier, and fast iteration for live demos. This kept the product responsive enough for judges while preserving the central workflow of constrained AI perception testing.

## Conclusion

MirrorShop is a perception alignment tool for Shopify merchants entering the agentic commerce era. It does not try to be a generic SEO report, a copywriting assistant, or a checklist scanner. Its purpose is narrower and more valuable: show merchants what AI shopping agents can infer from their storefront, explain where that inference diverges from their intended brand identity, and provide concrete fixes tied to the surfaces they control.

MirrorShop was tested against five real public Shopify storefronts across different categories and claim types: Bombas, Allbirds, Beardbrand, Rebecca Minkoff, and Kylie Cosmetics. Testing revealed and fixed several grading edge cases, including conditional shipping claims, wrong-product `llms.txt` leakage, and soft positioning claims landing in the wrong tier. The strongest validated result: Bombas' "Free Shipping Over $75" correctly grades as `FAIL` for an unconditional "free shipping" identity.

By grounding the audit in rendered storefront evidence, deterministic claim rules, and structured `llms.txt` generation, MirrorShop gives merchants a practical way to debug AI discoverability before customers encounter the mismatch.
