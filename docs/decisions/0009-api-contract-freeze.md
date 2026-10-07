# 0009 — API contract freeze at the end of Phase 1

- **Status:** Accepted (takes effect at the owner's M9 sign-off)
- **Date:** 2026-10-06 (M9)
- **Decided by:** Owner, approving the M9 plan

## Decision

From the frontend sign-off, `.claude/skills/helpverified/references/api-contracts.md` is the contract the backend is built against. Changing a path, a request or response shape, an error code or an `allowed_actions` value requires a new ADR that names the screens and mock handlers affected, and updates `api-contracts.md`, the mock and its tests together.

Adding a field to a response is allowed without an ADR if the frontend ignores it until it's needed.

## Why

The frontend is finished against the mock. If the API drifts from the contract during B1–B6, B7 (integration) becomes a rewrite instead of a swap. The mock enforces the same rules and error envelopes as the contract, so the Playwright suite becomes the acceptance test for the real API in B7.
