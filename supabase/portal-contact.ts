// Supabase Edge Function: portal-contact
// Save as supabase/functions/portal-contact/index.ts
// IMPORTANT: turn OFF "Verify JWT" for this function (the Contact page on lilacdesk.com calls it without signing in).
//
//   { action: "submit", name, email, topic, message, order?, website, t }   from the Contact page (public)
//      website = hidden spam trap (must be empty), t = milliseconds the form was open
//   { action: "notify", contact_id }   from the portal after someone replies (signed in)
//      Kerry replied -> customer gets an email + phone notification; customer replied -> Kerry gets a notification
//
// Uses the existing secrets: RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL, PORTAL_URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";
const PORTAL_URL = (env("PORTAL_URL") || "https://orders.lilacdesk.com").replace(/\/+$/, "");
const TOPICS = ["Order question", "Custom planner", "Wholesale or collab", "Something else"];

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

function emailLayout(heading: string, body: string, button: string, url: string) {
  return `
  <div style="background:#FAFAF8;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#333333;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="font-family:'Times New Roman',Times,serif;font-size:20px;letter-spacing:4px;text-transform:uppercase;margin:0 0 28px;">Lilac Desk</p>
      <h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:24px;line-height:1.25;margin:0 0 16px;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;margin:0 0 28px;">${body}</div>
      <a href="${url}" style="display:inline-block;background:#5C181E;color:#FAFAF8;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${button}</a>
    </div>
  </div>`;
}

async function sendEmail(to: string[], subject: string, html: string, replyTo?: string) {
  const key = env("RESEND_API_KEY");
  const list = to.filter(Boolean);
  if (!key || !list.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to: list, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error("portal-contact: email failed", res.status, await res.text());
}

async function push(to: "admin" | "customer", email: string | null, title: string, body: string, url: string) {
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/portal-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, email, title, body, url }),
    });
    console.log(`portal-contact: push ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("portal-contact: push failed", err);
  }
}

async function hash(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text + env("SUPABASE_URL")));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const preview = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

Deno.serve(async (req) => {
  const headers = cors(req);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  // ---------- a visitor sends the Contact form ----------
  if (body.action === "submit") {
    // Bots fill the hidden field or submit instantly; pretend it worked and drop it
    if (clean(body.website, 200) || Number(body.t || 0) < 2500) {
      console.log("portal-contact: dropped as spam");
      return reply({ ok: true });
    }
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const topic = TOPICS.includes(body.topic) ? body.topic : "Something else";
    const message = clean(body.message, 5000);
    const order = clean(body.order, 40);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Please check your email address." }, 400);
    if (message.length < 2) return reply({ error: "Please write a message." }, 400);

    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHash = await hash(ip);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: fromIp } = await service.from("contacts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo);
    if ((fromIp ?? 0) >= 5) return reply({ error: "Too many messages at once. Please try again in a little while." }, 429);

    // Someone writing again while their last message is still open: keep it in one conversation
    const { data: existing } = await service
      .from("contacts")
      .select("*")
      .ilike("email", email)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let contact = existing;
    const now = new Date().toISOString();
    if (contact) {
      await service.from("contacts").update({ updated_at: now, ...(name && !contact.name ? { name } : {}) }).eq("id", contact.id);
    } else {
      const { data, error } = await service
        .from("contacts")
        .insert({ email, name: name || null, topic, order_ref: order || null, ip_hash: ipHash })
        .select()
        .single();
      if (error) {
        console.error("portal-contact: insert failed", error);
        return reply({ error: "Something went wrong. Please email support@lilacdesk.com." }, 500);
      }
      contact = data;
    }
    const text = existing && topic !== existing.topic ? `[${topic}] ${message}` : message;
    await service.from("contact_messages").insert({ contact_id: contact.id, sender: "customer", body: order && existing ? `${text}\n\nOrder: ${order}` : text });

    const who = name || email;
    await push("admin", null, `Message from ${who}`, `${topic}: ${preview(message)}`, `/messages/c/${contact.id}`);
    await sendEmail(
      [env("ADMIN_EMAIL")],
      `${topic}: message from ${who}`,
      emailLayout(
        `New message from ${escapeHtml(who)}`,
        `<p><b>${escapeHtml(topic)}</b>${order ? ` · Order ${escapeHtml(order)}` : ""}<br>${escapeHtml(email)}</p><p style="white-space:pre-wrap;">${escapeHtml(message)}</p>`,
        "Reply in the portal",
        `${PORTAL_URL}/messages/c/${contact.id}`,
      ),
      email,
    );
    if (!existing) {
      await sendEmail(
        [email],
        "Got your message",
        emailLayout(
          `Thanks${name ? `, ${escapeHtml(name.split(" ")[0])}` : ""}. I got your message.`,
          `<p>I usually reply within a day. You’ll get an email when I do, and you can read and answer in your Lilac Desk portal by signing in with this email.</p><p style="white-space:pre-wrap;color:#6c6862;border-left:1px solid #5C181E;padding-left:12px;">${escapeHtml(message)}</p>`,
          "Open the conversation",
          `${PORTAL_URL}/contact/${contact.id}`,
        ),
      );
    }
    return reply({ ok: true });
  }

  // ---------- someone replied inside the portal ----------
  if (body.action === "notify") {
    const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: who } = await user.auth.getUser();
    if (!who?.user) return reply({ error: "Not signed in" }, 401);
    const { data: contact } = await user.from("contacts").select("*").eq("id", body.contact_id).maybeSingle();
    if (!contact) return reply({ error: "Conversation not found" }, 404);
    const { data: isAdmin } = await user.rpc("is_admin");
    const link = `${PORTAL_URL}/contact/${contact.id}`;

    if (isAdmin) {
      const { data: last } = await service
        .from("contact_messages")
        .select("body")
        .eq("contact_id", contact.id)
        .eq("sender", "admin")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await push("customer", contact.email, "Kerry replied", preview(last?.body || "Tap to read."), `/contact/${contact.id}`);
      await sendEmail(
        [contact.email],
        "Kerry replied to your message",
        emailLayout(
          "You have a reply",
          `<p style="white-space:pre-wrap;">${escapeHtml(last?.body || "")}</p><p style="color:#6c6862;font-size:13px;">Reply in your portal: sign in with this email and the conversation is waiting.</p>`,
          "Reply",
          link,
        ),
        env("ADMIN_EMAIL"),
      );
    } else {
      const name = contact.name || contact.email;
      await push("admin", null, `Message from ${name}`, "They replied to your conversation.", `/messages/c/${contact.id}`);
    }
    return reply({ ok: true });
  }

  return reply({ error: "Unknown action" }, 400);
});
