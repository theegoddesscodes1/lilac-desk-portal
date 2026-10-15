// Supabase Edge Function: shopify-order-webhook
// Save as supabase/functions/shopify-order-webhook/index.ts
// Receives Shopify webhooks:
//   Order payment   -> creates portal orders and add-ons, with prices
//   Refund creation -> records refunds against the order (for Income)

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const PORTAL_URL = env("PORTAL_URL") || "https://orders.lilacdesk.com";
const PERSONAL_PRODUCT_ID = env("SHOPIFY_PERSONAL_PRODUCT_ID");
const COMMERCIAL_PRODUCT_ID = env("SHOPIFY_COMMERCIAL_PRODUCT_ID");
// Hidden "Custom Planner" product used on Shopify invoices; its variants are named Personal and Commercial
const CUSTOM_PRODUCT_ID = env("SHOPIFY_CUSTOM_PRODUCT_ID");

const TIERS: Record<string, { label: string; days: number; revisions: number }> = {
  basic: { label: "Basic", days: 7, revisions: 2 },
  standard: { label: "Standard", days: 12, revisions: 3 },
  premium: { label: "Premium", days: 21, revisions: 4 },
  // Custom: you set the due date on the order page; rounds start at 3 and can be changed there
  custom: { label: "Custom", days: 0, revisions: 3 },
};

const OPEN_STAGES = ["order_placed", "brief_received", "designing", "proof_ready", "revisions", "approved"];

// ---------- helpers ----------

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyShopify(raw: string, header: string | null) {
  const secret = env("SHOPIFY_WEBHOOK_SECRET");
  if (!header || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const digest = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return safeEqual(digest, header);
}

function lineItemProperty(item: any, name: string): string | null {
  const found = (item.properties ?? []).find((p: any) => p.name === name);
  return found ? String(found.value) : null;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function emailLayout(heading: string, body: string, buttonLabel: string, buttonUrl: string) {
  return `
  <div style="background:#FAFAF8;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#333333;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="font-family:'Times New Roman',Times,serif;font-size:20px;letter-spacing:4px;text-transform:uppercase;margin:0 0 28px;">Lilac Desk</p>
      <h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:24px;line-height:1.25;margin:0 0 16px;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;margin:0 0 28px;">${body}</div>
      <a href="${buttonUrl}" style="display:inline-block;background:#5C181E;color:#FAFAF8;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${buttonLabel}</a>
    </div>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = env("RESEND_API_KEY");
  if (!key || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to, subject, html }),
  });
  if (!res.ok) console.error("Email failed", await res.text());
}

// One-click sign-in straight to an order page. The portal's /welcome route
// exchanges the token for a session, so the customer lands on their brief.
async function signInLink(email: string, orderId: string) {
  const next = `/orders/${orderId}`;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    console.error("Sign-in link failed", error);
    return `${PORTAL_URL}${next}`;
  }
  const type = data.properties.verification_type || "magiclink";
  return `${PORTAL_URL}/welcome?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`;
}

// Phone notification through the portal-push function (never blocks the webhook)
async function push(to: "admin" | "customer", title: string, body: string, url: string, email?: string) {
  try {
    await fetch(`${env("SUPABASE_URL")}/functions/v1/portal-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, email, title, body, url }),
    });
  } catch (err) {
    console.error("Push failed", err);
  }
}

// What the customer actually paid for a line, after discounts
function linePaid(item: any): number {
  const qty = Number(item.quantity ?? 1) || 1;
  const gross = Number(item.price ?? 0) * qty;
  const discount = Number(item.total_discount ?? 0) ||
    (item.discount_allocations ?? []).reduce((n: number, d: any) => n + Number(d.amount ?? 0), 0);
  return Math.max(0, Math.round((gross - discount) * 100) / 100);
}

