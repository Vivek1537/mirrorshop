# Decision 0004: Expand the LLM contract around inferred versus submitted identities

Date: 2026-04-21

We considered a smaller response with only summary, submitted identity statuses, and `llms.txt`, but chose the expanded contract because the core product value is the comparison between merchant intent and AI-inferred storefront positioning.

The LLM must return inferred identities, submitted identity results, ranked recommendations, and short descriptions for real extracted paths only. It must not generate URLs.
