import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { anonKeyValue, functionsUrl, supabase, supabaseConfigured } from "./supabase";
import { loadRoleLabels } from "./labels";
import { useAutoRefresh } from "./refresh";
import { insideTelegram, prepareTelegram, tg } from "./telegram";
import type { Profile } from "./types";

type Status = "loading" | "ready" | "outside-telegram" | "not-configured" | "error";

interface AuthValue {
  status: Status;
  error: string | null;
  profile: Profile | null;
  isStaff: boolean;
  isAdmin: boolean;
  /** Head of Department: roles, console access, general roadmap, change log. */
  isHead: boolean;
  refreshProfile: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempt, setAttempt] = useState(0);

  const loadProfile = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error("Not signed in");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (error) throw new Error(error.message);
    // The team's own names for access levels (Heads rename them in the web console).
    await loadRoleLabels();
    // Keep the same object when nothing changed, so screens don't reload for nothing.
    setProfile((prev) => (prev && JSON.stringify(prev) === JSON.stringify(data) ? prev : (data as Profile)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    prepareTelegram();

    async function signIn() {
      if (!supabaseConfigured) return setStatus("not-configured");
      if (!insideTelegram || !tg) return setStatus("outside-telegram");
      setStatus("loading");
      setError(null);
      try {
        // Exchange Telegram's signed launch data for a session. The server
        // checks the signature with the bot token before trusting anything.
        const res = await fetch(`${functionsUrl}/telegram-auth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKeyValue,
            Authorization: `Bearer ${anonKeyValue}`,
          },
          body: JSON.stringify({ initData: tg.initData }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Sign-in failed (${res.status})`);
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (sessionError) throw new Error(sessionError.message);
        await loadProfile();
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sign-in failed");
        setStatus("error");
      }
    }

    signIn();
    return () => {
      cancelled = true;
    };
  }, [attempt, loadProfile]);

  // A Head of Department may change your role, group or trainer from the web
  // console while the app is open; pick that up without reopening.
  useAutoRefresh(loadProfile, status === "ready");

  const value: AuthValue = {
    status,
    error,
    profile,
    isStaff: profile?.role === "trainer" || profile?.role === "admin" || profile?.role === "head",
    isAdmin: profile?.role === "admin" || profile?.role === "head",
    isHead: profile?.role === "head",
    refreshProfile: loadProfile,
    retry: () => setAttempt((n) => n + 1),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For screens that only render once signed in. */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error("Profile not loaded");
  return profile;
}
