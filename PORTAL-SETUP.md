# Lilac Desk order portal: setup

Everything here can be done from a browser, so it works on DeX. Do the steps in order.

## Where each file goes

```
order-portal/
├── supabase/
│   ├── portal-schema.sql                         (run in the SQL editor, not stored in the repo)
│   └── functions/
│       ├── shopify-order-webhook/index.ts        ← shopify-order-webhook.ts
│       └── portal-notify/index.ts                ← portal-notify.ts
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .env.example
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── supabaseClient.js
    ├── portal-config.js
    ├── portal-styles.css
    ├── lib/orderApi.js
    ├── lib/watermark.js
    ├── components/StageTracker.jsx
    ├── components/Countdown.jsx
    ├── components/FileList.jsx
    ├── components/ChatPanel.jsx
    ├── components/BriefForm.jsx
    ├── components/AddExtras.jsx
    ├── pages/LoginPage.jsx
    ├── pages/OrdersListPage.jsx
    ├── pages/OrderPage.jsx
    ├── pages/AdminDashboardPage.jsx
    └── pages/AdminOrderPage.jsx
```

The two edge function files must be renamed to `index.ts` inside their own folders. Supabase requires that name.

## 1. Supabase project

1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste all of `portal-schema.sql`, and run it.
3. In the same editor, make yourself the admin:
   ```sql
   insert into public.admins (email) values ('you@lilacdesk.com');
   ```
   Use the email you'll sign in with. Anyone in this table sees every order and the admin tools.
4. Copy two values from **Project Settings > API**: the Project URL and the `anon` public key. You'll need them in step 6.

**File size limit:** the free plan caps each upload at 50 MB. A full-year planner with 365 daily pages can go over that. If it does, compress the PDF before uploading, or move to the Pro plan, which lets you raise the limit under **Storage > Settings**.

## 2. Email sending (Resend)

Supabase's built-in email is only for testing and sends very few emails per hour, so set up Resend.

1. Create an account at resend.com and add the domain `lilacdesk.com`. Resend gives you DNS records. Add them where your domain's DNS is managed (in Shopify: **Settings > Domains > lilacdesk.com > DNS settings**).
2. Once the domain is verified, create an API key.
3. In Supabase, open **Authentication > Emails > SMTP Settings**, turn on custom SMTP, and enter Resend's SMTP details (host `smtp.resend.com`, port `465`, username `resend`, password = your API key, sender like `orders@lilacdesk.com`).

## 3. Sign-in settings

In **Authentication > URL Configuration**:

- **Site URL:** `https://orders.lilacdesk.com`
- **Redirect URLs:** add `https://orders.lilacdesk.com/**` and, for testing on your own device, `http://localhost:5173/**`

In **Authentication > Emails > Magic Link**, make sure the template includes the code, so customers whose email app opens a different browser can type it in:

```html
<h2>Sign in to your Lilac Desk order page</h2>
<p><a href="{{ .ConfirmationURL }}">Open your order page</a></p>
<p>Or enter this code: <strong>{{ .Token }}</strong></p>
```

## 4. Shopify products

1. Create two products, **Custom Planner – Personal** and **Custom Planner – Commercial**. Give each three variants named exactly **Basic**, **Standard**, and **Premium**. Untick "This is a physical product."
2. Open each product in the Shopify admin. The number at the end of the page address (`/products/1234567890`) is its product ID. Note both.
3. Create the add-ons. The simplest setup is one product per add-on with two variants, **Personal** and **Commercial** (commercial-only add-ons need just one). Source files need three variants or products, one per tier. Set them to **Unlisted** so they don't show in the shop but can still be bought.
4. For each add-on variant, open the variant in the admin. The number after `/variants/` is its variant ID. In Supabase, open **Table Editor > addons** and paste each ID into `personal_variant_id` or `commercial_variant_id`. An add-on only shows in the portal once its ID is filled in. You can also edit prices and descriptions here.

## 5. Edge functions

