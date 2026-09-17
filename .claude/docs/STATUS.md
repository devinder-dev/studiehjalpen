# Status

Last worked: 2026-09-17
Current phase: 1 (Database + embedding validation) — nearly done, one item left

## How to run things

- `bun run db:migrate` — apply migrations. **Use this, not `dbmate up`**: dbmate
  re-dumps `schema.sql` with default args and reverts it to a 5300-line dump of
  Supabase's internal schemas. The wrapper keeps it to `public` only.
- `bun run db:rollback` — roll back one migration (same wrapper reason).
- `bun run typecheck` — what CI runs.
- `bun run spikes/embedding-check.ts` — Swedish embedding quality check (costs
  Voyage tokens, ~36 short inputs per run).
- `bun run spikes/db-check.ts` — connection, pgvector, tables, indexes.

`.env` holds `VOYAGE_API_KEY` and `DATABASE_URL` (gitignored).

## Done

- Repo, CLAUDE.md, README with architecture decisions, pushed to
  github.com/devinder-dev/studiehjalpen
- README.md filename fixed — was committed as `README:md`, so GitHub never
  rendered it. GitHub repo topics set.
- `.gitignore` no longer blanket-ignores `.claude/`, which had kept CLAUDE.md,
  PLAN.md, STATUS.md and DECISIONS.md out of version control entirely
- §9 embedding validation spike (`spikes/embedding-check.ts`): voyage-4 @ 1024
  dims, 15/16 top-1 on 20 Swedish chunks × 16 queries (8 SE, 8 EN)
- Supabase project live, pgvector 0.8.2, Postgres 17.6
- Minimal TS setup (`package.json`, `tsconfig.json`, `@types/bun`, `typescript`)
- CI: GitHub Actions typecheck on push/PR. Lint deliberately deferred until
  there is app code to lint.
- Schema: 3 migrations applied and verified against the live database
  1. full §4 schema
  2. `heading_path` folded into `content_tsv`
  3. chunk-level `content_hash`, partial indexes on `superseded_at`, live-chunk
     and `source_url` uniqueness, FK indexes

## Next — finish Phase 1

- **Throwaway vector-search script** (the one remaining Phase 1 deliverable from
  PLAN.md §8). Nothing has actually written a vector into pgvector and queried it
  yet — `embedding-check.ts` does cosine in memory, `db-check.ts` only inspects
  schema. So the HNSW index is unproven end to end. Script should: embed a handful
  of Swedish chunks, insert them, run `order by embedding <=> $1`, confirm sane
  results and that `explain` actually uses `chunks_embedding_idx`.
- Then tag `phase-1-done` per PLAN.md §8 and update the README status line.

## Then — Phase 2 (ingestion)

PDF/MD extract → clean → heading-aware chunk → embed → store. Status machine,
content-hash dedupe, chunker unit tests in CI. Ingest the Tier 1 corpus (CSN
studiemedel/fribelopp/YH, FK föräldrapenning/VAB/SGI, Skatteverket enskild firma
+ jämkning).

## Known issues / open questions

- **Decide first thing in Phase 2:** does `chunks.content` store clean body text
  with `heading_path` kept separate (what the schema assumes), or the
  `[Studiemedel > Fribelopp]` prefix baked in like the spike script did? If
  ingestion bakes it in, heading terms are counted twice in `content_tsv` ranking.
- `conversations.user_id` has no FK — deferred until Phase 5's own auth
  (JWT + argon2id) creates a users table to reference.
- `message_sources.similarity_score` will hold an RRF fused score, not a cosine
  similarity. Consider renaming to `score` before Phase 3 writes to it.
- CI does not verify migrations apply; needs a pgvector service container.
  Natural fit with the Testcontainers work already planned for Phase 2.
- No monorepo scaffold (`apps/api`, `apps/web`) despite PLAN.md §8 listing it
  under Phase 0. Deliberate — the build-order rule says create structure when a
  step needs it. Phase 3 is when the API layer earns its folder.
