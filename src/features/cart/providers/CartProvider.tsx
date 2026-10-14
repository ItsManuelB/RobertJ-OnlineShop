"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addToCartAction,
  clearCartAction,
  getMyCartAction,
  mergeGuestCartAction,
  removeCartItemAction,
  removeManyCartItemsAction,
  updateCartItemQuantityAction,
} from "@/features/cart/actions/cart.actions";
import {
  cartReducer,
  getCartLineKey,
  getCartTotals,
  initialCartState,
} from "@/features/cart/utils/cart-reducer";
import type {
  CartAddResult,
  CartItem,
  CartLineRef,
  CartState,
} from "@/features/cart/types/cart.types";
// Type-only — `queries.ts` is `server-only`; the type import is erased at
// compile time, same pattern CartSummary.tsx already uses for
// `CartAvailabilityEntry`.
import type { CartLineItem, MergeGuestCartResult } from "@/lib/supabase/queries";

/**
 * Pre-fix key: every account on a shared browser wrote/read this single
 * bucket, so signing out and a different account signing in would inherit
 * whatever cart was last saved here. Kept only as a one-time migration
 * source for the guest bucket below — see `readCartForIdentity`.
 *
 * Phase 2C note: `localStorage` is now exclusively the **guest** cart's
 * storage. An authenticated identity's cart lives in Supabase
 * (`carts`/`cart_items`, via the Phase 2B Server Actions imported above) —
 * `getCartStorageKey`/`readCartForIdentity` below are still written to accept
 * a `userId`, unchanged from Phase A, but are only ever invoked with `null`
 * now; the per-user buckets they can still address (`roberj.cart.v1:<uuid>`)
 * are dead going forward, left untouched on disk (no migration this phase).
 */
const LEGACY_STORAGE_KEY = "roberj.cart.v1";

/** Identity-scoped bucket: one real account gets its own key, every signed-out visitor shares "guest". */
function getCartStorageKey(userId: string | null): string {
  return userId ? `${LEGACY_STORAGE_KEY}:${userId}` : `${LEGACY_STORAGE_KEY}:guest`;
}

/**
 * Reads one identity's cart. Only the guest bucket may absorb the old
 * unscoped `roberj.cart.v1` cart, and only the first time it's read (before
 * the guest bucket itself has ever been written) — that legacy data was
 * already shared by every account on this browser before this fix shipped,
 * so folding it into "guest" strictly narrows its exposure and can never
 * hand it to a specific, newly authenticated account. The legacy key is
 * consumed (removed) as soon as it's read, migrated or not, so it can never
 * be read again later by a different identity.
 */
function readCartForIdentity(userId: string | null): CartState {
  if (typeof window === "undefined") return initialCartState;

  const storageKey = getCartStorageKey(userId);
  const raw = window.localStorage.getItem(storageKey);
  if (raw) {
    try {
      return JSON.parse(raw) as CartState;
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialCartState;
    }
  }

  if (userId === null) {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw !== null) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      try {
        const migrated = JSON.parse(legacyRaw) as CartState;
        window.localStorage.setItem(storageKey, legacyRaw);
        return migrated;
      } catch {
        return initialCartState;
      }
    }
  }

  return initialCartState;
}

/**
 * Upper bound used only as the initial display ceiling for a line hydrated
 * from the authenticated cart — `cart_items` deliberately stores no
 * price/stock (Phase 2A/2B), so there is no server-known "max" to carry over
 * verbatim. This is corrected the same way it already is for every guest
 * line: `CartSummary`'s existing live availability check (unchanged) calls
 * `updateItem({ maxQuantity: live.quantity })` the moment it finds a real
 * ceiling, exactly as before this phase.
 */
const UNVALIDATED_MAX_QUANTITY = 999;

/** Maps a server-authoritative cart line onto the same `CartItem` shape every consumer already expects. */
function toCartItem(line: CartLineItem): CartItem {
  return {
    productId: line.productId,
    variantId: line.variantId ?? undefined,
    variantLabel: line.variantLabel,
    slug: line.productSlug,
    title: line.productTitle,
    imageUrl: line.imageUrl,
    unitPriceCents: line.unitPriceCents,
    currency: line.currency,
    quantity: line.quantity,
    maxQuantity: UNVALIDATED_MAX_QUANTITY,
    sellerId: line.sellerId,
    sellerName: line.sellerName,
  };
}

/**
 * Copy for the one-time "we merged your guest cart" banner. `null` when
 * there's nothing worth telling the buyer — either nothing merged, or
 * everything failed (a failed line just doesn't appear, same as any other
 * unavailable line elsewhere in the cart; no need to call it out here too).
 */
