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

## In progress
- Phase 1 schema is live; nothing half-finished right now

## Next
- Phase 2: ingestion pipeline (PDF/MD extract → clean → heading-aware chunk → embed → store)
- Start on the Tier 1 corpus (CSN studiemedel/fribelopp/YH, FK föräldrapenning/VAB/SGI,
  Skatteverket enskild firma + jämkning)

## Known issues / open questions
- `conversations.user_id` has no FK yet — deferred until Phase 5's own auth (JWT +
  argon2id) creates a users table to reference