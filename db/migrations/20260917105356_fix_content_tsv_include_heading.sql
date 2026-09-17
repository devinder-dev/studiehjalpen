-- migrate:up

-- Keyword search needs heading_path too: exact terms like "Fribelopp" or "SGI"
-- often live in the heading, not repeated verbatim in the body sentence.
alter table chunks drop column content_tsv;
alter table chunks add column content_tsv tsvector
  generated always as (to_tsvector('swedish', heading_path || ' ' || content)) stored;
create index on chunks using gin (content_tsv);

-- migrate:down

alter table chunks drop column content_tsv;
alter table chunks add column content_tsv tsvector
  generated always as (to_tsvector('swedish', content)) stored;
create index on chunks using gin (content_tsv);
