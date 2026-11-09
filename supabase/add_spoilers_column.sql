-- Letterboxd lets you flag a review as containing spoilers. The flag shows
-- up in the RSS feed twice: the item <title> gets a "(contains spoilers)"
-- suffix, and the description CDATA gets a boilerplate
-- "<p><em>This review may contain spoilers.</em></p>" paragraph.
-- Books (Hardcover) set it from the API's review_has_spoilers field.
alter table media_entries
  add column if not exists contains_spoilers boolean not null default false;
