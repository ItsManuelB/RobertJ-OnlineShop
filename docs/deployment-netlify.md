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

## 5. Daily sweep (replaces Vercel Cron)

`netlify/functions/xendit-reconciliation.mts` runs daily at 03:00 UTC, on the
published deploy only, and calls `/api/cron/xendit-reconciliation` with
`Authorization: Bearer <CRON_SECRET>`. Check it under Netlify -> Functions ->
`xendit-reconciliation` -> logs after the first run. Until it runs, stuck
pending payments are not re-checked and unpaid orders are not auto-cancelled
after 24 hours; checkout and the webhook are unaffected.

## 6. Smoke test after deploy

1. Browse `/products`, open a product, add to cart.
2. Sign in, place a **COD** order.
3. Place a **GCash** test payment and complete it in the Xendit test page; the
   order should turn paid (this proves key, return URL and webhook together).
4. Optional: call the sweep once by hand:
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://<site>/api/cron/xendit-reconciliation`
   (expect 200 with a JSON summary).
