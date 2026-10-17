// Supabase Edge Function: portal-daily
// Save as supabase/functions/portal-daily/index.ts
// IMPORTANT: turn OFF "Verify JWT" for this function. Supabase calls it every hour (see portal-v13-studio-tools.sql).
// Every reminder is logged and sent once, so extra runs never send anything twice.
//
// Each run (times are Eastern):
//   * Morning summary: at the hour you picked in Settings, a phone notification about your day.
//   * Reminders (9 AM to 7 PM only): brief not submitted, proof not reviewed, last call before the no-response policy.
//   * Review requests (9 AM to 7 PM only): a few days after delivery, once.
//
// Uses the existing secrets: RESEND_API_KEY, EMAIL_FROM, PORTAL_URL. Add {"force": true} to the body to run
// everything now while testing (still never sends the same thing twice).

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";
const PORTAL_URL = (env("PORTAL_URL") || "https://orders.lilacdesk.com").replace(/\/+$/, "");
const TZ = "America/New_York";
const NO_RESPONSE_DAYS = 30;
const FIX_WINDOW_DAYS = 14;
const DAY = 86400000;

// Same defaults as src/lib/studioSettings.js
const DEFAULTS = {
  reminders: { on: true, briefDays: 3, proofDays: 4, lastCallDays: 25 },
  digest: { on: true, hour: 8 },
  review: { on: true, days: 4, url: "" },
};

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function local(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { hour: Number(parts.hour), day: `${parts.year}-${parts.month}-${parts.day}` };
}

function emailLayout(heading: string, body: string, button: string, url: string) {
  return `
  <div style="background:#FAFAF8;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#333333;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="font-family:'Times New Roman',Times,serif;font-size:20px;letter-spacing:4px;text-transform:uppercase;margin:0 0 28px;">Lilac Desk</p>
      <h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:24px;line-height:1.25;margin:0 0 16px;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;margin:0 0 28px;">${body}</div>
      <a href="${url}" style="display:inline-block;background:#5C181E;color:#FAFAF8;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${button}</a>
      <p style="font-size:12px;color:#8a867f;margin:28px 0 0;">You can turn off email updates any time in Settings on your order page.</p>
    </div>
  </div>`;
}

