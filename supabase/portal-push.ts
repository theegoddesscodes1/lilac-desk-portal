// Supabase Edge Function: portal-push
// Sends phone notifications (Web Push) to Kerry or a customer.
// Only the portal's own functions can call it: they pass the service role key.
//
// Body: { to: "admin" | "customer", email?: string, title: string, body: string, url?: string, tag?: string }

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";

// ---------- base64url ----------

function b64urlToBytes(value: string): Uint8Array {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const text = (s: string) => new TextEncoder().encode(s);

// ---------- VAPID (who is sending) ----------

async function vapidHeader(endpoint: string): Promise<string> {
  const publicKey = b64urlToBytes(env("VAPID_PUBLIC_KEY"));
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(publicKey.slice(1, 33)),
    y: bytesToB64url(publicKey.slice(33, 65)),
    d: env("VAPID_PRIVATE_KEY"),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64url(text(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    text(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env("VAPID_SUBJECT") || "mailto:support@lilacdesk.com",
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${bytesToB64url(signature)}, k=${env("VAPID_PUBLIC_KEY")}`;
}

// ---------- Payload encryption (RFC 8291, aes128gcm) ----------

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);

  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(text("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, text("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(text(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, cipher);
}

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendOne(sub: Subscription, payload: string): Promise<number> {
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
  return res.status;
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    console.log("portal-push: refused, wrong key");
    return new Response("Not allowed", { status: 403 });
  }
  if (!env("VAPID_PUBLIC_KEY") || !env("VAPID_PRIVATE_KEY")) {
    console.log("portal-push: VAPID secrets missing");
    return Response.json({ skipped: "push not configured" });
  }

  const { to, email, title, body, url, tag } = await req.json().catch(() => ({}));
  if (!title || (to !== "admin" && to !== "customer")) return new Response("Bad request", { status: 400 });

  const db = createClient(env("SUPABASE_URL"), serviceKey, { auth: { persistSession: false } });

  let query = db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (to === "admin") {
    query = query.eq("is_admin", true);
  } else {
    if (!email) return new Response("Bad request", { status: 400 });
    const { data: profile } = await db.from("customer_profiles").select("notify_push").ilike("email", email).maybeSingle();
    if (profile && profile.notify_push === false) return Response.json({ skipped: "customer turned off" });
    query = query.eq("is_admin", false).ilike("email", email);
  }

  const { data: subs, error: subsError } = await query;
  if (subsError) console.error("portal-push: could not read devices", subsError.message);
  console.log(`portal-push: to ${to}${email ? ` (${email})` : ""}, ${subs?.length ?? 0} device(s)`);
  const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/", tag: tag ?? undefined });
  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      const status = await sendOne(sub as Subscription, payload);
      if (status === 404 || status === 410) {
        console.log("portal-push: removed expired device");
        await db.from("push_subscriptions").delete().eq("id", sub.id);
      } else if (status < 300) {
        sent += 1;
      } else {
        console.error("Push failed", status, sub.endpoint);
      }
    } catch (err) {
      console.error("Push error", err);
    }
  }
  console.log(`portal-push: delivered to ${sent} device(s)`);
  return Response.json({ sent, devices: subs?.length ?? 0 });
});
