\restrict dbmate

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    content text NOT NULL,
    heading_path text NOT NULL,
    chunk_index integer NOT NULL,
    token_count integer NOT NULL,
    embedding public.vector(1024),
    superseded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('swedish'::regconfig, ((heading_path || ' '::text) || content))) STORED,
    content_hash text NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    source_type text NOT NULL,
    source_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    content_hash text,
    fetched_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documents_source_type_check CHECK ((source_type = ANY (ARRAY['upload'::text, 'web'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT documents_web_needs_url CHECK (((source_type <> 'web'::text) OR (source_url IS NOT NULL)))
);


--
-- Name: facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value numeric NOT NULL,
    unit text,
    applies_to_year integer NOT NULL,
    source_url text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_sources (
    message_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    similarity_score real NOT NULL,
    retrieval_method text NOT NULL,
    CONSTRAINT message_sources_retrieval_method_check CHECK ((retrieval_method = ANY (ARRAY['vector'::text, 'keyword'::text, 'both'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: query_traces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.query_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    original_query text NOT NULL,
    rewritten_query text,
    retrieved_chunk_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    threshold_triggered boolean DEFAULT false NOT NULL,
    model text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost numeric,
    latency_ms_by_stage jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: facts facts_key_applies_to_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_key_applies_to_year_key UNIQUE (key, applies_to_year);


--
-- Name: facts facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facts
    ADD CONSTRAINT facts_pkey PRIMARY KEY (id);


--
-- Name: message_sources message_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sources
    ADD CONSTRAINT message_sources_pkey PRIMARY KEY (message_id, chunk_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: query_traces query_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.query_traces
    ADD CONSTRAINT query_traces_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: chunks_content_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunks_content_tsv_idx ON public.chunks USING gin (content_tsv);


--
-- Name: chunks_document_id_chunk_index_live_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chunks_document_id_chunk_index_live_idx ON public.chunks USING btree (document_id, chunk_index) WHERE (superseded_at IS NULL);


--
-- Name: chunks_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunks_document_id_idx ON public.chunks USING btree (document_id) WHERE (superseded_at IS NULL);


--
-- Name: chunks_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunks_embedding_idx ON public.chunks USING hnsw (embedding public.vector_cosine_ops) WHERE (superseded_at IS NULL);


--
-- Name: conversations_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_user_id_idx ON public.conversations USING btree (user_id);


--
-- Name: documents_source_url_web_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documents_source_url_web_idx ON public.documents USING btree (source_url) WHERE (source_type = 'web'::text);


--
-- Name: message_sources_chunk_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_sources_chunk_id_idx ON public.message_sources USING btree (chunk_id);


--
-- Name: messages_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_id_idx ON public.messages USING btree (conversation_id);


--
-- Name: query_traces_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX query_traces_conversation_id_idx ON public.query_traces USING btree (conversation_id);


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: message_sources message_sources_chunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sources
    ADD CONSTRAINT message_sources_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.chunks(id) ON DELETE CASCADE;


--
-- Name: message_sources message_sources_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_sources
    ADD CONSTRAINT message_sources_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: query_traces query_traces_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.query_traces
    ADD CONSTRAINT query_traces_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260917095138'),
    ('20260917105356'),
    ('20260917110342');
