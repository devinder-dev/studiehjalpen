# Status

Last worked: 2026-09-20
Current phase: 1 complete (tagged `phase-1-done`). Phase 2 (ingestion) is next.

## How to run things

- `bun run db:migrate` — apply migrations. **Use this, not `dbmate up`**: dbmate
  re-dumps `schema.sql` with default args and reverts it to a 5300-line dump of
  Supabase's internal schemas. The wrapper keeps it to `public` only.
- `bun run db:rollback` — roll back one migration (same wrapper reason).
- `bun run typecheck` — what CI runs.
- `bun run spikes/embedding-check.ts` — Swedish embedding quality, cosine in
  memory, no database (~36 Voyage inputs per run).
- `bun run spikes/db-check.ts` — connection, pgvector, tables, indexes.
- `bun run spikes/vector-search-check.ts` — full round trip: embed, insert,
  query pgvector, check the plan. Inserts two `SPIKE:` documents and deletes
  them again (~36 Voyage inputs per run).

`.env` holds `VOYAGE_API_KEY` and `DATABASE_URL` (gitignored).

## Done — Phase 1

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
- **Vector search proven end to end** (`spikes/vector-search-check.ts`): 20 real
  Swedish chunks plus 2000 random-vector filler rows inserted, queried through
  pgvector. Same 15/16 top-1 as the in-memory run, so storage and retrieval
  don't distort the ranking. `explain analyze` confirms
  `Index Scan using chunks_embedding_idx`, 1.3 ms against 2020 rows. Two negative
  controls in the same script fall back to a seq scan (~10 ms), which is the
  point of running them.

## Next — Phase 2 (ingestion)

Done: heading-aware chunker (`ingestion/chunk.ts`), tested in `ingestion/chunk.test.ts`
(13 tests) — structure → paragraph → sentence → hard-cut, table-safe, real token counts.

PDF/MD extract → clean → heading-aware chunk → embed → store. Status machine,
content-hash dedupe, chunker unit tests in CI. Ingest the Tier 1 corpus (CSN
studiemedel/fribelopp/YH, FK föräldrapenning/VAB/SGI, Skatteverket enskild firma
+ jämkning).

The chunking decision that was blocking this is now made and recorded: `content`
holds clean body text, `heading_path` stays separate, and the heading prefix is
applied only to the string sent to Voyage. `vector-search-check.ts` already
writes rows that shape.

**Do this before ingesting anything:** Voyage's free tier without a payment
method is 3 requests/min and 10K tokens/min — PLAN.md §9.3, discovered by
hitting it. The 200M free tokens still apply once a card is added, so adding one
costs nothing and removes the limit. The Tier 1 corpus at 3 RPM would otherwise
be a long evening. `vector-search-check.ts` has a 25 s backoff on 429 that Phase 2
should reuse rather than reinvent.

## Known issues / open questions

- `DATABASE_URL` uses Supabase's **transaction pooler (port 6543)**, where named
  prepared statements collide across runs. Spikes work around it with
  `new SQL(url, { prepare: false })`. Phase 3's long-lived API process should
  decide properly: session pooler or direct connection on 5432, versus keeping
  prepare off. See DECISIONS.md 2026-09-20.
- Resolved: `token_count` used a character-length estimate in the spike. PLAN.md
  §5's real tokenizer now exists as `ingestion/tokenize.ts` (vendored voyage-4
  tokenizer, offline BPE counting).
- `conversations.user_id` has no FK — deferred until Phase 5's own auth
  (JWT + argon2id) creates a users table to reference.
- `message_sources.similarity_score` will hold an RRF fused score, not a cosine
  similarity. Consider renaming to `score` before Phase 3 writes to it.
- CI does not verify migrations apply; needs a pgvector service container.
  Natural fit with the Testcontainers work already planned for Phase 2.
- No monorepo scaffold (`apps/api`, `apps/web`) despite PLAN.md §8 listing it
  under Phase 0. Deliberate — the build-order rule says create structure when a
  step needs it. Phase 3 is when the API layer earns its folder.
