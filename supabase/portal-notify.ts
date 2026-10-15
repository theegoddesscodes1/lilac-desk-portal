// Supabase Edge Function: portal-notify
// Save as supabase/functions/portal-notify/index.ts
// Called by the portal after an update. Emails the customer (when Kerry acts)
// or Kerry (when the customer acts). Recipients are never taken from the request.

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";
const PORTAL_URL = env("PORTAL_URL") || "https://orders.lilacdesk.com";
const MESSAGE_COOLDOWN_MS = 10 * 60 * 1000;

const ALLOWED_ORIGINS = [PORTAL_URL, ...env("EXTRA_ORIGINS").split(",").map((o) => o.trim()).filter(Boolean)];
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : PORTAL_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type Recipient = "customer" | "admin" | "other";

const EVENTS: Record<string, { to: Recipient; subject: string; heading: string; body: string }> = {
  stage: {
    to: "customer",
    subject: "An update on your planner",
    heading: "Your planner has moved forward",
    body: "There's a new update on your order page.",
  },
  proof_ready: {
    to: "customer",
    subject: "Your proof is ready",
    heading: "Your proof is ready to review",
    body: "Open your order page to look it over, then approve it or request changes.",
  },
  final_ready: {
    to: "customer",
    subject: "Your planner is ready",
    heading: "Your planner is ready to download",
    body: "Your final files are on your order page. If you spot a mistake on my end, like a broken link or a spelling error, let me know within 14 days and I'll fix it free.",
  },
  message: {
    to: "other",
    subject: "New message about your planner",
    heading: "You have a new message",
    body: "Open the order page to read and reply.",
  },
  brief_submitted: {
    to: "admin",
    subject: "Brief submitted",
    heading: "A brief was submitted",
    body: "The delivery countdown has started.",
  },
  revision_request: {
    to: "admin",
    subject: "Revision requested",
    heading: "A customer requested changes",
    body: "Open the order to see the list of changes.",
  },
  approved: {
    to: "admin",
    subject: "Proof approved",
    heading: "A proof was approved",
    body: "Final files can be prepared and delivered.",
  },
};

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function emailLayout(heading: string, body: string, url: string) {
  return `
  <div style="background:#FAFAF8;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#333333;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="font-family:'Times New Roman',Times,serif;font-size:20px;letter-spacing:4px;text-transform:uppercase;margin:0 0 28px;">Lilac Desk</p>
      <h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:28px;line-height:1.2;margin:0 0 16px;">${heading}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 28px;">${body}</p>
      <a href="${url}" style="display:inline-block;background:#333333;color:#FAFAF8;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Open order page</a>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (payload: unknown, status = 200) => json(payload, status, cors);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return reply({ error: "Not signed in" }, 401);

  const { order_id, event } = await req.json().catch(() => ({}));
  const def = EVENTS[event as string];
  if (!order_id || !def) return reply({ error: "Unknown event" }, 400);

  // Reading through the user's own session means security rules decide access
  const { data: order } = await userClient.from("orders").select("*").eq("id", order_id).maybeSingle();
  if (!order) return reply({ error: "Order not found" }, 404);

  const { data: isAdmin } = await userClient.rpc("is_admin");
  const to: Recipient = def.to === "other" ? (isAdmin ? "customer" : "admin") : def.to;

  // Customers can only notify Kerry, and Kerry can only notify customers
  if (to === "customer" && !isAdmin) return reply({ error: "Not allowed" }, 403);
  if (to === "admin" && isAdmin) return reply({ skipped: true });

  const column = to === "customer" ? "last_notified_customer_at" : "last_notified_admin_at";
  if (event === "message" && order[column]) {
    const since = Date.now() - new Date(order[column]).getTime();
    if (since < MESSAGE_COOLDOWN_MS) return reply({ skipped: "cooldown" });
  }

  const recipient = to === "customer" ? order.customer_email : env("ADMIN_EMAIL");
  const key = env("RESEND_API_KEY");
  if (!key || !recipient) return reply({ skipped: "email not configured" });

  const subject = `${def.subject} (${order.shopify_order_name ?? "custom planner"})`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_FROM"),
      to: recipient,
      subject,
      html: emailLayout(def.heading, def.body, `${PORTAL_URL}/orders/${order.id}`),
    }),
  });
  if (!res.ok) return reply({ error: await res.text() }, 502);

  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  await service.from("orders").update({ [column]: new Date().toISOString() }).eq("id", order.id);

  return reply({ sent: true });
});
