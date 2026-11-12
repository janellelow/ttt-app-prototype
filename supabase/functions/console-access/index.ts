// console-access: a Head of Department grants or revokes a leader's access
// to the web console.
//
//   POST { "action": "grant",  "profile_id": "...", "email": "name@gmail.com" }
//   POST { "action": "revoke", "profile_id": "..." }
//
// Granting creates a login account for that Google address (already
// confirmed, no password). When the leader later signs in with Google,
// Supabase links the Google sign-in to it, which is why public sign-ups can
// stay switched off. Revoking deletes that login account, so the Google
// sign-in stops working straight away. Both are written to the change log.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearer, corsHeaders, json, serverConfig } from "../_shared/accounts.ts";

const LEADER_ROLES = ["trainer", "admin", "head"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cfg = serverConfig();
  if (!cfg) return json({ error: "Server is not configured" }, 500);

  const token = bearer(req);
  if (!token) return json({ error: "Not signed in" }, 401);

  const admin = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false } });

  // The caller must be a Head of Department (checked on their app account).
  const { data: who } = await admin.auth.getUser(token);
  const callerId = who?.user?.id;
  if (!callerId) return json({ error: "Not signed in" }, 401);
  const { data: caller } = await admin.from("profiles").select("role").eq("id", callerId).maybeSingle();
  if (caller?.role !== "head") {
    return json({ error: "Only a Head of Department can manage web console access." }, 403);
  }

  let body: { action?: string; profile_id?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const profileId = body.profile_id;
  if (typeof profileId !== "string") return json({ error: "Bad request" }, 400);

  const { data: existing } = await admin
    .from("console_access")
    .select("email, login_user_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (body.action === "revoke") {
    if (!existing) return json({ ok: true });
    const { error } = await admin.from("console_access").delete().eq("profile_id", profileId);
    if (error) return json({ error: "Could not revoke access" }, 500);
    if (existing.login_user_id) await admin.auth.admin.deleteUser(existing.login_user_id);
    await admin.from("audit_log").insert({
      actor_id: callerId,
      action: "console_access_revoked",
      target_id: profileId,
      details: { email: existing.email },
    });
    return json({ ok: true });
  }

  if (body.action !== "grant") return json({ error: "Bad request" }, 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.endsWith("@telegram.invalid")) {
    return json({ error: "Enter a valid Google email address." }, 400);
  }

  const { data: target } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!target) return json({ error: "Member not found" }, 404);
  if (!LEADER_ROLES.includes(target.role)) {
    return json({ error: "Make this person a trainer, admin or Head first." }, 400);
  }

  const { data: taken } = await admin
    .from("console_access")
    .select("profile_id")
    .eq("email", email)
    .neq("profile_id", profileId)
    .maybeSingle();
  if (taken) return json({ error: "That Google account is already linked to someone else." }, 409);

  if (existing?.email === email && existing.login_user_id) return json({ ok: true });

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { console_login: true },
  });
  if (created.error || !created.data.user) {
    return json({
      error: "Could not set up that Google account. If it was used before, remove it under " +
        "Authentication → Users in Supabase and try again.",
    }, 409);
  }

  const { error: saveError } = await admin.from("console_access").upsert({
    profile_id: profileId,
    email,
    login_user_id: created.data.user.id,
    granted_by: callerId,
    granted_at: new Date().toISOString(),
  });
  if (saveError) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    return json({ error: "Could not save access" }, 500);
  }

  // A changed address replaces the old login.
  if (existing?.login_user_id) await admin.auth.admin.deleteUser(existing.login_user_id);

  await admin.from("audit_log").insert({
    actor_id: callerId,
    action: "console_access_granted",
    target_id: profileId,
    details: { email },
  });
  return json({ ok: true });
});
