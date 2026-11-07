import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rewatchKey } from "@/lib/rewatches";

// Toggles an entry between the mat and the admin shelf. There is deliberately
// no delete route: hiding is always reversible, so rows are never removed.
//
// Restoring can carry a new x/y (the spot the card was dragged out onto). If
// it doesn't, the stored position is left untouched and the card reappears
// exactly where it was when it was hidden.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { id, shelved, x, y } = body ?? {};
  if (typeof id !== "string" || typeof shelved !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const patch: { shelved_at: string | null; x?: number; y?: number } = {
    shelved_at: shelved ? new Date().toISOString() : null,
  };
  // A drop position only makes sense when restoring, and both coordinates
  // have to be present — a half-written position would strand the card.
  if (!shelved && Number.isFinite(x) && Number.isFinite(y)) {
    patch.x = x;
    patch.y = y;
  }

  // A rewatched film is several rows shown as one card, so every watch moves
  // together — otherwise hiding the card would leave its other watches on
  // the mat.
  const { data: row, error: rowError } = await supabaseAdmin
    .from("media_entries")
    .select("id, source, title, year")
    .eq("id", id)
    .single();
  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  const { data: siblings, error: siblingError } = await supabaseAdmin
    .from("media_entries")
    .select("id, source, title, year")
    .eq("source", row.source)
    .eq("title", row.title);
  if (siblingError) {
    return NextResponse.json({ error: siblingError.message }, { status: 500 });
  }
  const ids = (siblings ?? [])
    .filter((s) => rewatchKey(s) === rewatchKey(row))
    .map((s) => s.id);

  const { error } = await supabaseAdmin
    .from("media_entries")
    .update(patch)
    .in("id", ids.length ? ids : [id]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
