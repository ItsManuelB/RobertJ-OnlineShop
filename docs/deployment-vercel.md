# Deploying to Vercel

The app runs on Vercel with no code changes. Production is https://robertjshop.store, deployed from `main`. `vercel.json` defines the Cron job for the Xendit reconciliation sweep.

## 1. Project

1. Vercel -> Add New -> Project -> import this repository (the Next.js preset is detected).
2. Leave the build settings as detected (`npm run build`).

## 2. Environment variables

Set these under Project Settings -> Environment Variables for **Production and Preview**. Values are listed in `.env.example`.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase -> Project Settings -> API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. |
| `NEXT_PUBLIC_SITE_URL` | `https://robertjshop.store`, no trailing slash. Baked in at build time, so redeploy after changing it. Auth redirects, the callback and Xendit return links are built from it. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Baked in at build time. The widget's hostnames must be plain (`robertjshop.store`, `www.robertjshop.store`, `robertj-shop-store.vercel.app`, `localhost`), with no trailing dot or scheme, or the widget fails with error 110200. Its secret key goes in Supabase -> Authentication -> Attack Protection. |
| `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN` | Server only. |
| `CRON_SECRET` | Vercel sends it as `Authorization: Bearer <value>` on cron calls. |

## 3. External settings

- **Supabase** -> Authentication -> URL Configuration: Site URL `https://robertjshop.store`; Redirect URLs `https://robertjshop.store/auth/callback` and the `www` equivalent.
- **Xendit** -> Settings -> Webhooks: `https://robertjshop.store/api/webhooks/xendit`. The verification token must equal `XENDIT_WEBHOOK_TOKEN`.

## 4. Cron

`vercel.json` runs `/api/cron/xendit-reconciliation` daily at 03:00 UTC, the most the Hobby plan allows. The route also auto-cancels orders left unpaid for 60 minutes, so it should run about every 15 minutes. Either upgrade the plan and tighten the schedule, or call the route from an external scheduler with `Authorization: Bearer <CRON_SECRET>`.

## 5. Custom domain (DNS stays at Spaceship)

Add `robertjshop.store` and `www.robertjshop.store` under Project Settings -> Domains, then set at Spaceship -> Advanced DNS:

| Type | Host | Value |
|---|---|---|
| `A` | `@` | `216.198.79.1` |
| `CNAME` | `www` | the project-specific value Vercel shows (e.g. `<id>.vercel-dns-017.com`) |

Leave the Resend records (`send` MX and TXT, `rsend` CNAME, `resend._domainkey` TXT) alone; they carry auth email. The `www` domain redirects to the apex. Vercel issues the certificate automatically once DNS resolves.

## 6. Smoke test

Open the site, sign in with email (the Turnstile box must turn green), run Forgot password, and sign in with Google. If the page shows a stale host, flush the local DNS cache.
