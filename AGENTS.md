# Development

- Read README.md and docs/upstream-and-costs.md before changing the analysis pipeline.
- Work on feature branches. Do not merge into main, deploy, create paid resources, or connect order execution without explicit user instructions.
- Keep provider keys and the service token server-only. Never use VITE_* for credentials or commit .env/.state.
- Reuse the pinned upstream agents; do not replace them with simulated output. Synthetic providers belong in tests only.
- Distinguish missing evidence and API failures from neutral investment opinions. Never label model confidence as price appreciation probability.
- Run npm run build, npm run typecheck:functions, npm run lint, npm test, and .venv/bin/python -m pytest tests -q after relevant changes.
- The current backend supports exactly one process/worker. Do not increase workers without implementing distributed cost/concurrency control.
