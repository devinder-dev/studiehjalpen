-- migrate:up

create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('upload', 'web')),
  source_url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  content_hash text,
  fetched_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  content text not null,
  heading_path text not null,
  chunk_index integer not null,
  token_count integer not null,
  embedding vector(1024),
  content_tsv tsvector generated always as (to_tsvector('swedish', content)) stored,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Volatile numbers (fribelopp, prisbasbelopp, taknivåer) live here so a stale
-- chunk can never override a current figure. See PLAN.md §7.
create table facts (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric not null,
  unit text,
  applies_to_year integer not null,
  source_url text not null,
  verified_at timestamptz not null default now(),
  unique (key, applies_to_year)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  -- No FK yet: Phase 5 hand-rolls auth (JWT + argon2id), not Supabase Auth.
  user_id uuid not null,
  title text,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table message_sources (
  message_id uuid not null references messages (id) on delete cascade,
  chunk_id uuid not null references chunks (id) on delete cascade,
  similarity_score real not null,
  retrieval_method text not null check (retrieval_method in ('vector', 'keyword', 'both')),
  primary key (message_id, chunk_id)
);

create table query_traces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id) on delete cascade,
  original_query text not null,
  rewritten_query text,
  retrieved_chunk_ids uuid[] not null default '{}',
  scores jsonb not null default '{}',
  threshold_triggered boolean not null default false,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  latency_ms_by_stage jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (content_tsv);
create index on chunks (document_id) where superseded_at is null;

-- migrate:down

drop table if exists query_traces;
drop table if exists message_sources;
drop table if exists messages;
drop table if exists conversations;
drop table if exists facts;
drop table if exists chunks;
drop table if exists documents;
