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