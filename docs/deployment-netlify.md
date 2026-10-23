# Deploying to Netlify

The app runs on Netlify with no code changes. `netlify.toml` sets the build
(`npm run build`, Node 22) and `netlify/functions/xendit-reconciliation.mts`
replaces the Vercel Cron job in `vercel.json`. Both Vercel and Netlify config
files can stay in the repo; each host ignores the other's.

## 1. Create the site

1. Netlify -> Add new site -> Import from Git -> pick this repository and the
   branch to publish (usually `main`).
2. Leave the build settings as detected (they come from `netlify.toml`).
3. **Add the environment variables below before the first deploy.**
   `NEXT_PUBLIC_*` values are baked in at build time, so changing one later
   needs a new deploy, and a missing one fails the build.

## 2. Environment variables

Site configuration -> Environment variables. Set the same values you use in
`.env.local`, except where noted.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required at build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Required at build |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key | Required at build. Add the Netlify domain to the key's allowed domains in Cloudflare. |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-site>.netlify.app` (or custom domain) | Used for the return link after GCash/Maya/Card. Must not be localhost. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | Mark as secret. |
| `XENDIT_SECRET_KEY` | A valid Xendit **secret** key | The current key in `.env.local` is rejected by Xendit; generate a new test-mode key first. |
| `XENDIT_WEBHOOK_TOKEN` | Same token as in the Xendit dashboard | Compared with the `x-callback-token` header. |
| `CRON_SECRET` | Any long random string | Used by the scheduled function below. Mark as secret. |

Tip: if the first build fails on `NEXT_PUBLIC_SITE_URL`, deploy once with the
default Netlify address, then set the real URL and redeploy.

## 3. Supabase

Authentication -> URL Configuration: add the Netlify URL to **Site URL** /
**Redirect URLs** (include `https://<site>/auth/callback`) so sign-in, email
confirmation and password reset return to the right place.

## 4. Xendit dashboard

Settings -> Webhooks: set the callback URL to
`https://<site>/api/webhooks/xendit` with the **same callback token** as
`XENDIT_WEBHOOK_TOKEN`, for the payment-request, payment-session and refund
events. Without it, a paid order never turns to "paid".

## 5. Payment sweep (replaces Vercel Cron)

`netlify/functions/xendit-reconciliation.mts` runs every 15 minutes, on the
published deploy only, and calls `/api/cron/xendit-reconciliation` with
`Authorization: Bearer <CRON_SECRET>`. Check it under Netlify -> Functions ->
`xendit-reconciliation` -> logs after the first run. Until it runs, stuck
pending payments are not re-checked and unpaid orders are not auto-cancelled
after 60 minutes; checkout and the webhook are unaffected.

## 6. Smoke test after deploy

1. Browse `/products`, open a product, add to cart.
2. Sign in, place a **COD** order.
3. Place a **GCash** test payment and complete it in the Xendit test page; the
   order should turn paid (this proves key, return URL and webhook together).
4. Optional: call the sweep once by hand:
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/cron/xendit-reconciliation`
   (expect 200 with a JSON summary).

## 7. Custom domain (`robertjshop.store`, registered at Spaceship)

DNS stays at Spaceship (default `launch1/2.spaceship.net` nameservers) and
points at Netlify with two records. Switching to Netlify DNS nameservers also
works but waits on registry TTLs (up to 24h+), so records are faster.

1. Netlify -> Domain management -> Add a domain -> `robertjshop.store`. The
   apex is the primary domain and `www` redirects to it.
2. Spaceship -> Domain Manager -> `robertjshop.store` -> Nameservers & DNS ->
   Advanced DNS -> DNS Records. Remove any existing `@` / `www` records, then add:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | `A` | `@` | `75.2.60.5` | 30 min |
   | `CNAME` | `www` | `<your-site>.netlify.app` | 30 min |

   Spaceship has no ALIAS type in its quick-add list, so the apex uses the `A`
   record (Netlify's load-balancer IP). No `AAAA` or `CAA` records are set;
   a `CAA` record that excludes Let's Encrypt would block the certificate.
3. Netlify -> Domain management -> HTTPS -> Verify DNS configuration. The
   Let's Encrypt certificate is issued automatically and renews itself. After
   verification it can take 30+ minutes to appear; **Retry DNS verification**
   re-requests it. Until then the site serves Netlify's `*.netlify.app`
   certificate and browsers show a trust error.
4. Set `NEXT_PUBLIC_SITE_URL=https://robertjshop.store` and redeploy (it is
   baked in at build time).
5. Update every service that knows the site address:
   - **Supabase** -> Authentication -> URL Configuration: Site URL, and add
     `https://robertjshop.store/**` to Redirect URLs.
   - **Xendit** -> Webhooks: `https://robertjshop.store/api/webhooks/xendit`.
   - **Cloudflare Turnstile**: add `robertjshop.store` to the key's allowed
     domains, or the sign-in / sign-up captcha fails on the new domain.
6. Re-run the [smoke test](#6-smoke-test-after-deploy) on the new domain,
   including a password-reset email link and a GCash return.

Domain renewal: auto-renew is **off** in Spaceship and the domain expires on
2027-10-09. Turn it on or renew before then.

Troubleshooting: `nslookup robertjshop.store 8.8.8.8` should return
`75.2.60.5`; `www` should resolve through `<your-site>.netlify.app`.
