# 0002 — Keep original photos out of git

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

The supplied photos (`Photo1–3.jpg`) are 6600–8000 px wide and 14–25 MB each. Committing them would bloat every clone, and they are temporary until licences are confirmed.

## Decision

- Originals stay in `specs/frontend/brandfiles/`, git-ignored (`*.jpg`).
- `pnpm --filter web images` produces 640/1024/1600/2400 px AVIF, WebP and JPEG variants in `apps/web/public/images/`. These are committed. The script fails if a 1600 px variant exceeds 300 KB.
- The source logo PNG (small) is committed. `pnpm --filter web brand` derives the transparent logo, the mark and the favicons from it.

## Consequences

- A contributor without the originals can still build and run the site.
- Regenerating variants requires obtaining the originals from the owner.
- Alternative considered: Git LFS. Rejected for now because it adds hosting setup for files that will be replaced.
