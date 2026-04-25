import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleLlmsTxt } from "../src/core/llms-txt.js";
import { renderPage } from "../src/frontend/dashboard.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = new URL("../test/fixtures/audit-result.json", import.meta.url);
const audit = JSON.parse(await readFile(fixturePath, "utf8"));
const extractedLinks = [
  { path: "/products/vitamin-c-serum", text: "Vitamin C Serum" },
  { path: "/policies/shipping-policy", text: "Shipping Policy" }
];
const llmsTxt = assembleLlmsTxt({
  storeName: "GlowJar",
  storeUrl: "https://glowjar.example",
  extractedLinks,
  descriptions: audit.llms_txt_descriptions
});
const html = renderPage({
  audit,
  llmsTxt,
  scrape: {
    source_coverage: audit.source_coverage
  }
});

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(`${root}/public/index.html`, html, "utf8");
console.log("Rendered public/index.html");
