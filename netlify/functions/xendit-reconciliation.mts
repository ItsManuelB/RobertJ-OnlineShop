/**
 * Netlify replacement for the Vercel Cron entry in `vercel.json`: once a day
 * (03:00 UTC, same as before) it calls the app's own sweep route, which
 * re-checks stuck Xendit payments and auto-cancels orders unpaid after 24h.
 * All the work stays in `src/app/api/cron/xendit-reconciliation/route.ts`;
 * this only triggers it with the `Authorization: Bearer <CRON_SECRET>` header
 * that route already requires. Scheduled functions run on the published
 * (production) deploy only.
 */
export default async function xenditReconciliation(): Promise<Response> {
  const siteUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("[xendit reconciliation] URL or CRON_SECRET is not set; sweep skipped.");
    return new Response("Not configured", { status: 500 });
  }

  const response = await fetch(`${siteUrl}/api/cron/xendit-reconciliation`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(`[xendit reconciliation] sweep responded ${response.status}`);
  return new Response(null, { status: response.ok ? 200 : 502 });
}

export const config = { schedule: "0 3 * * *" };