async function push(to: "admin" | "customer", email: string | null, title: string, body: string, url: string) {
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/portal-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, email, title, body, url }),
    });
    console.log(`portal-daily: push ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("portal-daily: push failed", err);
  }
}

// Customer email, respecting their "Email updates" setting and copying their second address
async function emailCustomer(order: any, subject: string, html: string) {
  const { data: profile } = await db.from("customer_profiles").select("notify_email, alt_email").ilike("email", order.customer_email).maybeSingle();
  if (profile?.notify_email === false) return "skipped (email off)";
  const key = env("RESEND_API_KEY");
  if (!key) return "skipped (no RESEND_API_KEY)";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to: [order.customer_email, profile?.alt_email].filter(Boolean), subject, html }),
  });
  return res.ok ? "sent" : `failed ${res.status} ${await res.text()}`;
}

// Claim a reminder before sending: the unique index makes a second claim fail, so nothing goes out twice
async function claim(kind: string, orderId: string | null) {
  const { error } = await db.from("reminder_log").insert({ kind, order_id: orderId });
  return !error;
}

const firstName = (o: any) => (o.customer_name || "").split(" ")[0] || "there";
const daysAgo = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : 0);

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const now = local();
  const { data: row } = await db.from("studio_settings").select("data").eq("id", 1).maybeSingle();
  const s = row?.data || {};
  const settings = {
    reminders: { ...DEFAULTS.reminders, ...(s.reminders || {}) },
    digest: { ...DEFAULTS.digest, ...(s.digest || {}) },
    review: { ...DEFAULTS.review, ...(s.review || {}) },
  };
  const daytime = now.hour >= 9 && now.hour < 19;
  const log: string[] = [`hour ${now.hour} ${now.day}`];

  const { data: orders = [] } = await db.from("orders").select("*");
  const active = (orders ?? []).filter((o: any) => !["delivered", "complete", "closed"].includes(o.stage));

  // ---------- morning summary ----------
  if (settings.digest.on && (force || now.hour === settings.digest.hour) && (await claim(`digest_${now.day}`, null))) {
    const weekAhead = Date.now() + 7 * DAY;
    const overdue = active.filter((o: any) => o.due_at && new Date(o.due_at).getTime() < Date.now()).length;
    const dueWeek = active.filter((o: any) => o.due_at && new Date(o.due_at).getTime() >= Date.now() && new Date(o.due_at).getTime() <= weekAhead).length;
    const briefs = active.filter((o: any) => o.stage === "brief_received").length;
    const changes = active.filter((o: any) => o.stage === "revisions").length;
    const finals = active.filter((o: any) => o.stage === "approved").length;
    const [{ data: m }, { data: qm }, { data: cm }] = await Promise.all([
      db.from("messages").select("order_id").eq("sender", "customer").is("read_at", null),
      db.from("quote_messages").select("quote_id").eq("sender", "customer").is("read_at", null),
      db.from("contact_messages").select("contact_id").eq("sender", "customer").is("read_at", null),
    ]);
    const waiting = new Set((m ?? []).map((x: any) => x.order_id)).size + new Set((qm ?? []).map((x: any) => x.quote_id)).size + new Set((cm ?? []).map((x: any) => x.contact_id)).size;
    const parts = [
      overdue && `${overdue} overdue`,
      dueWeek && `${dueWeek} due this week`,
      briefs && `${briefs} ${briefs === 1 ? "brief" : "briefs"} to start`,
      changes && `${changes} with changes to make`,
      finals && `${finals} ready to deliver`,
      waiting && `${waiting} ${waiting === 1 ? "message" : "messages"} waiting`,
    ].filter(Boolean);
    if (parts.length) {
      await push("admin", null, "Good morning, Kerry", parts.join(" · "), "/");
      log.push(`digest: ${parts.join(" · ")}`);
    } else log.push("digest: nothing to report");
  }

  // ---------- reminders to customers ----------
  if (settings.reminders.on && (daytime || force)) {
    const r = settings.reminders;
    for (const o of active) {
      const link = `${PORTAL_URL}/orders/${o.id}`;
      const name = escapeHtml(firstName(o));
      const quiet = daysAgo(o.last_customer_activity_at || o.created_at);

      // Last call before the no-response policy (waiting on them, quiet a long time)
      if (["order_placed", "proof_ready"].includes(o.stage) && quiet >= r.lastCallDays && quiet < NO_RESPONSE_DAYS) {
        const kind = `last_call_${o.stage}_${o.revisions_used ?? 0}`;
        if (await claim(kind, o.id)) {
          const left = Math.max(1, Math.round(NO_RESPONSE_DAYS - quiet));
          const what = o.stage === "order_placed" ? "your brief" : "your proof";
          const res = await emailCustomer(o, `Still want your planner? (${o.shopify_order_name})`, emailLayout(
            "Still want your planner?",
            `<p>Hi ${name}, I haven’t heard from you in a while, and ${what} is still waiting.</p><p>To keep things fair for everyone in my queue, orders without a reply for ${NO_RESPONSE_DAYS} days are closed, so yours would close in about ${left} ${left === 1 ? "day" : "days"}. Just reply or pick up where you left off and it stays open. If something came up, send me a message. I’m happy to work with you.</p>`,
            o.stage === "order_placed" ? "Finish my brief" : "Review my proof",
            link,
          ));
          await push("customer", o.customer_email, "Still want your planner?", `Your order is waiting on you. It closes in about ${left} days without a reply.`, `/orders/${o.id}`);
          log.push(`last call ${o.shopify_order_name}: ${res}`);
        }
        continue;
      }

      // Brief not submitted
      if (o.stage === "order_placed" && !o.brief_submitted_at && daysAgo(o.created_at) >= r.briefDays) {
        if (await claim("brief_nudge", o.id)) {
          const started = Object.keys(o.brief || {}).length > 0;
          const res = await emailCustomer(o, `Your planner brief is waiting (${o.shopify_order_name})`, emailLayout(
            started ? "Pick up where you left off" : "Your brief is ready for you",
            started
              ? `<p>Hi ${name}, your brief is saved and waiting. Finish it whenever you’re ready, and your delivery countdown starts as soon as you submit it.</p>`
              : `<p>Hi ${name}, I can’t wait to start on your planner. The brief takes about 10 minutes: how you plan, the sections you want, and what you love. Your delivery countdown starts as soon as it’s in.</p>`,
            started ? "Finish my brief" : "Fill in my brief",
            `${link}/brief`,
          ));
          await push("customer", o.customer_email, started ? "Your brief is saved" : "Your brief is ready for you", "Your delivery countdown starts when it’s in.", `/orders/${o.id}/brief`);
          log.push(`brief nudge ${o.shopify_order_name}: ${res}`);
        }
        continue;
      }

      // Proof not reviewed
      if (o.stage === "proof_ready") {
        const { data: proofs } = await db.from("files").select("round, created_at").eq("order_id", o.id).eq("kind", "proof").order("created_at", { ascending: false }).limit(1);
        const latest = proofs?.[0];
        if (latest && daysAgo(latest.created_at) >= r.proofDays) {
          const round = latest.round ?? o.revisions_used + 1;
          if (await claim(`proof_nudge_${round}`, o.id)) {
            const res = await emailCustomer(o, `Your proof is waiting for you (${o.shopify_order_name})`, emailLayout(
              "Your proof is waiting for you",
              `<p>Hi ${name}, just a nudge: proof ${round} of your planner is ready to look over. Approve it, or tap right on the proof to pin any changes, and I’ll take it from there.</p>`,
              "Review my proof",
              `${link}/proofs`,
            ));
            await push("customer", o.customer_email, `Proof ${round} is waiting for you`, "Approve it or pin any changes right on the proof.", `/orders/${o.id}/proofs`);
            log.push(`proof nudge ${o.shopify_order_name}: ${res}`);
          }
        }
      }
    }
  }

  // ---------- review requests ----------
  if (settings.review.on && (daytime || force)) {
    for (const o of orders ?? []) {
      if (!o.delivered_at || !["delivered", "complete"].includes(o.stage)) continue;
      const since = daysAgo(o.delivered_at);
      if (since < settings.review.days || since > FIX_WINDOW_DAYS) continue;
      if (!(await claim("review", o.id))) continue;
      const url = settings.review.url || `${PORTAL_URL}/orders/${o.id}?review=1`;
      const res = await emailCustomer(o, "How’s your planner?", emailLayout(
        `How’s your planner, ${escapeHtml(firstName(o))}?`,
        `<p>I hope you’re loving it. If you have a minute, a short review means the world to a small studio like mine and helps other planners find me.</p><p>It takes a minute: tap a star rating, add a few words, and a photo of it in use if you have one. You can also tag <b>@thelilacdesk</b>.</p><p>If anything needs fixing, you still have until ${new Date(new Date(o.delivered_at).getTime() + FIX_WINDOW_DAYS * DAY).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })} to let me know, free.</p>`,
        "Leave a review",
        url,
      ));
      log.push(`review ${o.shopify_order_name}: ${res}`);
    }
  }

  console.log("portal-daily:", log.join(" | "));
  return Response.json({ ok: true, log });
});
