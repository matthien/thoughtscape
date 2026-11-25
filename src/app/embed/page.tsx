import type { Metadata } from "next";
import Canvas from "@/components/Canvas";
import { getRecentEntries } from "@/lib/supabase/queries";

// The mini mat, framed on Matt's portfolio (matthewthien.com/thoughtscape).
// Same data and same Canvas as the homepage, so syncs, hand placement and
// shelving show up here too; `mini` only hides the ruler and search and keeps
// the URL still. Which sites may frame this page is set in next.config.ts.

// Same reason as the homepage: read fresh entries on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The full site is the one search engines should list.
  robots: { index: false },
};

export default async function EmbedPage() {
  const entries = await getRecentEntries();
  return <Canvas entries={entries} mini />;
}
