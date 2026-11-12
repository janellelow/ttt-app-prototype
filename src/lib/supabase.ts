import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// The anon key is public by design: the database's row level security rules
// decide what every signed-in person may read or change.
export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "ttt-auth" },
});

export const functionsUrl = `${url}/functions/v1`;
export const anonKeyValue = anonKey ?? "";

/** Throws the Supabase error (so callers can show it) or returns data. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
