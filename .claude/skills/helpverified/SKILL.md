---
name: helpverified
description: Project playbook for HelpVerified, the platform where families hire agency-vetted nannies, drivers and cleaners (Next.js frontend, FastAPI backend, PostgreSQL, Redis, Firestore, Cloudinary, Paystack). Use this skill for ANY work in the HelpVerified repo or on HelpVerified features, including scaffolding, pages, components, design tokens, auth screens, worker verification, requests, proposals, placements, replacements, payments, database schema or migrations, API endpoints, tests, docs and deployment, even when the user names only a file, a bug, a milestone (M1–M9, B1–B8) or a feature without saying "HelpVerified".
---

# HelpVerified project skill

HelpVerified connects Nigerian families with domestic staff (nannies, drivers, cleaners) who have been vetted by registered agencies. An agency may only list a worker after all four verification items are done: **ID, guarantor, references, address**. A family posts a request, agencies propose workers, the family accepts one, and a placement runs **Trial → Confirmed → Ended**. A family can request a replacement. Agencies pay a monthly subscription; families pay a placement fee.

Everything in this repo serves two promises to families. Read them before changing anything that touches workers or placements:

1. **A worker is never listed unless all four checklist items are verified and unexpired.**
2. **A worker is never in two active placements at once.**

Both are enforced in PostgreSQL and in one backend service each. The UI reflects them but never relies on them. If a change would let either promise be broken by a race, a direct DB update, a stale client or a forgotten code path, stop and redesign.

## Where to look

Read only what the task needs. Each reference is self-contained.

| Task touches | Read |
| --- | --- |
| Pages, components, routing, forms, state, mocks, animation, a11y | `references/frontend.md` |
| Colours, fonts, spacing, logo, images, login and services page look | `references/design-system.md` |
| FastAPI modules, services, auth, jobs, integrations, errors | `references/backend.md` |
| Tables, enums, constraints, triggers, migrations, the hard rules in SQL | `references/database.md` |
| Endpoints, request/response shapes, error codes, frontend–backend contract | `references/api-contracts.md` |
| ID documents, NDPA, Cloudinary privacy, Paystack, secrets, rate limits | `references/security-and-compliance.md` |
| Tests, QA checklists, milestones and their acceptance criteria | `references/testing-and-milestones.md` |

## Stack (decided; do not swap without an ADR)

- **Monorepo:** `apps/web` (Next.js 15 App Router, TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, MSW, Motion), `apps/api` (FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic), `packages/contracts` (OpenAPI-generated types). Bun workspaces for JS, uv for Python.
- **Data:** PostgreSQL 16 (source of truth), Redis (rate limits, cache, job locks), Firestore (notification feed only, never authoritative).
- **Media:** Cloudinary. Worker photos public; verification documents `type: authenticated`, served only via short-lived signed URLs.
- **Payments:** Paystack (NGN, amounts in kobo).
- **Deploy:** Vercel (web), Render (API, Postgres, Redis), GitHub Actions CI.

## Repository map

```
helpverified/
├── apps/web/src/
│   ├── app/            # routing only: (marketing) (auth) (app)/family|agency|admin
│   ├── config/         # routes.ts, nav.ts, site.ts, env.ts
│   ├── styles/         # tokens.css (ONLY place for design values), globals.css
│   ├── assets/         # brand/, images/ (+ index.ts asset map), icons/
│   ├── components/     # ui/ layout/ navigation/ forms/ feedback/ animation/
│   ├── features/       # auth marketing requests proposals placements workers verification agencies billing notifications
│   ├── content/        # typed marketing copy
│   ├── lib/            # api-client.ts, query-client.ts, format.ts, cn.ts
│   ├── mocks/          # MSW handlers + fixtures
│   └── types/
├── apps/api/app/
│   ├── core/           # config, security, errors, logging, rate_limit, deps
│   ├── db/             # session, base, migrations/
│   ├── modules/        # auth agencies families workers verification requests proposals placements payments notifications admin
│   ├── integrations/   # cloudinary, paystack, firestore, email
│   └── jobs/
├── packages/contracts/
├── docs/               # architecture, decisions/ (ADRs), route-map, design-tokens, api-contracts, database, placeholders, CHANGELOG
├── docker-compose.yml
└── .env.example
```

## Working rules

These come from the project owner. They exist so that one broken feature can be fixed without disturbing the others, and so the code can be explained line by line in a viva.

