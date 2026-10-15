// Supabase Edge Function: portal-notify
// Save as supabase/functions/portal-notify/index.ts
// Called by the portal after an update. Emails the customer (when Kerry acts)
// or Kerry (when the customer acts), and sends a phone notification through portal-push.
// Recipients are never taken from the request. Customers' email and phone settings are respected.

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";
const PORTAL_URL = (env("PORTAL_URL") || "https://orders.lilacdesk.com").replace(/\/+$/, "");
const MESSAGE_COOLDOWN_MS = 10 * 60 * 1000;

// Every call needs a signed-in session, so any origin may call it
// (a strict origin list silently blocked calls when the URL didn't match exactly)
function corsFor(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

type Recipient = "customer" | "admin" | "other";

const PUSH: Record<string, (o: any, toCustomer: boolean) => { title: string; body: string }> = {
  stage: () => ({ title: "An update on your planner", body: "Tap to see where your order is at." }),
  proof_ready: () => ({ title: "Your proof is ready", body: "Take a look, then approve it or request changes." }),
  final_ready: () => ({ title: "Your planner is ready", body: "Your final files are ready to download." }),
  message: (o, toCustomer) => toCustomer
    ? { title: "New message from Kerry", body: "Tap to read and reply." }
    : { title: `Message from ${o.customer_name ?? o.customer_email}`, body: `${o.shopify_order_name ?? "Custom planner"}: tap to read and reply.` },
  brief_submitted: (o) => ({ title: `Brief in: ${o.shopify_order_name ?? ""}`, body: `${o.customer_name ?? o.customer_email} submitted their brief. The countdown has started.` }),
  revision_request: (o) => ({ title: `Changes requested: ${o.shopify_order_name ?? ""}`, body: `${o.customer_name ?? o.customer_email} sent a list of changes.` }),
  approved: (o) => ({ title: `Proof approved: ${o.shopify_order_name ?? ""}`, body: `${o.customer_name ?? o.customer_email} approved the proof. Final files are next.` }),
};

async function push(to: "admin" | "customer", email: string | null, title: string, body: string, url: string) {
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/portal-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, email, title, body, url }),
    });
    const text = await res.text();
    console.log(`portal-notify: push ${res.status} ${text}`);
    return { status: res.status, text };
  } catch (err) {
    console.error("portal-notify: push failed", err);
    return { error: String(err) };
  }
}

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
      <h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:24px;line-height:1.25;margin:0 0 16px;">${heading}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 28px;">${body}</p>
      <a href="${url}" style="display:inline-block;background:#5C181E;color:#FAFAF8;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Open order page</a>
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

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (!userData?.user) {
    console.log("portal-notify: not signed in", userError?.message ?? "");
    return reply({ error: "Not signed in" }, 401);
  }

  const { order_id, event } = await req.json().catch(() => ({}));
  console.log(`portal-notify: ${event} from ${userData.user.email} for ${order_id ?? "no order"}`);

  // "Send a test notification" button in Kerry's settings
  if (event === "test") {
    const { data: admin } = await userClient.rpc("is_admin");
    if (!admin) return reply({ error: "Not allowed" }, 403);
    const result = await push("admin", null, "Test notification", "Notifications are working on this device.", "/notifications");
    console.log("portal-notify: test push result", JSON.stringify(result));
    return reply({ sent: true, push: result });
  }
  const def = EVENTS[event as string];
  if (!order_id || !def) {
    console.log("portal-notify: unknown event");
    return reply({ error: "Unknown event" }, 400);
  }

  // Reading through the user's own session means security rules decide access
  const { data: order } = await userClient.from("orders").select("*").eq("id", order_id).maybeSingle();
  if (!order) {
    console.log("portal-notify: order not visible to this user");
    return reply({ error: "Order not found" }, 404);
  }

  const { data: isAdmin } = await userClient.rpc("is_admin");
  const to: Recipient = def.to === "other" ? (isAdmin ? "customer" : "admin") : def.to;

  // Customers can only notify Kerry, and Kerry can only notify customers
  console.log(`portal-notify: sending to ${to}`);
  if (to === "customer" && !isAdmin) return reply({ error: "Not allowed" }, 403);
  if (to === "admin" && isAdmin) {
    console.log("portal-notify: skipped, admin acting on own order");
    return reply({ skipped: true });
  }

  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // Phone notification first: it has no cooldown and respects the customer's setting itself
  const note = PUSH[event as string]?.(order, to === "customer");
  if (note) {
    await push(to, to === "customer" ? order.customer_email : null, note.title, note.body, `/orders/${order.id}`);
  }

  const column = to === "customer" ? "last_notified_customer_at" : "last_notified_admin_at";
  if (event === "message" && order[column]) {
    const since = Date.now() - new Date(order[column]).getTime();
    if (since < MESSAGE_COOLDOWN_MS) return reply({ skipped: "cooldown" });
  }

  let recipients: string[] = [];
  if (to === "customer") {
    const { data: profile } = await service
      .from("customer_profiles")
      .select("notify_email, alt_email")
      .ilike("email", order.customer_email)
      .maybeSingle();
    if (profile?.notify_email === false) return reply({ skipped: "customer turned off email" });
    recipients = [order.customer_email, profile?.alt_email].filter(Boolean) as string[];
  } else {
    recipients = [env("ADMIN_EMAIL")].filter(Boolean);
  }

  const key = env("RESEND_API_KEY");
  if (!key || recipients.length === 0) {
    console.log("portal-notify: email skipped, RESEND_API_KEY or ADMIN_EMAIL missing");
    return reply({ skipped: "email not configured" });
  }

  const subject = `${def.subject} (${order.shopify_order_name ?? "custom planner"})`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_FROM"),
      to: recipients,
      subject,
      html: emailLayout(def.heading, def.body, `${PORTAL_URL}/orders/${order.id}`),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("portal-notify: email failed", res.status, detail);
    return reply({ error: detail }, 502);
  }
  console.log(`portal-notify: email sent to ${recipients.length} address(es)`);

  await service.from("orders").update({ [column]: new Date().toISOString() }).eq("id", order.id);

  return reply({ sent: true });
});
