import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// The anon key is public by design: the database's row level security rules
// decide what every signed-in person may read or change.
/** The web console (console/index.html sets data-app="console") vs the Telegram mini app. */
export const isConsole = typeof document !== "undefined" && document.documentElement.dataset.app === "console";

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Separate sign-ins, so using both apps in one browser never mixes them up.
    storageKey: isConsole ? "ttt-console-auth" : "ttt-auth",
    // Google sign-in for the web console comes back with a code in the URL.
    flowType: isConsole ? "pkce" : "implicit",
    detectSessionInUrl: isConsole,
  },
});

export const functionsUrl = `${url}/functions/v1`;
export const anonKeyValue = anonKey ?? "";

/** Throws the Supabase error (so callers can show it) or returns data. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
