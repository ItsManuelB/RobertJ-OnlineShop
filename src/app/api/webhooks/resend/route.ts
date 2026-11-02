import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/config/env";
import { getSuppressionEvent, verifyResendWebhook } from "@/lib/email/resend-webhook";
import * as queries from "@/lib/supabase/queries";

/**
 * Resend webhook receiver: records addresses that bounced permanently or marked
 * us as spam, so the email senders stop writing to them. It never sends email
 * and never changes an order, a return or an account; its only effect is a row
 * in `email_suppressions`.
 *
 * The request is authenticated by Resend's (Svix) signature over the RAW body,
 * so the body is read as text and only parsed after the signature checks out.
 * Recording is idempotent, so Resend retrying a delivery is harmless; a failure
 * to record returns 500 so Resend retries instead of the event being lost.
 */
export async function POST(request: NextRequest) {
  const secret = getServerEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifyResendWebhook(
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
    secret,
  );
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  // Most events (delivered, sent, opened, a temporary bounce) call for nothing: acknowledge so Resend does not retry.
  const suppression = getSuppressionEvent(payload);
  if (!suppression) {
    return NextResponse.json({ received: true });
  }

  try {
    for (const email of suppression.emails) {
      await queries.recordEmailSuppression(email, suppression.reason, suppression.detail);
    }
  } catch (error) {
    // The address is personal data: log the reason and count, never the address.
    console.error("[resend webhook] could not record a suppression", { reason: suppression.reason, count: suppression.emails.length, error });
    return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
  }

  return NextResponse.json({ received: true, recorded: suppression.emails.length });
}
