// Supabase Edge Function: portal-quote
// Save as supabase/functions/portal-quote/index.ts (Verify JWT can stay on).
//
// Called by the portal for custom planner quotes:
//   { action: "notify", quote_id, event: "request" | "message" }   tells the other side (phone + email)
//   { action: "send", quote_id, license, price, scope, manual_url? } Kerry sends a quote: creates the
//      Shopify invoice (draft order) and posts a "Pay and start" card in the chat
//   { action: "close", quote_id, reason?, note? }   the customer declines, or Kerry closes the request:
//      marks it closed, deletes the unpaid Shopify invoice so it can't be paid, tells the other side
//
// Secrets: SHOPIFY_STORE (the part before .myshopify.com, e.g. the-lilac-desk), and either
// SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET from a Dev Dashboard app
// with the write_draft_orders scope. Uses the existing RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL, PORTAL_URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) ?? "";
const PORTAL_URL = (env("PORTAL_URL") || "https://orders.lilacdesk.com").replace(/\/+$/, "");
const API_VERSION = "2025-10";

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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

async function sendEmail(to: string[], subject: string, html: string) {
  const key = env("RESEND_API_KEY");
  const list = to.filter(Boolean);
  if (!key || !list.length) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("EMAIL_FROM"), to: list, subject, html }),
  });
  if (!res.ok) console.error("portal-quote: email failed", res.status, await res.text());
}