function buildMergeNotice(result: MergeGuestCartResult): string | null {
  if (result.mergedCount <= 0) return null;
  const itemWord = result.mergedCount === 1 ? "item" : "items";
  return `We added ${result.mergedCount} ${itemWord} from your browsing to your cart.`;
}

export interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItem) => void;
  /**
   * Like `addItem`, but waits for the outcome and validates stock first (the
   * quantity already in the cart counts toward the limit), so the caller can
   * show a precise message instead of the cart silently clamping or ignoring
   * the request. The signed-in path is validated again on the server.
   */
  addItemChecked: (item: CartItem) => Promise<CartAddResult>;
  removeItem: (ref: CartLineRef) => void;
  /** Removes several lines at once — used by checkout to clear only placed items. */
  removeMany: (refs: CartLineRef[]) => void;
  setQuantity: (ref: CartLineRef, quantity: number) => void;
  /** Applies a server-confirmed price/stock correction to one line (user-triggered only). */
  updateItem: (
    ref: CartLineRef,
    patch: Partial<Pick<CartItem, "unitPriceCents" | "maxQuantity">>,
  ) => void;
  clear: () => void;
  /** Selective checkout (cart page checkboxes), keyed by `getCartLineKey`.
   * Ephemeral UI state, not persisted to localStorage — new lines default to
   * selected. */
  selectedIds: ReadonlySet<string>;
  toggleSelected: (lineKey: string) => void;
  setSelected: (lineKeys: string[], selected: boolean) => void;
  /** Set once, right after a guest cart was merged into a newly authenticated account's cart — null otherwise. */
  mergeNotice: string | null;
  dismissMergeNotice: () => void;
}

export const CartContext = createContext<CartContextValue | null>(null);

