export function renderDashboard({ audit, llmsTxt, scrape }) {
  return `
    <main class="mirror-shell">
      <section class="hero-panel">
        <p class="eyebrow">MirrorShop</p>
        <h1>AI Storefront Visibility Audit</h1>
        <p class="hero-copy">What an AI shopping agent could infer from your public storefront content.</p>
      </section>

      <section class="audit-section" data-section="ai-perception-summary">
        <div class="section-kicker">01 / Perception</div>
        <h2>AI Perception Summary</h2>
        <p>${escapeHtml(audit.summary)}</p>
      </section>

      <section class="audit-section comparison-grid" data-section="identity-comparison">
        <div>
          <div class="section-kicker">02A / Merchant Claims</div>
          <h2>Submitted Identities</h2>
          <div class="chip-stack">
            ${audit.submitted_results.map((item) => `<span class="claim-chip">${escapeHtml(item.label)}</span>`).join("")}
          </div>
        </div>
        <div>
          <div class="section-kicker">02B / AI-Inferred</div>
          <h2>Inferred Identities</h2>
          <div class="chip-stack inferred">
            ${audit.inferred_identities.map((item) => `<span class="claim-chip">${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
      </section>

      <section class="audit-section" data-section="evidence-per-identity">
        <div class="section-kicker">03 / Evidence</div>
        <h2>Evidence Per Submitted Identity</h2>
        <div class="evidence-list">
          ${audit.submitted_results.map(renderEvidenceCard).join("")}
        </div>
      </section>

      <section class="audit-section" data-section="action-plan">
        <div class="section-kicker">04 / Fixes</div>
        <h2>Action Plan</h2>
        <ol class="action-list">
          ${audit.recommendations.map(renderRecommendation).join("")}
        </ol>
      </section>

      <section class="audit-section" data-section="llms-txt-panel">
        <div class="section-kicker">05 / Artifact</div>
        <h2>Deterministic llms.txt</h2>
        <p class="artifact-copy">Curated to the highest-signal public storefront paths instead of a raw link dump.</p>
        <div class="artifact-frame">
          <div class="artifact-meta">Curated public storefront paths only</div>
          <pre class="artifact-code">${escapeHtml(llmsTxt)}</pre>
        </div>
      </section>

      <section class="source-strip" aria-label="Source coverage">
        ${Object.entries(scrape.source_coverage).map(([key, value]) => {
          return `<span class="${value ? "covered" : "missing"}">${escapeHtml(key.replaceAll("_", " "))}</span>`;
        }).join("")}
      </section>
    </main>
  `;
}

export function renderPage(model) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MirrorShop Audit</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  ${renderDashboard(model)}
</body>
</html>
`;
}

function renderEvidenceCard(item) {
  return `
    <article class="evidence-card ${item.status.toLowerCase()}">
      <div class="card-topline">
        <h3>${escapeHtml(item.label)}</h3>
        <span>${escapeHtml(item.status)}</span>
      </div>
      <p>${escapeHtml(item.evidence)}</p>
    </article>
  `;
}

function renderRecommendation(item) {
  return `
    <li>
      <strong>${escapeHtml(item.issue)}</strong>
      <span class="action-surface">${escapeHtml(item.surface || "product description")}</span>
      <span>${escapeHtml(item.fix)}</span>
    </li>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