In Supabase, open **Edge Functions > Deploy a new function > Via editor**.

1. **shopify-order-webhook:** name it exactly `shopify-order-webhook`, paste `shopify-order-webhook.ts`, and deploy. Then open its settings and turn **off** "Enforce JWT verification." Shopify can't send a Supabase login, and the function checks Shopify's signature instead.
2. **portal-notify:** name it exactly `portal-notify`, paste `portal-notify.ts`, and deploy. Leave JWT verification **on**.

Then open **Edge Functions > Secrets** and add:

| Name | Value |
|---|---|
| `SHOPIFY_WEBHOOK_SECRET` | from step 7 below |
| `SHOPIFY_PERSONAL_PRODUCT_ID` | the personal planner product ID |
| `SHOPIFY_COMMERCIAL_PRODUCT_ID` | the commercial planner product ID |
| `PORTAL_URL` | `https://orders.lilacdesk.com` |
| `ADMIN_EMAIL` | where you want order alerts |
| `RESEND_API_KEY` | your Resend API key |
| `EMAIL_FROM` | `Lilac Desk <orders@lilacdesk.com>` |
| `EXTRA_ORIGINS` | `http://localhost:5173` (only needed for local testing) |

## 6. Put the app online (Vercel)

1. Push the `order-portal` folder (minus `portal-schema.sql`, if you prefer) to a GitHub repository. Codespaces works for this.
2. At vercel.com, import the repository. Vercel detects Vite automatically.
3. Under **Settings > Environment Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SHOP_URL` (`https://lilacdesk.com`), then redeploy.
4. Under **Settings > Domains**, add `orders.lilacdesk.com`. Vercel shows a CNAME record. Add it in Shopify's DNS settings, the same place as the Resend records.

For local testing: copy `.env.example` to `.env.local`, fill it in, then run `npm install` and `npm run dev`.

## 7. Connect Shopify to the portal

1. In Shopify, open **Settings > Notifications > Webhooks** and click **Create webhook**.
2. **Event:** Order payment. **Format:** JSON. **URL:** `https://YOUR-PROJECT.supabase.co/functions/v1/shopify-order-webhook`. **Version:** the latest.
3. Shopify shows a signing secret on that page ("Your webhooks will be signed with..."). Copy it into the `SHOPIFY_WEBHOOK_SECRET` secret in Supabase.
4. Optional but useful: in **Settings > Notifications > Order confirmation**, add a line telling custom planner buyers their order page is at `https://orders.lilacdesk.com`. The portal also emails them a link.

## 8. Test it

1. Turn on Shopify's test payments (**Settings > Payments**, Bogus Gateway or test mode).
2. Buy a custom planner with an email you can check. Within a minute you should get the welcome email, and the order should appear on your admin dashboard.
3. Sign in as the customer (a private browser window helps), fill in and submit the brief, and send a message.
4. As admin, upload a proof with watermarking on, then approve it as the customer.
5. Buy an add-on from the customer's order page. It should appear on the order after checkout.
6. Upload a final file as admin and confirm the customer can download it.

## How it works day to day

- **New order:** Shopify sends it to the portal. The customer gets an email with a sign-in link, and you get an alert.
- **Brief submitted:** the countdown starts (7, 12, or 21 days, halved with rush) and you get an email.
- **Proofs:** choose Proof, keep watermarking on, upload. The stage moves to Proof ready and the customer is emailed.
- **Revisions:** the customer requests changes from the proof, which uses one round. When rounds run out, they're pointed to the extra revision add-on. Buying it adds a round automatically.
- **Finals:** choose Final file (and Keynote source file for commercial orders with that add-on), upload, and the stage moves to Delivered. Finals stay hidden until then. The customer sees their 14-day fix window.
- **No response:** the dashboard flags orders waiting on the customer for 30 days. Set the stage to Closed when you're ready.
- **Messages:** each side gets an email for new messages, at most once every 10 minutes per order, so a run of chat messages doesn't flood inboxes.
- **Due dates and rounds:** you can change both on any order.
