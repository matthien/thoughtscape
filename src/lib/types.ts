export interface MediaEntry {
  id: string;
  source: string;
  source_id: string;
  media_type: string;
  title: string;
  year: number | null;
  director: string | null;
  author: string | null;
  cover_url: string | null;
  rating: number | null;
  review_text: string | null;
  contains_spoilers: boolean;
  logged_at: string;
  /** Set when the entry is hidden from the mat and sitting in the admin
   *  shelf; null means it's on the mat. Never deleted, only toggled. */
  shelved_at: string | null;
  external_url: string | null;
  x: number;
  y: number;
  mat_number: number;
  created_at: string;
}
