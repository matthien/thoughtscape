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

  const { data, error } = await supabaseAdmin
    .from("media_entries")
    .select("*")
    .order("logged_at", { ascending: false })
    .limit(40);
  if (error) throw error;

  return <AdminCanvas initialEntries={(data ?? []) as MediaEntry[]} />;
}
