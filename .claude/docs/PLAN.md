# Studiehjälpen — Master Plan v3

*Supersedes RAG_Project_Plan.md, RAG_Build_Plan_Phases.md, Studiehjalpen_Concept_Corpus.md and Studiehjalpen_Plan_Review_v2.md. Drop this into the repo as `docs/PLAN.md` at Phase 0.*

Last updated: 17 September 2026 · Target demo: 4 November 2026 (course oral presentation)

---

## 1. Product

**Studiehjälpen** — an AI assistant that answers questions about Swedish student and worker bureaucracy (CSN, Försäkringskassan, A-kassa, Skatteverket, YH/LIA), grounded in official documents, with visible source citations and freshness dates.

The corpus is the demo; **the engine is the product**. The same system runs unchanged on a company handbook, an internal wiki or a contract archive.

**The story:**
> "When I moved from India to Sweden and later combined YH studies with parental leave and freelance income, I spent hours cross-referencing CSN, Försäkringskassan and Skatteverket pages that all affect each other but never link the answers together. So I built the tool I needed."

---

## 2. Architecture

Three loops, not two:

**A. Ingestion (offline)** — source → extract → clean → heading-aware chunk → embed → store vector + tsvector
**B. Query (online)** — question → contextualize → embed → hybrid retrieve (vector + keyword, fused) → threshold check → prompt assembly → Claude streaming → persist answer + citations + trace
**C. Freshness (scheduled)** — cron → re-fetch → content hash compare → skip unchanged / re-embed and supersede changed

Loop C is what makes this a system rather than a demo.

### Stack

| Layer | Choice | Notes |
|---|---|---|
| API | Bun + Fastify + GraphQL Yoga | Layered: routes → resolvers → services → repositories → db (same mold as Hälsogruppen) |
| DB | Supabase PostgreSQL + pgvector | One DB for relational, vector **and** full-text search |
| Embeddings | Voyage AI (multilingual) | **Verify dimension and Swedish quality before the migration** — see §9 |
| Generation | Anthropic Claude, streaming | Haiku for query contextualization, Sonnet for answers |
| Frontend | Next.js + Tailwind | Chat, document library, pipeline inspector |
| Web ingestion | Firecrawl | Returns markdown with headings intact |
| Migrations | dbmate | DDL only; runtime client for DML |
| Tests | Bun test + Testcontainers | Postgres+pgvector container for integration tests |

**No LangChain, no LlamaIndex, no external vector DB.** Every step hand-built and owned.

---

## 3. Corpus

**Tier 1 (must have):** CSN studiemedel + fribelopp + YH pages · FK föräldrapenning, VAB, SGI · Skatteverket enskild firma basics + jämkning
**Tier 2:** A-kassa eligibility after studies · MYH YH/LIA regulations · 2–3 official PDF brochures (so both ingestion paths are demoed) · optionally Migrationsverket basics

Target 15–25 focused documents. One topic page = one document. Store canonical URL + anchor for deep-linked citations. Public sources only — nothing behind a login.

---

## 4. Data model

```
documents ──< chunks ──< message_sources >── messages >── conversations
facts (standalone)        query_traces (standalone)
```

**documents** — id, title, source_type ('upload'|'web'), source_url, status ('pending'|'processing'|'ready'|'failed'), error, **content_hash**, **fetched_at**, **last_checked_at**, created_at

**chunks** — id, document_id FK cascade, content, **heading_path**, chunk_index, token_count, embedding `vector(N)`, **content_tsv** `tsvector`, **superseded_at** (nullable), created_at

**facts** — key, value, unit, **applies_to_year**, source_url, verified_at
*The volatile-numbers table: fribelopp, prisbasbelopp, taknivåer, per-day caps. ~15–20 rows, injected into every prompt. See §7.*

**conversations** — id, user_id, title, created_at
**messages** — id, conversation_id FK, role, content, created_at
**message_sources** — message_id FK, chunk_id FK, similarity_score, retrieval_method ('vector'|'keyword'|'both')

**query_traces** — id, conversation_id, original_query, rewritten_query, retrieved_chunk_ids, scores, threshold_triggered, model, input_tokens, output_tokens, estimated_cost, latency_ms per stage, created_at

### Indexes
```sql
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (content_tsv);
create index on chunks (document_id) where superseded_at is null;
```

Default retrieval filters `superseded_at is null`. Superseding instead of deleting keeps "what was the fribelopp in 2026?" answerable later.

---

## 5. Chunking

