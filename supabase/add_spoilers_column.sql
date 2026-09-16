-- Letterboxd lets you flag a review as containing spoilers. The flag shows
-- up in the RSS feed twice: the item <title> gets a "(contains spoilers)"
-- suffix, and the description CDATA gets a boilerplate
-- "<p><em>This review may contain spoilers.</em></p>" paragraph.
-- Goodreads has no equivalent, so books are always false.
alter table media_entries
  add column if not exists contains_spoilers boolean not null default false;
