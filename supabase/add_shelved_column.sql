-- Hiding a card is reversible and never deletes the row. The admin card's X
-- sets shelved_at; the shelf drawer at the bottom of the admin canvas puts it
-- back (drag it onto the mat, or click to return it to where it was).
--
-- One timestamp does two jobs: `shelved_at is null` is the "on the mat" test
-- every query filters on, and the value itself orders the shelf
-- most-recently-hidden first.
--
-- Nothing in the sync path writes this column (the update branch spreads only
-- the parsed feed fields), so a hidden entry stays hidden across re-syncs.
alter table media_entries
  add column if not exists shelved_at timestamptz;
