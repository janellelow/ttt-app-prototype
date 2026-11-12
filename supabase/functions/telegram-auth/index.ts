// telegram-auth: signs a person in using the data Telegram passes to the mini app.
//
// Telegram signs `initData` with your bot token. We check that signature here,
// on the server, so nobody can pretend to be someone else. If it is valid we
// find (or create) that person's account and return a Supabase session.
//
// Required secrets (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN   – from @BotFather
//   AUTH_PASSWORD_PEPPER – any long random string; never share or change it
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  accountEmail,
  accountPassword,
  corsHeaders,
  hmac,
  json,
  timingSafeEqual,
  toHex,
} from "../_shared/accounts.ts";

const MAX_AGE_SECONDS = 60 * 60 * 24; // initData older than a day is refused

const encoder = new TextEncoder();

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmac(encoder.encode("WebAppData"), botToken);
  const expected = toHex(await hmac(secretKey, dataCheckString));
  if (!timingSafeEqual(expected, hash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  const userJson = params.get("user");
  if (!userJson) return null;
  const user = JSON.parse(userJson) as {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  if (!user?.id) return null;
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const pepper = Deno.env.get("AUTH_PASSWORD_PEPPER");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !pepper || !url || !anonKey || !serviceKey) {
    return json({ error: "Server is not configured" }, 500);
  }

  let initData = "";
  try {
    ({ initData } = await req.json());
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 4096) {
    return json({ error: "Bad request" }, 400);
  }

  const tgUser = await verifyInitData(initData, botToken);
  if (!tgUser) return json({ error: "Could not verify Telegram sign-in" }, 401);

  // Each Telegram account maps to one hidden email + password account.
  // The password is derived from a server-only secret, so it can never be
  // guessed and is never shown to anyone.
  const email = accountEmail(tgUser.id);
  const password = await accountPassword(pepper, tgUser.id);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  let { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { telegram_id: tgUser.id },
    });
    // Sign in either way: if creating failed, a parallel first sign-in (a
    // double tap, or a retry) has usually just created the same account.
    ({ data, error } = await anon.auth.signInWithPassword({ email, password }));
    if (error || !data.session) {
      return json({ error: created.error ? "Could not create account" : "Could not sign in" }, 500);
    }
  }

  const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").slice(0, 80) ||
    "Musician";

  // Keep Telegram name/photo fresh. Role, age group, tags and trainer are
  // never touched here; only assign_member() changes those.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.session!.user.id,
      telegram_id: tgUser.id,
      display_name: displayName,
      username: tgUser.username ?? null,
      photo_url: tgUser.photo_url ?? null,
    },
    { onConflict: "id" },
  );
  if (profileError) return json({ error: "Could not save profile" }, 500);

  return json({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
  });
});
