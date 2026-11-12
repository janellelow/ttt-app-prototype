// console-auth: lets a leader use the web console with their Google account.
//
// The web console signs in with Google first. That lands on a small "login"
// account that a Head of Department created for this Google address when they
// granted access (see console-access). This function checks that login, finds
// the leader it belongs to, and returns a session for the leader's own app
// account, so every database rule that applies in the Telegram mini app
// applies to the web console too.
//
// Refuses when: the session is not a Google sign-in, nobody granted that
// Google account access, or the leader is no longer a trainer, admin or Head.
//
// Required secrets: AUTH_PASSWORD_PEPPER (same value as telegram-auth).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { accountEmail, accountPassword, bearer, corsHeaders, json, serverConfig } from "../_shared/accounts.ts";

const LEADER_ROLES = ["trainer", "admin", "head"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cfg = serverConfig();
  if (!cfg) return json({ error: "Server is not configured" }, 500);

  const token = bearer(req);
  if (!token) return json({ error: "Sign in with Google first" }, 401);

  const admin = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false } });
  const anon = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });

  const { data: who, error: whoError } = await admin.auth.getUser(token);
  const login = who?.user;
  if (whoError || !login) return json({ error: "Your sign-in has expired. Please sign in again." }, 401);

  const providers: string[] = login.app_metadata?.providers ?? [login.app_metadata?.provider].filter(Boolean);
  if (!providers.includes("google") || !login.email_confirmed_at) {
    return json({ error: "Please sign in with Google." }, 403);
  }

  const { data: access } = await admin
    .from("console_access")
    .select("profile_id")
    .eq("login_user_id", login.id)
    .maybeSingle();
  if (!access) {
    return json({ error: "This Google account does not have access. Ask your Head of Department." }, 403);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, telegram_id, role")
    .eq("id", access.profile_id)
    .single();
  if (!profile || !LEADER_ROLES.includes(profile.role)) {
    return json({ error: "The web console is for trainers, admins and Heads of Department." }, 403);
  }

  const { data, error } = await anon.auth.signInWithPassword({
    email: accountEmail(profile.telegram_id),
    password: await accountPassword(cfg.pepper, profile.telegram_id),
  });
  if (error || !data.session) return json({ error: "Could not sign you in" }, 500);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});
