import { supabaseBrowser } from "./client";
import type { MediaEntry } from "@/lib/types";

export async function getRecentEntries(): Promise<MediaEntry[]> {
  const { data, error } = await supabaseBrowser
    .from("media_entries")
    .select("*")
    // Hidden (shelved) entries never reach the live canvas. There's no cap:
    // every unshelved entry is on the mat, so the shelf is the only way to
    // take something off it.
    .is("shelved_at", null)
    .order("logged_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