/** Holds cart state client-side, scoped to the signed-in identity, and mirrors it to localStorage. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  // Skips exactly the first run of the persist effect below. Without this,
  // both effects fire in the same pass on mount: the hydrate effect reads
  // localStorage and *schedules* a "hydrate" dispatch (async — it doesn't
  // update `state` until the next render), while the persist effect, in that
  // same pass, still closes over the pre-hydration (empty) `state` and
  // immediately writes `{items:[]}` back — permanently clobbering the real
  // cart before the hydrate dispatch's re-render ever lands. Guest carts were
  // being silently wiped on every hard page load. A ref (not state) is
  // deliberate here: flipping it doesn't need to trigger a re-render, it only
  // needs to be readable — the effect already re-runs on its own once the
  // hydrate dispatch changes `state`.
  const isFirstPersist = useRef(true);

  // The identity currently reflected in `state` — `undefined` means "not
  // resolved yet" (still the empty SSR-safe placeholder), so the very first
  // resolution below always hydrates, same as the old mount-only effect did.
  // A ref, not state: switching identity must replace `state` in the very
  // same dispatch that notices the change, not trigger an extra render first.
  const loadedUserId = useRef<string | null | undefined>(undefined);
  // Mirrors `loadedUserId.current`, kept in sync wherever that ref is
  // written — refs can't be read during render (react-hooks/refs), so the
  // `useMemo` below reads this instead when it needs to know whether the
  // authenticated or guest mutators apply. The ref remains the source of
  // truth for the synchronous, cross-async-boundary checks inside
  // `syncIdentity`/`refreshAuthenticatedCart` (state updates are batched and
  // not guaranteed to be visible mid-callback the way a ref write is).
  const [currentUserId, setCurrentUserId] = useState<string | null | undefined>(undefined);
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const pathname = usePathname();

  // Maps a line's `productId`+`variantId` key to its `cart_items.id` — the
  // authenticated Server Actions (Phase 2B) mutate by that DB id, not by
  // product/variant, so this is the sole place that translation happens.
  // Populated every time the authenticated cart is (re)loaded from the
  // server; never read for the guest path. A ref, not state: it's a lookup
  // table for the mutators below, not something that should trigger a
  // render on its own.
  const cartItemIdByLineKey = useRef<Map<string, string>>(new Map());

  // Set once, right after syncIdentity merges a leftover guest cart into a
  // newly (or already) authenticated identity's cart — see syncIdentity.
  // Plain state (not a ref): this drives UI, so it must trigger a render.
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);

  /** Replaces `state` with the server's cart, and refreshes the id lookup table used by the authenticated mutators. */
  function applyServerCart(items: CartLineItem[]) {
    const nextMap = new Map<string, string>();
    for (const line of items) {
      nextMap.set(
        getCartLineKey({ productId: line.productId, variantId: line.variantId ?? undefined }),
        line.id,
      );
    }
    cartItemIdByLineKey.current = nextMap;
    dispatch({ type: "hydrate", state: { items: items.map(toCartItem) } });
  }

  /**
   * Re-fetches the authenticated cart after a mutation and reconciles local
   * state to it — rather than reconciling the mutation's own response
   * in-place, since the server's `addCartItem` may have merged into an
   * existing line (returning that line's new *total* quantity, not a delta)
   * and the client reducer has no "set this line's total outright, or
   * insert it if new" primitive without changing the reducer, which this
   * phase must not do. A full refetch is the simplest way to guarantee
   * `state` is always an exact mirror of the server, with zero risk of
   * double-counting. On failure, `state` is left exactly as it was — no
   * optimistic change was ever applied here to roll back.
   */
  async function refreshAuthenticatedCart() {
    const result = await getMyCartAction();
    if (!result.success) return;
    if (loadedUserId.current === null || loadedUserId.current === undefined) return;
    applyServerCart(result.data);
  }

  /**
   * Swaps `state` to the given identity's cart — a no-op if that identity is
   * already loaded. Guest resolution is synchronous (`localStorage`), so it
   * hydrates directly. Authenticated resolution is async (a Server Action
   * round trip): `state` is cleared *before* that request is even sent, so
   * the previous identity's items are never rendered while the new
   * identity's cart is being fetched — not even for one frame.
   *
   * Whenever this resolves to a real authenticated `userId` — whether that's
   * a guest signing in this session, or an already-signed-in visitor whose
   * browser still has a leftover guest cart from a past anonymous visit,
   * both look identical from here — a non-empty guest bucket is merged in
   * first. The merge request is awaited *before* the guest bucket is
   * cleared: if it fails outright (network error), the guest cart must not
   * be lost, and since this function only ever resolves a given identity
   * once per mount, a fresh page load naturally retries — no extra retry
   * logic needed. A known, accepted residual limitation: two tabs signing in
   * at the same moment could both attempt the merge before either clears the
   * bucket, double-counting the affected lines — low severity (the buyer can
   * just adjust the quantity, same as any other cart line) and not worth a
   * distributed lock for this scope.
   */
  async function syncIdentity(userId: string | null) {
    if (loadedUserId.current === userId) return;
    loadedUserId.current = userId;
    setCurrentUserId(userId);

    if (userId === null) {
      dispatch({ type: "hydrate", state: readCartForIdentity(null) });
      return;
    }

    dispatch({ type: "hydrate", state: initialCartState });

    const guestCart = readCartForIdentity(null);
    if (guestCart.items.length > 0) {
      const mergeResult = await mergeGuestCartAction({
        items: guestCart.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      });
      if (loadedUserId.current !== userId) return; // identity changed again mid-flight
      if (mergeResult.success) {
        window.localStorage.removeItem(getCartStorageKey(null));
        const notice = buildMergeNotice(mergeResult.data);
        if (notice) setMergeNotice(notice);
      }
    }

    const result = await getMyCartAction();
    if (loadedUserId.current !== userId) return; // identity changed again mid-flight
    if (result.success) applyServerCart(result.data);
  }

  // Selective checkout: which lines are currently checked on the cart page.
  // Kept out of `state`/localStorage on purpose — it's ephemeral UI, not
  // persisted cart data. `knownIds` lets the reconciliation effect tell "a
  // line that just appeared" (default it to selected) apart from "a line the
  // buyer already deliberately deselected" (leave it alone).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(state.items.map((item) => getCartLineKey(item)));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (currentIds.has(id)) next.add(id);
      for (const id of currentIds) if (!knownIds.current.has(id)) next.add(id);
      return next;
    });
    knownIds.current = currentIds;
  }, [state.items]);

  // Resolves the current identity once on mount, then reacts to every
  // subsequent sign-in/sign-out/account-switch the Supabase client notices
  // (including cross-tab) for as long as the app stays mounted. `getUser()`
  // is the network-verified check — this is the same "authoritative session"
  // source the server already treats as the source of truth, just read from
  // the browser client instead of `createSupabaseServerClient()`.
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) void syncIdentity(data.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncIdentity(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // signInAction/signOutAction change the session through a *server-side*
  // Supabase client and then redirect() to a different route — a signal
  // `onAuthStateChange` isn't guaranteed to pick up immediately, since it
  // never touched the browser client directly. Re-verifying on every
  // navigation closes that gap: sign-in and sign-out both always land on a
  // different pathname, so this is guaranteed to run right after either.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) void syncIdentity(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (isFirstPersist.current) {
      isFirstPersist.current = false;
      return;
    }
    // Not resolved yet — nothing authoritative to key the write by. In
    // practice this only guards an early cart mutation racing the very
    // first getUser() call; the next resolved identity's hydrate dispatch
    // (see syncIdentity) immediately supersedes state either way.
    if (loadedUserId.current === undefined) return;
    // Authenticated: the database is the source of truth (Phase 2B Server
    // Actions already persisted whatever mutation produced this `state` —
    // see the authenticated branches below); never mirror it back to
    // localStorage, or a stale per-account bucket would resurface exactly
    // the cross-device drift this phase exists to fix.
    if (loadedUserId.current !== null) return;
    window.localStorage.setItem(getCartStorageKey(null), JSON.stringify(state));
  }, [state]);

  const value = useMemo<CartContextValue>(() => {
    const { itemCount, subtotalCents } = getCartTotals(state);
    /** `true` only once a real, signed-in identity has been resolved — guest and "not yet resolved" both fall through to the local reducer. */
    const isAuthenticated = typeof currentUserId === "string";

    return {
      items: state.items,
      itemCount,
      subtotalCents,
      addItem: (item) => {
        if (isAuthenticated) {
          void addToCartAction({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          }).then((result) => {
            if (result.success) void refreshAuthenticatedCart();
          });
          return;
        }
        dispatch({ type: "add", item });
      },
      addItemChecked: async (item) => {
        // The signed-in cart is validated against live stock by the server (the
        // caller's `maxQuantity` is only a hint there), so only a guest line,
        // which lives in the browser, is checked here.
        if (!isAuthenticated) {
          const existing = state.items.find(
            (line) => line.productId === item.productId && line.variantId === item.variantId,
          );
          const alreadyInCart = existing?.quantity ?? 0;
          if (item.maxQuantity <= 0) {
            return { success: false, error: "This item is sold out." };
          }
          if (alreadyInCart + item.quantity > item.maxQuantity) {
            return {
              success: false,
              error:
                alreadyInCart > 0
                  ? `You already have ${alreadyInCart} in your cart. Only ${item.maxQuantity} available in total.`
                  : `Only ${item.maxQuantity} available.`,
            };
          }
        }
        if (isAuthenticated) {
          const result = await addToCartAction({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          });
          if (!result.success) return { success: false, error: result.error };
          await refreshAuthenticatedCart();
          return { success: true, quantityInCart: result.data.quantity };
        }
        dispatch({ type: "add", item });
        const inCart = state.items.find(
          (line) => line.productId === item.productId && line.variantId === item.variantId,
        )?.quantity ?? 0;
        return { success: true, quantityInCart: inCart + item.quantity };
      },
      removeItem: (ref) => {
        if (isAuthenticated) {
          const cartItemId = cartItemIdByLineKey.current.get(getCartLineKey(ref));
          if (cartItemId) {
            void removeCartItemAction({ cartItemId }).then((result) => {
              if (result.success) void refreshAuthenticatedCart();
            });
          }
          return;
        }
        dispatch({ type: "remove", ...ref });
      },
      removeMany: (refs) => {
        if (isAuthenticated) {
          const cartItemIds = refs
            .map((ref) => cartItemIdByLineKey.current.get(getCartLineKey(ref)))
            .filter((id): id is string => Boolean(id));
          if (cartItemIds.length > 0) {
            void removeManyCartItemsAction({ cartItemIds }).then((result) => {
              if (result.success) void refreshAuthenticatedCart();
            });
          }
          return;
        }
        dispatch({ type: "removeMany", lines: refs });
      },
      setQuantity: (ref, quantity) => {
        if (isAuthenticated) {
          const cartItemId = cartItemIdByLineKey.current.get(getCartLineKey(ref));
          if (cartItemId) {
            const request =
              quantity <= 0
                ? removeCartItemAction({ cartItemId })
                : updateCartItemQuantityAction({ cartItemId, quantity });
            void request.then((result) => {
              if (result.success) void refreshAuthenticatedCart();
            });
          }
          return;
        }
        dispatch({ type: "setQuantity", ...ref, quantity });
      },
      // Server-confirmed price/stock display correction only — cart_items
      // stores neither (Phase 2A/2B; price/stock are always resolved live),
      // so there is nothing to persist server-side here for either identity.
      updateItem: (ref, patch) =>
        dispatch({ type: "updateItem", ...ref, patch }),
      clear: () => {
        if (isAuthenticated) {
          void clearCartAction().then((result) => {
            if (result.success) void refreshAuthenticatedCart();
          });
          return;
        }
        dispatch({ type: "clear" });
      },
      selectedIds,
      toggleSelected: (lineKey) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(lineKey)) next.delete(lineKey);
          else next.add(lineKey);
          return next;
        }),
      setSelected: (lineKeys, selected) =>
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of lineKeys) {
            if (selected) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      mergeNotice,
      dismissMergeNotice: () => setMergeNotice(null),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selectedIds, currentUserId, mergeNotice]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
