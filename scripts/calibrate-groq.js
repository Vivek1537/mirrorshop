import { readFile } from "node:fs/promises";
import { buildBlindInferenceCalibrationMessages, parseCalibrationJson } from "../src/core/calibration.js";

const args = parseArgs(process.argv.slice(2));
const rawFile = args["raw-file"];
const targets = (args.targets || "Luxury / Premium,Eco-Friendly Packaging,Fast 2-Day Shipping")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const model = args.model || "llama-3.3-70b-versatile";

if (!rawFile) {
  console.error("Usage: node scripts/calibrate-groq.js --raw-file path/to/raw.txt --targets \"Luxury / Premium,Eco-Friendly Packaging,Fast 2-Day Shipping\" [--dry-run]");
  process.exit(1);
}

const rawScrapedText = await readFile(rawFile, "utf8");
const messages = buildBlindInferenceCalibrationMessages({ targetIdentities: targets, rawScrapedText });

if (args["dry-run"]) {
  console.log(JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages }, null, 2));
  process.exit(0);
}

if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY is required. Re-run with --dry-run to inspect the exact prompt without calling Groq.");
  process.exit(1);
}

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages
  })
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Groq calibration failed with ${response.status}: ${text}`);
}

const data = await response.json();
const content = data.choices?.[0]?.message?.content || "";
const parsed = parseCalibrationJson(content, targets);
console.log(JSON.stringify(parsed, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
