// Shared by the Edge Functions. Each Telegram account maps to one hidden
// email + password account; the password is derived from a server-only
// secret (AUTH_PASSWORD_PEPPER), so it can never be guessed or shown.

const encoder = new TextEncoder();

export async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function accountEmail(telegramId: number | string): string {
  return `tg-${telegramId}@telegram.invalid`;
}

export async function accountPassword(pepper: string, telegramId: number | string): Promise<string> {
  return toHex(await hmac(encoder.encode(pepper), String(telegramId)));
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The Supabase settings every function needs, or null if one is missing. */
export function serverConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = Deno.env.get("AUTH_PASSWORD_PEPPER");
  if (!url || !anonKey || !serviceKey || !pepper) return null;
  return { url, anonKey, serviceKey, pepper };
}

/** The bearer token from the request, or null. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}