1. **Plan before code.** For any task larger than a small fix, state the objective, the files you expect to create or change and why, then implement. Do not write large amounts of code before the plan is clear.
2. **Explain before modifying.** Before editing an existing file, say in one line why it must change. Do not touch unrelated files when fixing a bug.
3. **Respect module boundaries.**
   - Frontend: a feature imports from `components/`, `lib/`, `config/`, `types/` and other features' `index.ts` only. `app/` route files stay thin (render a feature screen, set metadata) and never call `fetch`.
   - Backend: routers parse and respond; services hold business rules; repositories hold queries. No SQL in routers, no HTTP concepts in services.
4. **No hardcoded values.** Colours, sizes, radii, motion live in `styles/tokens.css`. Routes come from `config/routes.ts`. Images come from the asset map. Prices, trial length, fees and limits come from config or the database. Secrets come from environment variables listed in `.env.example`.
5. **One source per rule.** Status labels, colours and allowed actions for each domain live in one place: transitions and allowed actions in `features/placements/state-machine.ts` (mirrored by `modules/placements/state_machine.py`), labels and colours in each feature's `status.ts`. Never re-derive them in a component.
6. **Every data view has loading, empty and error states.** Every form has field-level and form-level errors.
7. **Accessibility is part of done:** semantic HTML, visible labels, keyboard operable, visible focus, contrast ≥ 4.5:1 for text, `prefers-reduced-motion` respected.
8. **Test as you go.** After each meaningful step run the relevant checks: `bun run lint && bun run typecheck && bun run test` (web), `uv run ruff check && uv run mypy app && uv run pytest` (api). For the hard rules, write the failing test first.
9. **Do not over-engineer.** Add an abstraction only when a second real use exists.
10. **Preserve behaviour.** Refactors must not change what users see unless the task says so.
11. **Surface ambiguity.** If a requirement is unclear, name it, recommend a default, and record it in `docs/decisions/` or the milestone report. Never decide product rules silently.
12. **Keep the changelog.** Every milestone or significant change adds an entry to `docs/CHANGELOG.md`.

## Domain glossary

| Term | Meaning |
| --- | --- |
| Agency | Registered business that recruits and vets workers. Must be approved by a Super Admin and have an active subscription to list workers or propose. |
| Family | Household hiring a worker. One user account per family in v1. |
| Worker | A nanny, driver or cleaner record owned by one agency. No login in v1. Identified across the platform by a hash of their NIN. |
| Verification item | One of `id`, `guarantor`, `references`, `address`, each with evidence documents and a status. |
| Listed | Visible to proposal flows. Only possible when all four items are `verified` and unexpired. |
| Request | A family's need: role, schedule, live-in, area, budget, start date, trial length. |
| Proposal | An agency offering one listed worker for one request. |
| Placement | A worker working for a family. States: `pending_payment` (short hold while the fee is paid), `trial`, `confirmed`, `ended`, `cancelled`. |
| Active placement | `pending_payment`, `trial` or `confirmed`. At most one per worker. |
| Replacement | Family asks for a different worker; the current placement ends with reason `replaced` and a linked new request opens. |

## Business defaults

Defaults chosen during planning. They live in config so the owner can change them; if the owner states a different rule, update config, the ADR and the tests together.

| Setting | Default | Config key |
| --- | --- | --- |
| Trial length | 14 days, editable per request (7–30) | `TRIAL_DAYS_DEFAULT` |
| Replacement window | During trial and 30 days after confirmation | `REPLACEMENT_WINDOW_DAYS` |
| Free replacements | 1 per placement fee | `FREE_REPLACEMENTS` |
| Placement fee timing | Charged when the family accepts a proposal | `FEE_CHARGED_AT=accept` |
| Payment hold | Unpaid `pending_payment` placements cancelled after 30 min | `PAYMENT_HOLD_MINUTES` |
| Verification validity | References and address 12 months; ID and guarantor until rejected | `VERIFICATION_TTL_*` |
| Roles | `super_admin`, `agency_admin`, `family` | — |

If `FEE_CHARGED_AT` becomes `confirm`, accepting a proposal goes straight to `trial` and `pending_payment` is not used. See `references/database.md`.

## Milestone report format

End every milestone (and any substantial task) with this report, also appended to `docs/CHANGELOG.md`:

```
## <Milestone id> — <title> (<date>)
1. Objective
2. Files created
3. Files modified (with one-line reason each)
4. Key decisions (link ADRs)
5. Tests and checks run, with results
6. Known issues
7. Assumptions
8. Acceptance criteria: met / not met per item
9. Recommended next step
```

## Definition of done (any change)

- Lint, type check, unit tests and build pass for every app touched.
- New UI has loading, empty and error states and passes an axe scan.
- New endpoints are in OpenAPI with examples, have auth and role tests, and return the standard error envelope.
- Schema changes ship as an Alembic migration with a working downgrade.
- No secrets, raw hex values, hardcoded routes or raw image paths added outside their homes.
- Docs and changelog updated.
