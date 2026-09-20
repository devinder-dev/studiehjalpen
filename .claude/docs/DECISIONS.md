# Decisions

## 2026-09-17 — Studiehjälpen as the name
Product name over a generic one. RAG keyword lives in the repo description instead.
Alternative rejected: `rag-knowledge-assistant` — searchable but forgettable.

## 2026-09-17 — RAG, not live web browsing
Latency, token cost, auditability, and the fact that the engine's real purpose is
corpora that can't be browsed (handbooks, wikis, licensed data).
Alternative rejected: Claude + web search — fine for one-off questions, can't be
evaluated or scoped.

## 2026-09-17 — No RAG framework
Core pipeline is a few hundred lines. Owning it means debugging my retrieval, not
framework internals.
Alternative rejected: LangChain/LlamaIndex — faster start, no understanding.

## 2026-09-17 — pgvector over a dedicated vector DB
One database for relational, vector and full-text. Switch point: millions of vectors,
or vector search competing with OLTP load.
Alternative rejected: Pinecone/Qdrant — better at scale, unnecessary operational
overhead here.

## 2026-09-17 — voyage-4 at 1024 dimensions for embeddings
Ran the §9 spike: 20 real Swedish sentences (csn.se, forsakringskassan.se,
skatteverket.se, myh.se, sverigesakassor.se) against 16 queries (8 Swedish,
8 English). 15/16 top-1 correct; the one miss ranked two adjacent chunks about
the same topic (LIA) in the wrong order, not a real retrieval failure.
1024 dims balances quality against pgvector storage; voyage-4 supports 256/512/2048
too if that needs revisiting. Free tier: 200M tokens, well above corpus + eval needs.
Alternative rejected: voyage-multilingual-2 — dedicated multilingual model, only
needed as a fallback if voyage-4 had underperformed on Swedish. It didn't.
Script: `spikes/embedding-check.ts`.

## 2026-09-17 — heading_path is part of the full-text index
`content_tsv` indexes `heading_path || ' ' || content`, not content alone. The exact
terms this corpus is searched by — fribelopp, SGI, form numbers — often appear only
in the heading, so keyword search was blind to the queries hybrid search exists to
catch (PLAN.md §6).
Alternative rejected: indexing content alone — simpler, but it makes the keyword
half of hybrid retrieval much weaker on precisely the terms embeddings already blur.

## 2026-09-17 — Partial indexes everywhere superseded_at is involved
The HNSW vector index, the document_id index and the live-chunk unique index are all
partial on `superseded_at is null`. Retrieval always filters that way, and a full HNSW
index over dead vectors can return fewer than k live rows — a problem that compounds
with every re-crawl. Partial unique indexes also keep the supersede model working:
superseding a chunk frees its (document_id, chunk_index) position.
Alternative rejected: full indexes plus filtering at query time — simpler to write,
but silently degrades retrieval as superseded rows accumulate.

## 2026-09-17 — Chunk-level content hashing alongside document-level
`documents.content_hash` decides whether a re-crawl changed anything at all;
`chunks.content_hash` decides which individual chunks need new embeddings. Without
the second one, editing a single paragraph re-embeds the whole document.
The app owns the hash algorithm rather than a generated column, because the
comparison happens against candidate text that isn't in the database yet.

## 2026-09-20 — chunks.content stores clean body text, not the heading prefix
The `[Studiemedel > Fribelopp]` prefix is applied only to the string sent to the
embedding API. `content` holds body text and `heading_path` stays its own column.
`content_tsv` already indexes `heading_path || ' ' || content`, so baking the prefix
into `content` would count heading terms twice in `ts_rank` — skewing the keyword
half of hybrid search on exactly the exact-match terms it exists to catch. Citation
cards also want clean text, and the embedding still gets its heading context.
Alternative rejected: storing the prefixed string, as `spikes/embedding-check.ts`
did — one field instead of two, at the cost of double-weighted headings and prefix
markup leaking into every quoted citation.

## 2026-09-20 — Bun's SQL client runs with prepare: false
`DATABASE_URL` points at Supabase's transaction pooler (port 6543), which multiplexes
client sessions onto shared server connections. Bun's SQL client uses named prepared
statements by default, and those names survive on the server connection, so a second
run of the same query fails with `prepared statement "..." already exists`.
Alternative rejected: moving to the session pooler or a direct connection — the right
answer once there is a long-lived API process holding its own pool, and worth
revisiting in Phase 3. Until then the transaction pooler is fine with prepare off.

## 2026-09-20 — Bulk inserts pass rows as one jsonb parameter
`insert ... select from jsonb_to_recordset($1::jsonb)`. Bun's SQL client serialises a
JS array by joining it with commas, which Postgres rejects as a malformed array
literal, so `unnest($1::text[], ...)` does not work as written.
Alternative rejected: one statement per row — correct but a round trip each, which
matters over the network to Supabase and will matter far more in Phase 2 ingestion.
