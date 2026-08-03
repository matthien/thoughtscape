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
  logged_at: string;
  external_url: string | null;
  x: number;
  y: number;
  mat_number: number;
  created_at: string;
}