async function handleRefund(refund: any) {
  const orderId = refund.order_id;
  const amount = (refund.transactions ?? [])
    .filter((t: any) => t.kind === "refund" && t.status === "success")
    .reduce((n: number, t: any) => n + Number(t.amount ?? 0), 0);
  if (!orderId || !amount) return new Response("ok", { status: 200 });

  const { data: rows } = await db
    .from("orders")
    .select("id, refunded_amount, refund_ids")
    .eq("shopify_order_id", orderId)
    .order("copy_index", { ascending: true })
    .limit(1);
  const target = rows?.[0];
  if (!target) return new Response("ok", { status: 200 });
  if ((target.refund_ids ?? []).map(String).includes(String(refund.id))) return new Response("ok", { status: 200 });

  await db
    .from("orders")
    .update({
      refunded_amount: Math.round((Number(target.refunded_amount ?? 0) + amount) * 100) / 100,
      refunded_at: refund.created_at ?? new Date().toISOString(),
      refund_ids: [...(target.refund_ids ?? []), refund.id],
    })
    .eq("id", target.id);
  return new Response("ok", { status: 200 });
}

async function systemMessage(orderId: string, body: string) {
  await db.from("messages").insert({ order_id: orderId, sender: "system", body });
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await verifyShopify(raw, req.headers.get("x-shopify-hmac-sha256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(raw);
  if ((req.headers.get("x-shopify-topic") ?? "") === "refunds/create") return handleRefund(payload);

  const shopOrder = payload;
  const email = String(shopOrder.email || shopOrder.contact_email || shopOrder.customer?.email || "").toLowerCase();
  if (!email) return new Response("No customer email", { status: 200 });

  const customerName =
    [shopOrder.customer?.first_name, shopOrder.customer?.last_name].filter(Boolean).join(" ") ||
    shopOrder.billing_address?.name ||
    null;
  const lineItems: any[] = shopOrder.line_items ?? [];

  // 1. Planner line items become portal orders
  const plannerRows: any[] = [];
  for (const item of lineItems) {
    const productId = String(item.product_id ?? "");
    const variantName = String(item.variant_title ?? "").trim().toLowerCase();
    const isCustom = Boolean(productId && productId === CUSTOM_PRODUCT_ID);
    const license =
      productId && productId === PERSONAL_PRODUCT_ID ? "personal"
      : productId && productId === COMMERCIAL_PRODUCT_ID ? "commercial"
      : isCustom ? (variantName.includes("commercial") ? "commercial" : "personal")
      : null;
    if (!license) continue;

    const tierKey = isCustom ? "custom" : variantName;
    const tier = TIERS[tierKey];
    if (!tier) {
      console.error(`Unknown tier "${item.variant_title}" on line item ${item.id}`);
      continue;
    }

    for (let copy = 0; copy < (item.quantity ?? 1); copy++) {
      plannerRows.push({
        shopify_order_id: shopOrder.id,
        shopify_order_name: shopOrder.name,
        shopify_line_item_id: item.id,
        copy_index: copy,
        customer_email: email,
        customer_name: customerName,
        license,
        tier: tierKey,
        revisions_included: tier.revisions,
        ...(isCustom && shopOrder.note ? { scope_note: String(shopOrder.note).slice(0, 4000) } : {}),
        planner_price: Math.round((linePaid(item) / (Number(item.quantity ?? 1) || 1)) * 100) / 100,
      });
    }
  }

  let createdOrders: any[] = [];
  if (plannerRows.length) {
    const { data, error } = await db
      .from("orders")
      .upsert(plannerRows, { onConflict: "shopify_line_item_id,copy_index", ignoreDuplicates: true })
      .select();
    if (error) {
      console.error(error);
      return new Response("Database error", { status: 500 });
    }
    createdOrders = data ?? [];

    for (const order of createdOrders) {
      await systemMessage(order.id, "Order received. Fill in your brief to start your delivery countdown.");
      const tier = TIERS[order.tier];
      const licenseLabel = order.license === "personal" ? "Personal" : "Commercial";

      const briefLink = await signInLink(email, order.id);
      await sendEmail(
        email,
        `Start your brief: order ${order.shopify_order_name}`,
        emailLayout(
          "Your brief is ready for you",
          `<p>Thank you for your order of a ${tier.label} ${licenseLabel.toLowerCase()} planner.</p>
           <p>The button below signs you in and opens your brief. Your delivery countdown starts as soon as it's in.</p>
           <p style="font-size:13px;">The button works once and expires after a day. After that, sign in at <a href="${PORTAL_URL}" style="color:#5C181E;">orders.lilacdesk.com</a> with this email address.</p>`,
          "Start your brief",
          briefLink,
        ),
      );

      await push(
        "admin",
        `New order ${order.shopify_order_name}`,
        `${customerName ?? email} ordered a ${tier.label} ${licenseLabel.toLowerCase()} planner.`,
        `/orders/${order.id}`,
      );

      await sendEmail(
        env("ADMIN_EMAIL"),
        `New custom planner order ${order.shopify_order_name}`,
        emailLayout(
          "New custom planner order",
          `<p>${escapeHtml(customerName ?? email)} ordered a ${tier.label} ${licenseLabel.toLowerCase()} planner.</p>`,
          "Open order",
          `${PORTAL_URL}/orders/${order.id}`,
        ),
      );
    }
  }

  // 2. Add-on line items attach to an order
  const { data: addons } = await db.from("addons").select("*");
  const byVariant = new Map<string, any>();
  for (const addon of addons ?? []) {
    if (addon.personal_variant_id) byVariant.set(String(addon.personal_variant_id), addon);
    if (addon.commercial_variant_id) byVariant.set(String(addon.commercial_variant_id), addon);
  }

  for (const item of lineItems) {
    const addon = byVariant.get(String(item.variant_id ?? ""));
    if (!addon) continue;

    // Find the order this add-on belongs to
    let target: any = null;
    const ref = lineItemProperty(item, "_portal_order");
    if (ref) {
      const { data } = await db.from("orders").select("*").eq("id", ref).maybeSingle();
      if (data && data.customer_email.toLowerCase() === email) target = data;
    }
    if (!target && createdOrders.length) target = createdOrders[0];
    if (!target) {
      const { data } = await db
        .from("orders")
        .select("*")
        .eq("customer_email", email)
        .in("stage", OPEN_STAGES)
        .order("created_at", { ascending: false })
        .limit(1);
      target = data?.[0] ?? null;
    }
    if (!target) {
      await sendEmail(
        env("ADMIN_EMAIL"),
        `Unmatched add-on on ${shopOrder.name}`,
        emailLayout(
          "An add-on couldn't be matched",
          `<p>${escapeHtml(email)} bought "${escapeHtml(addon.name)}" but has no open planner order. Check this order in Shopify.</p>`,
          "Open portal",
          PORTAL_URL,
        ),
      );
      continue;
    }

    const quantity = item.quantity ?? 1;
    const { data: inserted } = await db
      .from("order_addons")
      .upsert(
        {
          order_id: target.id,
          addon_key: addon.key,
          name: addon.name,
          quantity,
          price: linePaid(item),
          shopify_order_id: shopOrder.id,
          shopify_line_item_id: item.id,
        },
        { onConflict: "shopify_line_item_id", ignoreDuplicates: true },
      )
      .select();
    if (!inserted?.length) continue; // already processed

    // Effects
    if (addon.key === "extra_revision") {
      await db
        .from("orders")
        .update({ revisions_included: target.revisions_included + quantity })
        .eq("id", target.id);
    }
    if (addon.key === "rush" && target.brief_submitted_at && TIERS[target.tier]?.days) {
      const days = Math.ceil(TIERS[target.tier].days / 2);
      const due = new Date(new Date(target.brief_submitted_at).getTime() + days * 86400000);
      await db.from("orders").update({ due_at: due.toISOString() }).eq("id", target.id);
    }

    await systemMessage(
      target.id,
      `Add-on purchased: ${addon.name}${quantity > 1 ? ` (x${quantity})` : ""}.`,
    );

    if (!createdOrders.find((o) => o.id === target.id)) {
      await push(
        "admin",
        `Add-on bought on ${target.shopify_order_name}`,
        `${target.customer_name ?? email} added ${addon.name}${quantity > 1 ? ` (x${quantity})` : ""}.`,
        `/orders/${target.id}`,
      );
      await sendEmail(
        env("ADMIN_EMAIL"),
        `Add-on purchased on ${target.shopify_order_name}`,
        emailLayout(
          "Add-on purchased",
          `<p>${escapeHtml(target.customer_name ?? email)} added "${escapeHtml(addon.name)}".</p>`,
          "Open order",
          `${PORTAL_URL}/orders/${target.id}`,
        ),
      );
    }
  }

  return new Response("ok", { status: 200 });
});
