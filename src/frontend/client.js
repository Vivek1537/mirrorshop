import { renderDashboard } from "./dashboard.js";

const form = document.querySelector("[data-scan-form]");
const resultRoot = document.querySelector("[data-result-root]");
const statusLine = document.querySelector("[data-status-line]");
const submitButton = document.querySelector("[data-submit-button]");

dedupeHeroPanels();

if (form && resultRoot && statusLine && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      url: String(formData.get("url") || "").trim(),
      identities: [
        String(formData.get("identity_1") || "").trim(),
        String(formData.get("identity_2") || "").trim(),
        String(formData.get("identity_3") || "").trim()
      ].filter(Boolean)
    };

    if (!payload.url || payload.identities.length === 0) {
      statusLine.textContent = "Enter a Shopify URL and at least one target identity.";
      statusLine.dataset.state = "error";
      return;
    }

    setBusyState(true);
    statusLine.textContent = "Scanning storefront, collecting evidence, and generating the audit...";
    statusLine.dataset.state = "loading";
    resultRoot.innerHTML = "";

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error?.message || "MirrorShop scan failed.");
      }

      resultRoot.innerHTML = renderDashboard({
        audit: result.data.audit,
        llmsTxt: result.data.llms_txt,
        scrape: result.data.scrape
      });

      statusLine.textContent = "Live audit complete.";
      statusLine.dataset.state = "success";
    } catch (error) {
      statusLine.textContent = error.message || "MirrorShop scan failed.";
      statusLine.dataset.state = "error";
    } finally {
      setBusyState(false);
    }
  });
}

function setBusyState(isBusy) {
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Scanning..." : "Run Audit";
}

function dedupeHeroPanels() {
  const heroPanels = document.querySelectorAll(".hero-panel");
  if (heroPanels.length <= 1) {
    return;
  }

  heroPanels.forEach((panel, index) => {
    if (index > 0) {
      panel.remove();
    }
  });
}
