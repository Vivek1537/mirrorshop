# Decision 0008: Calibrate Blind Inference before live backend wiring

Date: 2026-04-21

We considered going straight from prompt design to backend integration, but chose a manual Blind Inference calibration gate first because the product succeeds only if the model is objective, evidence-grounded, and willing to fail missing merchant claims.

The calibration prompt uses a smaller schema than the production audit contract so failures are easier to inspect: inferred identities, intent gaps, and action plan. Once calibrated, the same phase rules are carried into the production Groq prompt.
