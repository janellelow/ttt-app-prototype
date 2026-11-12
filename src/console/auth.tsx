import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { anonKeyValue, functionsUrl, supabase, supabaseConfigured } from "../lib/supabase";
import type { Profile } from "../lib/types";

// Web console sign-in:
//   1. Google sign-in (Supabase OAuth) lands on the login account a Head of
//      Department created when they granted access.
//   2. console-auth swaps that for the leader's own app session, so the same
//      database rules apply here as in the Telegram mini app.

type Status = "loading" | "signed-out" | "denied" | "ready" | "not-configured";

interface ConsoleAuth {
  status: Status;
  message: string | null;
  profile: Profile | null;
  isAdmin: boolean;
  isHead: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<ConsoleAuth | null>(null);
const LEADER_ROLES = ["trainer", "admin", "head"];

async function ownProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function ConsoleAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const deny = useCallback(async (text: string) => {
    await supabase.auth.signOut();
    setProfile(null);
    setMessage(text);
    setStatus("denied");
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return setStatus("not-configured");
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return !cancelled && setStatus("signed-out");

      // Already swapped to a leader's app session?
      let me = await ownProfile(session.user.id);
      if (!me) {
        // A fresh Google sign-in: swap it for the leader's own session.
        const res = await fetch(`${functionsUrl}/console-auth`, {
          method: "POST",
          headers: { apikey: anonKeyValue, Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return !cancelled && deny(body.error ?? "Could not sign you in.");
        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        if (error) return !cancelled && deny(error.message);
        const { data: who } = await supabase.auth.getUser();
        me = who.user ? await ownProfile(who.user.id) : null;
      }
      if (cancelled) return;
      if (!me || !LEADER_ROLES.includes(me.role)) {
        return deny("The web console is for trainers, admins and Heads of Department.");
      }
      setProfile(me);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [deny]);

  const value: ConsoleAuth = {
    status,
    message,
    profile,
    isAdmin: profile?.role === "admin" || profile?.role === "head",
    isHead: profile?.role === "head",
    signIn: async () => {
      setMessage(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href.split("#")[0] },
      });
      if (error) setMessage(error.message);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setStatus("signed-out");
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsoleAuth(): ConsoleAuth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsoleAuth must be used inside <ConsoleAuthProvider>");
  return ctx;
}

/** For screens that only render once signed in. */
export function useLeader(): Profile {
  const { profile } = useConsoleAuth();
  if (!profile) throw new Error("Not signed in");
  return profile;
}
