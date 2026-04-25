# Decision 0006: Make the dashboard comparison-led

Date: 2026-04-21

We considered a simple two-column dashboard with summary and gaps, but chose five sections because the demo needs to show the whole audit loop: AI perception, merchant intent, inferred identity contrast, evidence, fixes, and the deterministic `llms.txt` artifact.

The first frontend slice is dependency-free HTML rendering so the product shape can be verified before choosing the final Next.js component structure.
