import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createPlaywrightScraper } from "./adapters/playwright-scraper.js";
import { createGroqAnalyzer } from "./adapters/groq-client.js";
import { runScan } from "./core/scan-service.js";
import { resolveStoreName } from "./core/store-name.js";

const projectRoot = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const publicRoot = join(projectRoot, "public");
const srcRoot = join(projectRoot, "src");
const localBrowserPath = findLocalChromiumExecutable(projectRoot);

loadDotEnv(join(projectRoot, ".env"));

const scraper = createPlaywrightScraper({
  playwright: { chromium },
  browserOptions: localBrowserPath ? { executablePath: localBrowserPath } : {}
});
const groqAnalyzer = createGroqAnalyzer();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "POST" && url.pathname === "/api/scan") {
      const body = await readJsonBody(request);
      const result = await runScan(body, {
        scrapeStorefront: scraper,
        analyzeVisibility: groqAnalyzer,
        resolveStoreName: resolveStoreName
      });

      const status = result.ok ? 200 : statusFromErrorCode(result.error?.code);
      return sendJson(response, status, result);
    }

    if (request.method !== "GET") {
      return sendJson(response, 405, {
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Method not allowed."
        }
      });
    }

    if (url.pathname === "/") {
      return sendFile(response, join(publicRoot, "index.html"));
    }

    if (url.pathname === "/styles.css") {
      return sendFile(response, join(publicRoot, "styles.css"));
    }

    if (url.pathname.startsWith("/src/frontend/")) {
      const frontendPath = normalize(join(projectRoot, url.pathname.slice(1)));
      if (!frontendPath.startsWith(srcRoot)) {
        return sendNotFound(response);
      }
      return sendFile(response, frontendPath);
    }

    return sendNotFound(response);
  } catch (error) {
    console.error("[MirrorShop] Server error", error);
    return sendJson(response, 500, {
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: "MirrorShop server failed.",
        details: {
          cause: error?.message || String(error)
        }
      }
    });
  }
});

server.listen(port, host, () => {
  console.log(`MirrorShop listening on http://${host}:${port}`);
});

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function sendFile(response, filePath) {
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath)
    });
    response.end(body);
  } catch {
    sendNotFound(response);
  }
}

function sendNotFound(response) {
  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8"
  });
  response.end("Not found");
}

function contentTypeFor(filePath) {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function findLocalChromiumExecutable(root) {
  const browsersRoot = join(root, ".ms-playwright");
  if (!existsSync(browsersRoot)) {
    return null;
  }

  const headlessShell = readdirSync(browsersRoot)
    .filter((entry) => entry.startsWith("chromium_headless_shell-"))
    .sort()
    .at(-1);
  if (headlessShell) {
    const platformPath = platformRelativePath({
      linux: ["chrome-headless-shell-linux64", "chrome-headless-shell"],
      win32: ["chrome-headless-shell-win64", "chrome-headless-shell.exe"],
      darwin: ["chrome-headless-shell-mac", "chrome-headless-shell"]
    });
    if (platformPath) {
      const resolved = join(browsersRoot, headlessShell, ...platformPath);
      if (existsSync(resolved)) {
        return resolved;
      }
    }
  }

  const chromiumDir = readdirSync(browsersRoot)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .at(-1);
  if (chromiumDir) {
    const platformPath = platformRelativePath({
      linux: ["chrome-linux", "chrome"],
      win32: ["chrome-win", "chrome.exe"],
      darwin: ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"]
    });
    if (platformPath) {
      const resolved = join(browsersRoot, chromiumDir, ...platformPath);
      if (existsSync(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function platformRelativePath(pathsByPlatform) {
  return pathsByPlatform[process.platform] || null;
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const entries = readFileSync(filePath, "utf8").split(/\r?\n/);
  entries.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      return;
    }

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  });
}

function statusFromErrorCode(code) {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "PASSWORD_PROTECTED":
      return 403;
    case "LLM_ERROR":
    case "SCRAPE_FAILED":
    case "TIMEOUT":
      return 502;
    default:
      return 500;
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}
