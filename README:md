# Studiehjälpen

A RAG (Retrieval-Augmented Generation) assistant that answers questions about Swedish student and worker bureaucracy — CSN, Försäkringskassan, A-kassa, Skatteverket and YH/LIA rules — grounded in official documents, with the source shown for every answer.

**Status:** in development. Phase 0 of 6.

---

## Why I built this

I moved to Sweden in 2019 and later combined YH studies with parental leave and freelance income. Working out what that meant in practice took hours of cross-referencing CSN, Försäkringskassan and Skatteverket pages that all affect each other but never link the answers together.

An ordinary chatbot is the wrong tool for this. It will answer confidently from half-remembered training data, and wrong answers about benefits have real consequences. So the design goal here is not a clever assistant — it's a **transparent** one. Every answer shows which document it came from and when that document was fetched, and the system refuses to answer when it doesn't have a good enough source.

The Swedish bureaucracy corpus is the demo. The engine is generic: the same system runs on a company handbook, an internal wiki or any document set you control.

---

## How it works

Three loops:

**Ingestion (offline).** Documents are fetched, cleaned, split into chunks along their heading structure, embedded into vectors, and stored in PostgreSQL with both a vector index and a Swedish full-text index.

**Query (online).** A question is rewritten into a standalone search query if it's a follow-up, embedded, then searched two ways at once — vector similarity for meaning, keyword search for exact terms like *fribelopp* or *SGI*. The two rankings are fused, and if nothing scores above the threshold the system says so instead of guessing. Otherwise the top chunks go to Claude as context and the answer streams back with citations.

**Freshness (scheduled).** Sources are re-fetched on a schedule and compared by content hash. Unchanged documents are skipped; changed ones are re-chunked and re-embedded, and the old chunks are superseded rather than deleted.

Amounts that change every January — fribelopp, prisbasbelopp, taknivåer — are kept separately in a small structured table injected into every prompt, so a stale document can never override a current figure.

---

## Stack

| Layer | Choice |
|---|---|
| API | Bun, Fastify, GraphQL |
| Database | PostgreSQL with pgvector, Supabase |
| Embeddings | Voyage AI (multilingual) |
| Generation | Anthropic Claude, streamed responses |
| Frontend | Next.js, TypeScript, Tailwind |
| Ingestion | Firecrawl for web pages, direct upload for PDFs |

---

## Architecture decisions

The reasoning behind the choices, including what I decided against.

### RAG instead of letting the model browse the sites live

For a single casual question, a browsing agent is often good enough. I chose retrieval over a controlled index for four reasons: latency (a vector search is milliseconds, fetching several pages is seconds), token cost (five targeted chunks instead of whole pages on every question), cross-source questions (a question spanning CSN, Skatteverket and Försäkringskassan needs passages from all three without knowing the site structure first), and auditability — I log which chunk produced which answer, which means I can actually evaluate the system.

The deciding reason is scope. The engine's real purpose is document sets a browsing agent cannot reach: handbooks, internal wikis, contracts. Public Swedish agency pages are just a corpus I can verify by hand.

**Rejected:** a plain "model plus web search" setup. Fine for one-off questions, but it can't be scoped, cited precisely, or measured against a test set.

### Hybrid search instead of vector search alone

Embeddings capture meaning but blur exact tokens — and this corpus is full of them: *SGI*, *fribelopp*, form numbers, paragraph references, specific kronor amounts. So keyword search runs alongside vector search and the rankings are fused with Reciprocal Rank Fusion.

PostgreSQL has Swedish-language full-text search built in, so this needed one extra column and one extra index rather than a second system.

**Rejected:** pure vector search. Simpler, and measurably worse on exactly the queries this corpus gets.

### PostgreSQL with pgvector instead of a dedicated vector database

One database holds the relational data, the vectors and the full-text index. No second service to run, back up or keep in sync.

**Rejected:** Pinecone or Qdrant. Better at large scale, unnecessary operational overhead here. The point where I'd switch is millions of vectors, or when vector search starts competing with normal query load for the same database.

### No RAG framework

The core of a RAG pipeline is a few hundred lines: chunking, embedding, similarity search, prompt assembly. I wrote each step myself so that when retrieval quality drops I'm debugging my own chunker rather than a framework's internals.

**Rejected:** LangChain and LlamaIndex. Faster to a first demo, slower to actual understanding — and understanding is the point of this project.

### Volatile numbers in a separate table

The corpus splits by rate of change. How föräldrapenning works changes rarely; the amounts change every January. Keeping the amounts as structured rows means updating for a new year is editing a handful of records, not re-crawling everything — and a stale chunk cannot contradict an authoritative current figure.

**Rejected:** treating all content the same. Simpler, but it makes every annual change a full re-ingestion and leaves stale numbers competing with current ones.

---

## Evaluation

Retrieval quality is measured, not assumed. A set of 25 questions drawn from the corpus — including cross-document questions, questions asked in English against Swedish sources, and questions the corpus does not cover — is run after any change to chunking, embedding or retrieval. Two things are measured separately: whether the right chunk was retrieved, and whether the answer was faithful to it.

Most RAG failures are retrieval failures that look like generation failures, which is why the two are scored apart.

---

## Roadmap

- [x] Phase 0 — Project setup
- [ ] Phase 1 — Database schema, pgvector, embedding model validation
- [ ] Phase 2 — Ingestion pipeline
- [ ] Phase 3 — Retrieval, GraphQL API, streamed answers
- [ ] Phase 4 — Chat interface with citations and a pipeline inspector
- [ ] Phase 5 — Web ingestion, scheduled refresh, auth, MCP server
- [ ] Phase 6 — Evaluation harness and experiments

---

## Disclaimer

Studiehjälpen summarises public information and is not legal or financial advice. Always confirm with the responsible authority. The system shows the source and fetch date for every answer so that claims can be checked.

---

## Notes

Built with AI assistance (Claude Code, Cursor). Architecture, design decisions and review by Devinder Singh.

Author: [Devinder Singh](https://github.com/devinder-dev)