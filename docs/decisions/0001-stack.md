# 0001 — Technology stack

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

The brief asks for a scalable, accessible, SEO-friendly site with role-based workspaces, a frontend-first build against mocks, and a backend that enforces data-integrity rules for identity verification and placements.

## Decision

- **Web:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, shadcn/ui primitives (Radix), TanStack Query, Zustand, React Hook Form + Zod, MSW, Motion. pnpm workspaces.
- **API:** FastAPI, Pydantic v2, SQLAlchemy 2.0 (async), Alembic, PostgreSQL 16, Redis. uv.
- **Services:** Cloudinary (media, authenticated documents), Paystack (NGN payments), Firestore (notification feed only).
- **Hosting:** Vercel (web); Render (API, Postgres, Redis); GitHub Actions CI.

## Consequences

- Static marketing pages and route-level metadata give good SEO and performance by default.
- Hard business rules live in PostgreSQL constraints and triggers, not just application code.
- Swapping any of these requires a new ADR.
- Next.js is pinned to 15.x even though newer majors exist; upgrading needs an ADR.
