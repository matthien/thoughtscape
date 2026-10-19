import { isAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MediaEntry } from "@/lib/types";
import AdminCanvas from "@/components/AdminCanvas";
import { login } from "./actions";
import styles from "./page.module.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isAdmin())) {
    const { error } = await searchParams;
    return (
      <div className={styles.gate}>
        <form action={login} className={styles.form}>
          <div className={styles.label}>admin</div>
          <input
            className={styles.input}
            type="password"
            name="password"
            autoFocus
            placeholder="password"
          />
          <button className={styles.button} type="submit">
            enter
          </button>
          {error && <div className={styles.error}>wrong password</div>}
        </form>
      </div>
    );
  }

  // Two lists: what's on the mat (every unshelved entry, same as the live canvas) and what's
  // hidden in the shelf. The shelf is unbounded — hiding something is meant to
  // be reversible forever, so there's no limit to drop old entries off the end.
  const [matResult, shelfResult] = await Promise.all([
    supabaseAdmin
      .from("media_entries")
      .select("*")
      .is("shelved_at", null)
      .order("logged_at", { ascending: false }),
    supabaseAdmin
      .from("media_entries")
      .select("*")
      .not("shelved_at", "is", null)
      .order("shelved_at", { ascending: false }),
  ]);
  if (matResult.error) throw matResult.error;
  if (shelfResult.error) throw shelfResult.error;

  return (
    <AdminCanvas
      initialEntries={(matResult.data ?? []) as MediaEntry[]}
      initialShelved={(shelfResult.data ?? []) as MediaEntry[]}
    />
  );
}
