import { supabaseBrowser } from "./client";
import type { MediaEntry } from "@/lib/types";

export async function getRecentEntries(limit = 40): Promise<MediaEntry[]> {
  const { data, error } = await supabaseBrowser
    .from("media_entries")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
