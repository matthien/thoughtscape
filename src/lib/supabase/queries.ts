import { supabaseBrowser } from "./client";
import type { MediaEntry } from "@/lib/types";

export async function getRecentEntries(limit = 40): Promise<MediaEntry[]> {
  const { data, error } = await supabaseBrowser
    .from("media_entries")
    .select("*")
    // Hidden (shelved) entries never reach the live canvas. Filtering before
    // the limit is deliberate: hiding a card lets the next-oldest entry rotate
    // onto the mat, so the mat stays full.
    .is("shelved_at", null)
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