async function push(to: "admin" | "customer", email: string | null, title: string, body: string, url: string) {
  try {
    const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/portal-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, email, title, body, url }),
    });
    console.log(`portal-quote: push ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("portal-quote: push failed", err);
  }
}

// ---------- Shopify ----------

let cachedToken: { token: string; until: number } | null = null;

async function shopifyToken(): Promise<string> {
  if (env("SHOPIFY_ADMIN_TOKEN")) return env("SHOPIFY_ADMIN_TOKEN");
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.token;
  const res = await fetch(`https://${env("SHOPIFY_STORE")}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env("SHOPIFY_CLIENT_ID"),
      client_secret: env("SHOPIFY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) throw new Error(`Shopify sign-in failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, until: Date.now() + (Number(data.expires_in || 3600) - 300) * 1000 };
  return cachedToken.token;
}

async function shopifyGraphql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(`https://${env("SHOPIFY_STORE")}.myshopify.com/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await shopifyToken() },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopify answered ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const CREATE_DRAFT = `
mutation CreateQuote($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id invoiceUrl }
    userErrors { field message }
  }
}`;

async function createInvoice(quote: any, license: string, price: number, scope: string) {
  const licenseLabel = license === "commercial" ? "Commercial" : "Personal";
  const line = (priceField: Record<string, unknown>) => ({
    title: `Custom Planner – ${licenseLabel}`,
    quantity: 1,
    requiresShipping: false,
    taxable: true,
    customAttributes: [{ key: "_portal_quote", value: quote.id }],
    ...priceField,
  });
  const input = (priceField: Record<string, unknown>) => ({
    email: quote.email,
    note: scope,
    tags: ["custom-planner", "portal-quote"],
    customAttributes: [{ key: "portal_quote", value: quote.id }],
    lineItems: [line(priceField)],
  });

  // Newer API versions take a price with currency; older ones a plain number
  let data = await shopifyGraphql(CREATE_DRAFT, { input: input({ originalUnitPriceWithCurrency: { amount: price.toFixed(2), currencyCode: "USD" } }) });
  if (data.errors?.length) {
    console.log("portal-quote: retrying with originalUnitPrice", JSON.stringify(data.errors));
    data = await shopifyGraphql(CREATE_DRAFT, { input: input({ originalUnitPrice: price.toFixed(2) }) });
  }
  if (data.errors?.length) throw new Error(data.errors.map((e: any) => e.message).join("; "));
  const result = data.data?.draftOrderCreate;
  if (result?.userErrors?.length) throw new Error(result.userErrors.map((e: any) => e.message).join("; "));
  return { id: result.draftOrder.id as string, url: result.draftOrder.invoiceUrl as string };
}

async function deleteInvoice(draftId: string | null) {
  if (!draftId) return;
  try {
    const data = await shopifyGraphql(`mutation Drop($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`, { input: { id: draftId } });
    console.log("portal-quote: invoice deleted", JSON.stringify(data.data?.draftOrderDelete ?? data.errors));
  } catch (err) {
    console.error("portal-quote: invoice delete failed", String(err));
  }
}

// ---------- main ----------

Deno.serve(async (req) => {
  const headers = cors(req);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return reply({ error: "Not signed in" }, 401);

  const body = await req.json().catch(() => ({}));
  const { data: quote } = await user.from("quotes").select("*").eq("id", body.quote_id).maybeSingle();
  if (!quote) return reply({ error: "Quote not found" }, 404);
  const { data: isAdmin } = await user.rpc("is_admin");
  const service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const name = quote.name || quote.email;
  // A quote sent from an order chat lives in that chat; anything else has its own page
  const chatPath = quote.request?.order_id ? `/orders/${quote.request.order_id}/messages` : `/quotes/${quote.id}`;
  const link = `${PORTAL_URL}${chatPath}`;
  console.log(`portal-quote: ${body.action} ${body.event ?? ""} by ${who.user.email}`);

  if (body.action === "notify") {
    if (isAdmin) {
      await push("customer", quote.email, "New message from Kerry", "About your custom planner. Tap to read.", chatPath);
      await sendEmail([quote.email], "New message about your custom planner", emailLayout("You have a new message", "<p>Kerry replied about your custom planner request.</p>", "Read and reply", link));
    } else {
      const isNew = body.event === "request";
      await push("admin", null, isNew ? "New custom planner request" : `Message from ${name}`, isNew ? `${name} asked for a quote.` : "About their custom planner request.", `/quotes/${quote.id}`);
      await sendEmail(
        [env("ADMIN_EMAIL")],
        isNew ? `New custom planner request from ${name}` : `New message from ${name} (quote)`,
        emailLayout(isNew ? "New custom planner request" : "New message on a quote", `<p>${escapeHtml(name)} ${isNew ? "asked for a custom planner quote" : "sent a message about their quote"}.</p>`, "Open in the portal", link),
      );
    }
    return reply({ ok: true });
  }

  if (body.action === "send") {
    if (!isAdmin) return reply({ error: "Not allowed" }, 403);
    const price = Number(body.price);
    const license = body.license === "commercial" ? "commercial" : "personal";
    const scope = String(body.scope || "").trim();
    if (!(price > 0) || !scope) return reply({ error: "Add a price and what's included" }, 400);

    let invoice: { id: string | null; url: string };
    try {
      invoice = body.manual_url ? { id: null, url: String(body.manual_url) } : await createInvoice(quote, license, price, scope);
    } catch (err) {
      console.error("portal-quote: invoice failed", String(err));
      return reply({ error: `Shopify couldn't create the invoice: ${String(err)}` }, 502);
    }

    // An updated quote replaces the old invoice, so only the newest price can be paid
    if (quote.draft_order_id && quote.draft_order_id !== invoice.id) await deleteInvoice(quote.draft_order_id);

    await service
      .from("quotes")
      .update({ status: "quoted", license, price, scope, invoice_url: invoice.url, draft_order_id: invoice.id, quoted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", quote.id);
    await service.from("quote_messages").insert({ quote_id: quote.id, sender: "admin", kind: "quote", body: scope });

    await push("customer", quote.email, quote.status === "quoted" ? "Your quote was updated" : "Your quote is ready", `$${price.toFixed(2)} · tap to review and pay.`, chatPath);
    await sendEmail(
      [quote.email],
      quote.status === "quoted" ? "Your updated custom planner quote" : "Your custom planner quote",
      emailLayout(
        quote.status === "quoted" ? "Your quote was updated" : "Your quote is ready",
        `<p><b>$${price.toFixed(2)}</b> · ${license === "commercial" ? "Commercial" : "Personal"} license</p><p style="white-space:pre-wrap;">${escapeHtml(scope)}</p><p>Review it in your order page. Once you pay, your brief opens right away.</p>`,
        "Review and pay",
        link,
      ),
    );
    return reply({ ok: true, invoice_url: invoice.url });
  }

  if (body.action === "close") {
    if (!["open", "quoted"].includes(quote.status)) return reply({ error: "This request is already finished" }, 400);
    const by = isAdmin ? "admin" : "customer";
    const reason = String(body.reason || "").trim().slice(0, 80);
    const note = String(body.note || "").trim().slice(0, 1000);
    const now = new Date().toISOString();

    await service.from("quotes").update({ status: "closed", closed_by: by, close_reason: reason || null, closed_at: now, updated_at: now }).eq("id", quote.id);
    if (note) await service.from("quote_messages").insert({ quote_id: quote.id, sender: by, kind: "message", body: note, created_at: now });
    const first = (quote.name || "").split(" ")[0] || "The customer";
    const line = by === "customer"
      ? `${first} declined ${quote.status === "quoted" ? "the quote" : "this request"}${reason ? `: ${reason.toLowerCase()}` : ""}.`
      : "This request was closed.";
    await service.from("quote_messages").insert({ quote_id: quote.id, sender: "system", kind: "message", body: line, created_at: new Date(Date.now() + 1000).toISOString() });
    await deleteInvoice(quote.draft_order_id);

    if (by === "customer") {
      await push("admin", null, `${name} declined`, reason || "Their custom planner request is closed.", `/quotes/${quote.id}`);
      await sendEmail(
        [env("ADMIN_EMAIL")],
        `${name} declined their custom planner ${quote.status === "quoted" ? "quote" : "request"}`,
        emailLayout(
          "A quote was declined",
          `<p>${escapeHtml(name)} declined${quote.status === "quoted" && quote.price ? ` the $${Number(quote.price).toFixed(2)} quote` : " their request"}.</p>${reason ? `<p><b>Reason:</b> ${escapeHtml(reason)}</p>` : ""}${note ? `<p style="white-space:pre-wrap;">“${escapeHtml(note)}”</p>` : ""}<p>The unpaid invoice was removed from Shopify.</p>`,
          "Open in the portal",
          link,
        ),
      );
    }
    return reply({ ok: true });
  }

  return reply({ error: "Unknown action" }, 400);
});
