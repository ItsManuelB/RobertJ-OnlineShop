"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createXenditCardSessionAction,
  createXenditGroupCardSessionAction,
} from "@/features/payments/actions/xendit.actions";

type Phase = "idle" | "loading" | "ready" | "submitting" | "complete" | "expired" | "error";

type XenditCardPaymentButtonProps = (
  | { orderId: string; checkoutGroupId?: undefined }
  | { orderId?: undefined; checkoutGroupId: string }
) & {
  /**
   * Starts the session automatically on mount instead of waiting for a
   * "Pay with Card" click — used only by `CheckoutForm`'s immediately-after-
   * placing-the-order step, so completing a Card order feels like GCash/
   * Maya's immediate handoff instead of a separate later action. Every other
   * call site (via `PaymentRecoveryPanel` in Checkout's resume workspace)
   * omits this and keeps its current click-to-start behavior unchanged. If
   * auto-start itself fails, the manual button still appears (`error`
   * phase) so the buyer isn't stuck.
   */
  autoStart?: boolean;
  /** Fires once, when the Components widget reports the card form was submitted (`session-complete`). Lets the checkout flow decide what happens next (e.g. move on to Orders) without this component owning any navigation itself. */
  onComplete?: () => void;
};

/**
 * Card payment via a Xendit Payment Session (mode=COMPONENTS). Raw card data
 * never reaches our server — the `xendit-components-web` widget collects and
 * tokenizes it directly against Xendit using a short-lived, session-scoped
 * `components_sdk_key` minted server-side. Completion here ("session-complete")
 * is informational only; the webhook is what actually confirms payment.
 *
 * Pass `orderId` for a single order, or `checkoutGroupId` to pay for an
 * entire multi-seller checkout group with one combined Card session — the
 * widget itself is identical either way, only the action that mints the
 * session differs.
 */
export function XenditCardPaymentButton(props: XenditCardPaymentButtonProps) {
  const { autoStart = false, onComplete } = props;
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentsRef = useRef<import("xendit-components-web").XenditComponents | null>(null);
  // Bumped at the start of every `startCardPayment()` call (including the
  // "expired" retry button, which can run while a prior session's async work
  // or event listeners are still pending). Every callback below closes over
  // the generation it was created for and checks it's still current before
  // touching state — so an abandoned session's late `init`/`session-*` event,
  // or a slow `createXenditCardSessionAction`/dynamic import that resolves
  // after a newer attempt already started, can never yank the UI back or
  // overwrite the live widget. A plain `removeEventListener` would only guard
  // the three events we explicitly listen for; this guards every callback.
  const sessionGenerationRef = useRef(0);

  // Tracks whether this component is on screen. Not tied to the generation
  // counter on purpose: React Strict Mode (dev) mounts, runs the cleanup and
  // mounts again, and the auto-start below fires only once per component — so a
  // cleanup that bumped the generation would orphan that one session and leave
  // the form on "Loading card form…" forever.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      componentsRef.current = null;
    };
  }, []);

  const startCardPayment = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    const isCurrent = () => mountedRef.current && generation === sessionGenerationRef.current;

    setError(null);
    setPhase("loading");

    let result:
      | { success: true; data: { componentsSdkKey: string } }
      | { success: false; error: string };
    try {
      result =
        props.orderId !== undefined
          ? await createXenditCardSessionAction(props.orderId)
          : await createXenditGroupCardSessionAction(props.checkoutGroupId);
    } catch {
      // A rejected action (network drop, server error) must not leave the
      // form spinning with no way out.
      if (!isCurrent()) return;
      setError("Could not start the card payment. Please try again.");
      setPhase("error");
      return;
    }
    if (!isCurrent()) return;
    if (!result.success) {
      setError(result.error);
      setPhase("error");
      return;
    }

    try {
      const { XenditComponents } = await import("xendit-components-web");
      if (!isCurrent()) return;
      const components = new XenditComponents({
        componentsSdkKey: result.data.componentsSdkKey,
      });
      componentsRef.current = components;

      components.addEventListener("init", () => {
        if (!isCurrent()) return;
        const channel = components.getActiveChannels({ filter: "CARDS" })[0];
        if (!channel || !containerRef.current) {
          setError("Card payment is not available for this order right now.");
          setPhase("error");
          return;
        }
        const element = components.createChannelComponent(channel);
        containerRef.current.replaceChildren(element);
        setPhase("ready");
      });

      components.addEventListener("session-complete", () => {
        if (!isCurrent()) return;
        setPhase("complete");
        onComplete?.();
      });
      components.addEventListener("session-expired-or-canceled", () => {
        if (!isCurrent()) return;
        setPhase("expired");
      });
    } catch {
      if (!isCurrent()) return;
      setError("Could not load the card payment form. Please try again.");
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props.orderId/props.checkoutGroupId are the discriminated pair; stable per mount, and onComplete is read fresh via closure without needing to restart the whole callback identity.
  }, [props.orderId, props.checkoutGroupId]);

  // Checkout-only: starts the session immediately instead of waiting for a
  // click. Guarded so it only ever fires once per mount even under
  // React Strict Mode's double-invoke.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startCardPayment();
    }
  }, [autoStart, startCardPayment]);

  function handleSubmit() {
    setPhase("submitting");
    componentsRef.current?.submit();
  }

  if (phase === "complete") {
    return (
      <p className="text-sm font-medium text-rj-black">
        Payment submitted — confirming with Xendit. This page will update once confirmed.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(phase === "idle" && !autoStart) || phase === "error" ? (
        <Button type="button" variant="rjOutline" size="rj" onClick={startCardPayment}>
          Pay with Card
        </Button>
      ) : null}
      {phase === "idle" && autoStart ? (
        <p className="text-xs text-rj-gray-600">Preparing your card payment…</p>
      ) : null}
      {phase === "loading" ? <p className="text-xs text-rj-gray-600">Loading card form…</p> : null}
      <div ref={containerRef} />
      {phase === "ready" || phase === "submitting" ? (
        <Button
          type="button"
          variant="rj"
          size="rj"
          isLoading={phase === "submitting"}
          onClick={handleSubmit}
        >
          Pay now
        </Button>
      ) : null}
      {phase === "expired" ? (
        <>
          <p className="text-xs text-rj-red-dark">
            This payment session expired or was cancelled. Try again below.
          </p>
          {/* The retry control the copy above promises — previously missing, so
              "below" rendered nothing and a refresh was the only recovery. */}
          <Button type="button" variant="rjOutline" size="rj" onClick={startCardPayment}>
            Pay with Card
          </Button>
        </>
      ) : null}
      {error ? <p className="text-xs text-rj-red-dark">{error}</p> : null}
    </div>
  );
}
