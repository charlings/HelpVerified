# 0018 — Bun replaces pnpm as the JavaScript package manager

- **Status:** Accepted
- **Date:** 2026-10-22 (pre-B7)
- **Decided by:** Owner (switch to Bun and record it in an ADR, 2026-10-22). Claude Code (the details below).
- **Amends:** ADR 0001 (stack). Bun is only the package manager and script runner. Node 24 (`.nvmrc`) still runs Next.js, Vitest, Playwright and the `tsx` scripts. uv for Python is unchanged.

## Decisions

1. **Bun 1.4.0, pinned** in the root `package.json` (`packageManager: bun@1.4.0`). CI reads the version from there (`oven-sh/setup-bun`, `bun-version-file`). Bun installs per user, so it needs no admin rights on the owner's machine.
2. **Workspaces move into `package.json`** (`workspaces: ["apps/*", "packages/*"]`). `pnpm-workspace.yaml` is removed. Its `allowBuilds` list (esbuild, sharp, unrs-resolver) becomes `trustedDependencies`, so only those packages may run install scripts.
3. **`bun.lock` was migrated from `pnpm-lock.yaml`, not resolved afresh.** Every version stays as it was under pnpm (checked: next 15.5.27, vitest 5.0.3, msw 3.0.2, @playwright/test 1.63.0, typescript 5.9.3). CI installs with `bun install --frozen-lockfile`.
4. **`bunfig.toml` keeps pnpm's default public hoisting** (`*eslint*`, `*prettier*`). `eslint-config-next` loads its plugins (for example `eslint-plugin-react-hooks`) from `apps/web`, which only works if they sit in the root `node_modules`. Without the setting, lint fails.
5. **Scripts always run through `bun run <script>`** (or `bun --filter web <script>` from the root), and binaries through `bunx`. `bun build` and `bun test` are Bun's own bundler and test runner, not this repo's scripts.
6. **`bun audit --audit-level=high`** replaces `pnpm audit --audit-level high` in the CI security job.

## Consequences

- Updated: CI (`.github/workflows/ci.yml`), root `package.json`, the Playwright web server command, the Lighthouse script, and the commands in CLAUDE.md, README, the project skill and current docs. Historical ADRs, specs and changelog entries still say pnpm, because they describe what was run at the time.
- `bun --filter` prefixes each output line with the package name. The bundle-budget check needs `next build`'s raw table, so it reads a build run inside `apps/web` (as CI does).
- Vercel (B8) picks the package manager from `bun.lock`. Confirm the install command when the project is created.
- Not yet verified: a green CI run on GitHub with Bun (owner input #7).
- Rollback: restore `pnpm-lock.yaml` and `pnpm-workspace.yaml` from git, revert this ADR's file changes, and run `pnpm install`.
