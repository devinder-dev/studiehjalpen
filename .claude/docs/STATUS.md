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

## In progress
- Phase 1: embedding model chosen, schema/migration not written yet

## Next
- Create Supabase project, enable pgvector
- Write dbmate migration for full §4 schema (documents, chunks, facts, conversations,
  messages, message_sources, query_traces) with embedding vector(1024)
- HNSW + GIN indexes

## Known issues / open questions
- None currently blocking