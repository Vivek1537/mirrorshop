# Decision 0002: Generate llms.txt structure deterministically

Date: 2026-04-21

We considered letting the LLM generate the full `llms.txt` file, but chose deterministic assembly in code because URLs and file structure must not hallucinate.

The LLM may only return short descriptions keyed by real root-relative extracted paths. Code owns the H1, sections, links, URL normalization, and final file assembly.
