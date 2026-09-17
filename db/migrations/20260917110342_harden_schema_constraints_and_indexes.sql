-- migrate:up

-- Document-level hash says whether anything changed; this one says which chunks
-- changed, so unchanged chunks skip re-embedding on re-crawl. See PLAN.md §5.
alter table chunks add column content_hash text not null;

-- Retrieval always filters superseded_at is null, so keep dead vectors out of the
-- index entirely — otherwise a filtered top-k can return fewer than k live rows.
drop index chunks_embedding_idx;
create index chunks_embedding_idx on chunks
  using hnsw (embedding vector_cosine_ops)
  where superseded_at is null;

-- One live chunk per position per document; superseded rows fall outside the index.
create unique index chunks_document_id_chunk_index_live_idx
  on chunks (document_id, chunk_index)
  where superseded_at is null;

-- Re-crawl maps a URL back to its document, so the same page must not be
-- ingested as two documents. Uploads have no URL.
alter table documents add constraint documents_web_needs_url
  check (source_type <> 'web' or source_url is not null);
create unique index documents_source_url_web_idx
  on documents (source_url)
  where source_type = 'web';

-- Postgres does not index foreign key columns automatically.
create index messages_conversation_id_idx on messages (conversation_id);
create index query_traces_conversation_id_idx on query_traces (conversation_id);
create index message_sources_chunk_id_idx on message_sources (chunk_id);
create index conversations_user_id_idx on conversations (user_id);

-- migrate:down

drop index conversations_user_id_idx;
drop index message_sources_chunk_id_idx;
drop index query_traces_conversation_id_idx;
drop index messages_conversation_id_idx;

drop index documents_source_url_web_idx;
alter table documents drop constraint documents_web_needs_url;

drop index chunks_document_id_chunk_index_live_idx;

drop index chunks_embedding_idx;
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

alter table chunks drop column content_hash;
