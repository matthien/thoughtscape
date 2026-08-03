create table media_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- 'letterboxd' for now
  source_id text not null,           -- stable id or URL from the source
  media_type text not null,          -- 'movie' for now
  title text not null,
  year int,
  director text,                     -- movies only
  author text,                       -- books only
  cover_url text,
  rating numeric,                    -- normalized 0-5
  review_text text,
  logged_at timestamp not null,
  external_url text,
  x numeric,
  y numeric,
  mat_number int default 1,          -- future-proofing for v2 chapters
  created_at timestamp default now(),
  unique (source, source_id)
);

-- Public canvas only ever reads. Writes (admin drag, sync) go through the
-- server-side service role client, which bypasses RLS entirely.
alter table media_entries enable row level security;

create policy "public read access"
  on media_entries for select
  to anon
  using (true);