- Split on markdown structure first (`##`/`###`), then paragraphs, then sentences, then hard cut. Never split mid-table-row.
- ~500 tokens target; **600–700 for Swedish** (compound words tokenize ~1.3–1.5x heavier). Count with a real tokenizer, never by character length.
- ~60 token overlap at paragraph/sentence cuts only — separate headings don't need to bleed.
- **Prepend `heading_path` to the text before embedding**: `[Studiemedel > Fribelopp] Beloppet är…`. Without it, a chunk saying "beloppet är X kr" is semantically orphaned and retrieval collapses.
- Store `heading_path` separately too, for citation display.
- Content-hash chunks to skip re-embedding unchanged ones on re-crawl.

*Phase 6 experiment:* Anthropic's **contextual retrieval** (LLM-generated situating sentence prepended per chunk, made cheap by prompt caching) vs. the heading-prefix approach.

---

## 6. Retrieval

1. **Contextualize** — if the conversation has history, a Haiku call rewrites the follow-up into a standalone query. *Without this, multi-turn chat silently breaks retrieval: "Och om jag jobbar extra?" embeds as meaningless text.* Log both queries.
2. **Hybrid search** — run in parallel:
   - Vector: cosine similarity over `embedding`
   - Keyword: `to_tsvector('swedish', content)` matched against the query
   - Fuse with **Reciprocal Rank Fusion**: `score = Σ 1/(60 + rank)`
   *Keyword search is essential here — embeddings blur exactly the things this corpus is made of: `SGI`, `fribelopp`, `blankett 5456`, `§ 12`, kronor amounts.*
3. **Threshold check** — below the cutoff (start ~0.65, tune on the golden set), refuse rather than answer. This is a product feature, not a technicality: wrong bureaucracy answers have real consequences.
4. **Rerank** *(optional, Phase 6)* — Voyage rerank over the top ~20 fused candidates.
5. **Assemble prompt** — system instructions + current-year `facts` block + numbered chunks with heading paths and `fetched_at` + conversation history + question.
6. **Generate** — Claude streaming; persist message, `message_sources`, and the full `query_trace`.

---

## 7. Freshness — the invalidation strategy

*Your index is a cache of the truth, and every cache needs an invalidation strategy.*

**Split the corpus by rate of change:**
- **Stable prose** (how föräldrapenning works, what SGI means) → vector index
- **Volatile numbers** (fribelopp, prisbasbelopp, taknivåer) → the `facts` table, injected into every prompt

A stale chunk can then never override an authoritative current figure, and updating for 2027 means editing ~15 rows, not re-crawling everything.

**Scheduled re-crawl:** weekly, plus a full crawl every January (prisbasbelopp and most amounts change 1 Jan). Re-fetch → hash → unchanged means skip (zero embedding cost) → changed means re-chunk, re-embed, and supersede old chunks atomically in one transaction.

**Surface it, don't hide it:** every citation card shows "Hämtad YYYY-MM-DD". The prompt receives today's date and each chunk's `fetched_at`, with the instruction: *if the question concerns an amount or an annually-changing rule and the source predates the current year, say so explicitly and link the official page.*

**Position honestly:** this is not an authority, it's a *transparent* system — it shows where every claim came from and when. The disclaimer isn't legal cover, it's an accurate description of the product:

> *"Studiehjälpen sammanfattar offentlig information och är inte juridisk eller ekonomisk rådgivning. Kontrollera alltid med den ansvariga myndigheten."*

**Consequence:** the eval golden set goes stale too. Tag every numeric expected-answer with `applies_to_year` and re-verify after each January crawl — otherwise you'll "fix" a pipeline that was right all along.

---

## 8. Phases

| Phase | Content | Evenings |
|---|---|---|
| **0** | Repo, monorepo scaffold, `CLAUDE.md`, CI (lint+typecheck), README with diagrams, `docs/DECISIONS.md` seeded | 1 |
| **1** | dbmate migrations (full §4 schema incl. tsvector, facts, query_traces, superseded_at), pgvector + GIN indexes, embedding-model validation spike (§9), throwaway vector-search script | 3 |
| **2** | Ingestion: PDF/MD extract → clean → heading-aware chunk → embed → store. Status machine, content-hash dedupe. Chunker unit tests in CI. Ingest Tier 1 corpus | 4–5 |
| **3** | Query pipeline: contextualization → **hybrid search + RRF** → threshold → prompt assembly (incl. facts block) → Claude streaming → persist message, sources, **query_trace**. GraphQL schema + codegen | 5–6 |
| **4** | Frontend: chat with streaming, citation cards with `fetched_at`, document library, **pipeline inspector** (rewritten query, both rankings, fused result, threshold decision, tokens/cost/latency) | 3–4 |
| **5** | Firecrawl web ingestion, **scheduled re-crawl job (§7)**, auth (JWT + argon2id), prompt-injection defense, rate limiting, **MCP server**, Dockerfile + compose | 4–5 |
| **6** | Golden set (25 q, year-tagged), eval harness, **four experiments** (§10), prompt caching, README + demo script, CV update | 4 |
| **7** *(stretch)* | Agentic retrieval mode (Claude decides when/what to search, multi-hop) as a toggle, with eval comparison against classic mode | 3 |

