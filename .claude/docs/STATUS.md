# Status

Current phase: 1 (Database + embedding validation)

## Done
- CLAUDE.md written, rules set
- Repo initialised, git attribution stripped at three layers
- README with architecture decisions
- Pushed to github.com/devinder-dev/studiehjalpen
- README.md filename fixed (was committed as `README:md`, never rendered on GitHub)
- GitHub repo topics set
- `.gitignore` no longer blanket-ignores `.claude/` — CLAUDE.md and docs/ are now tracked
- §9 embedding validation spike (`spikes/embedding-check.ts`): voyage-4 @ 1024 dims,
  15/16 top-1 on 20 Swedish chunks × 16 queries (8 SE, 8 EN). See DECISIONS.md.
- Supabase project created, pgvector enabled, `DATABASE_URL` in `.env`
- Minimal TS project (`package.json`, `tsconfig.json`, `@types/bun`) for the scripts
- dbmate installed; full §4 schema migration written and applied
  (`db/migrations/20260917095138_create_schema.sql`), verified live against Supabase
- CI: GitHub Actions typecheck on push/PR (lint deferred until there's app code)
- Schema review pass — 3 migrations now: heading_path folded into the full-text
  index, chunk-level content_hash, partial indexes on superseded_at, live-chunk
  and source_url uniqueness, FK indexes. Constraints verified against the live DB.

## In progress
- Phase 1 schema is live; nothing half-finished right now

## Next
- Phase 2: ingestion pipeline (PDF/MD extract → clean → heading-aware chunk → embed → store)
- Start on the Tier 1 corpus (CSN studiemedel/fribelopp/YH, FK föräldrapenning/VAB/SGI,
  Skatteverket enskild firma + jämkning)

## Known issues / open questions
- `conversations.user_id` has no FK yet — deferred until Phase 5's own auth (JWT +
  argon2id) creates a users table to reference
- Undecided: does `chunks.content` store clean body text with `heading_path` kept
  separate (what the schema assumes), or the `[Studiemedel > Fribelopp]` prefix baked
  in like the spike script did? If ingestion bakes it in, heading terms get counted
  twice in `content_tsv` ranking. Decide at the start of Phase 2.
- `message_sources.similarity_score` will hold an RRF fused score, not a cosine
  similarity — consider renaming to `score` before Phase 3 writes to it.
- CI does not verify migrations apply; would need a pgvector service container.
  Natural fit with the Testcontainers work already planned for Phase 2.