~24–29 sessions. Protect Phases 3 and 6 above all — retrieval quality and measurement are what make this engineering rather than a demo. If a phase overruns 1.5x, cut its optional parts; never extend.

**Anti-scope-creep:** ideas from later phases go to `IDEAS.md`. Each phase ends with a `phase-N-done` tag and a README status update.

---

## 9. Verify before writing the migration

1. **Embedding dimension** — read Voyage's current docs for the exact model you choose. It's baked into the schema; changing it means re-embedding everything. Note whether it supports variable dimensions.
2. **Swedish quality spike (half an evening, high value)** — embed 20 Swedish chunks, run 5 Swedish + 5 English queries, check the right chunks come back. If weak, test the dedicated multilingual model. *"I validated the embedding model on my actual language before committing"* is a strong interview line.
3. **Voyage free-tier limits** against corpus size + repeated eval runs.
4. **GraphQL subscriptions over SSE** — 30-minute spike in Phase 3; fall back to plain SSE without guilt.

---

## 10. Evaluation

**Golden set:** 25 questions from your own corpus — including 3 refusal cases (off-corpus), 3 bilingual cases (English question, Swedish source), and 5 cross-document cases. Numeric answers tagged with `applies_to_year`.

**Metrics:** retrieval hit rate and recall@k (did the right chunk surface?), then LLM-as-judge faithfulness (1–5, is the answer supported by the retrieved context?). Report both separately — most RAG failures are retrieval failures wearing a generation costume.

**Four experiments, each committed as a dated report:**
1. **Hybrid vs pure vector** — expect the biggest delta
2. **Chunk size** 500 vs 700 (Swedish token weight)
3. **With/without reranking**
4. **Your pipeline vs a plain "Claude + web search" baseline** on the same golden set, measuring accuracy, latency and token cost

Experiment 4 is the one to lead with. Either you beat the baseline, or you don't on *public* data and you explain precisely why and where you would — the second answer is rarer and better.

---

## 11. Decisions log — seed entries for `docs/DECISIONS.md`

Write these on day one, dated, each with the alternative you rejected:

1. **Why RAG instead of letting Claude browse the sites live?** Latency (~50ms vs seconds), token cost (2k targeted vs whole pages), cross-source questions without knowing site structure, auditability (you log which chunk produced which claim and can run evals), determinism. And decisively: the engine's purpose is corpora Claude *cannot* browse — handbooks, wikis, contracts, licensed data. Production systems do both; they solve different problems.
2. **Why pgvector over Pinecone/Qdrant?** One database at this scale. Know the switch point: millions of vectors, or vector search competing with OLTP load.
3. **Why no LangChain?** The core is a few hundred lines. Owning every step means debugging retrieval quality, not framework internals.
4. **Why hybrid over pure vector?** Corpus is dense with exact terms and numbers; measured on the golden set.
5. **Why a separate facts table?** Rate-of-change separation — annual numbers shouldn't require re-crawling stable prose, and stale chunks must not override current figures.

A decision log written *as you go* is very hard to fake, and it's the artifact that separates an engineer from someone following a tutorial.

---

## 12. Course coverage

| Module | Covered by | Effort |
|---|---|---|
| AI / agents / RAG | The project + Phase 7 agentic mode | core |
| Testing | Chunker unit tests, Testcontainers integration tests, evals in CI | +1 |
| DevOps / CI-CD | Actions: lint, typecheck, test, eval report artifact | planned |
| Containerization | Dockerfile per app + compose (api, web, pgvector) | +1 |
| Kubernetes / IaC | Deploy compose stack to k3s, or Terraform the infra — **only if an assignment demands a deliverable** | +2–3 |
| System design | Ingestion as a queue-backed worker (BullMQ/Redis, from the QA course) — **only if an assignment demands it** | +2 |

---

## 13. Deliberately out of scope

Say these as conscious decisions, don't build them: GraphRAG / knowledge graphs · fine-tuning · dedicated vector DB · multi-tenancy beyond per-user ownership · streaming citation highlighting.