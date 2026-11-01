"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, MessageSquare, Pin, PinOff, Search } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MessageThreadBody } from "@/features/messages/components/MessageThreadBody";
import {
  listConversationsAction,
  loadConversationAction,
  toggleConversationPinAction,
} from "@/features/messages/actions/message.actions";
import type {
  ConversationContext,
  ConversationSummary,
  OrderMessageView,
} from "@/features/messages/types/message.types";

type InboxFilter = "all" | "unread" | "pinned";

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "pinned", label: "Pinned" },
];

export interface GlobalInboxDockProps {
  /** Renders through the Admin/Seller portal tokens; omit for the buyer view. */
  themed?: boolean;
  /** Server-fetched conversation list (for the badge + first paint). */
  initialConversations: ConversationSummary[];
}

/**
 * Shopee-style global messages inbox: a bottom-right launcher pill (total-unread
 * badge) that expands into a two-pane panel — conversation list (search +
 * All/Unread/Pinned + per-row unread badges + pin) on the left, the selected
 * conversation on the right (reusing `MessageThreadBody`). Each conversation is
 * still one order (ADR-026). Mounted once per surface; a `?chat=<orderId>`
 * query (the order pages' "Message" button) opens it focused on that order.
 */
export function GlobalInboxDock({ themed = false, initialConversations }: GlobalInboxDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    context: ConversationContext;
    messages: OrderMessageView[];
  } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [isPinning, startPinning] = useTransition();
  const minimizeRef = useRef<HTMLButtonElement>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chatParam = searchParams.get("chat");

  const [supabase] = useState(() => createSupabaseBrowserClient());

  // `open` and `selected` are derived so a `?chat=` deep link opens + focuses a
  // conversation without a setState-in-effect: the URL is the source of truth
  // until the user interacts, then local state takes over.
  const open = panelOpen || Boolean(chatParam);
  const selected = selectedState ?? chatParam;

  // Lets the single realtime subscription below read the current selection
  // without re-subscribing every time it changes.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const refreshList = useCallback(() => {
    void listConversationsAction().then((result) => {
      if (result.success) setConversations(result.data);
    });
  }, []);

  const clearChatParam = useCallback(() => {
    if (chatParam) router.replace(pathname, { scroll: false });
  }, [chatParam, pathname, router]);

  const selectConversation = (orderId: string) => {
    setPanelOpen(true);
    setSelectedState(orderId);
    setDetailError(null);
    if (chatParam && chatParam !== orderId) clearChatParam();
  };

  const backToList = () => {
    setSelectedState(null);
    clearChatParam();
  };

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedState(null);
    clearChatParam();
  }, [clearChatParam]);

  const reloadActive = useCallback(
    (orderId: string) => {
      void loadConversationAction(orderId).then((result) => {
        if (result.success) {
          setDetail(result.data);
          refreshList();
        }
      });
    },
    [refreshList],
  );

  // Loads the selected conversation. Every state update happens inside the async
  // resolution (never synchronously in the effect body) and the loading state is
  // derived below — keeping this clear of the no-setState-in-effect rule.
  useEffect(() => {
    if (!selected) return;
    let active = true;
    void loadConversationAction(selected).then((result) => {
      if (!active) return;
      if (result.success) {
        setDetail(result.data);
        setDetailError(null);
        refreshList();
      } else {
        setDetail(null);
        setDetailError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [selected, refreshList]);

  // Fresh list + focus when the panel opens; Escape minimizes. No synchronous
  // setState here (refreshList resolves async; closePanel runs on a key event).
  useEffect(() => {
    if (!open) return;
    refreshList();
    minimizeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, refreshList, closePanel]);

  // Real-time: new messages the viewer is allowed to see (RLS-filtered by
  // `order_messages`' SELECT policy) refresh the list live and, when the matching
  // conversation is open, append in place — no manual refresh. Subscribed once;
  // the handler reads the current selection via `selectedRef`.
  useEffect(() => {
    const channel = supabase
      .channel("order-messages-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages" },
        (payload) => {
          const orderId = (payload.new as { order_id?: string }).order_id;
          refreshList();
          if (orderId && orderId === selectedRef.current) reloadActive(orderId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refreshList, reloadActive]);

  const detailLoading =
    selected != null && detailError == null && (detail?.context.orderId ?? null) !== selected;

  const totalUnread = useMemo(
    () => conversations.reduce((sum, convo) => sum + convo.unreadCount, 0),
    [conversations],
  );
  const badge = (n: number) => (n > 0 ? (n > 99 ? "99+" : String(n)) : null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((convo) => {
      if (filter === "unread" && convo.unreadCount === 0) return false;
      if (filter === "pinned" && !convo.pinned) return false;
      if (q && !`${convo.title} ${convo.orderNumber} ${convo.lastBody ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [conversations, filter, query]);

  const bottom = themed ? "bottom-20 lg:bottom-4" : "bottom-4";
  const accent = themed ? "text-primary" : "text-rj-red";
  const mutedText = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const activeConvo = conversations.find((convo) => convo.orderId === selected) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-expanded={open}
        aria-label="Open messages"
        className={cn(
          "fixed right-4 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          bottom,
          open && "hidden",
          themed
            ? "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40"
            : "bg-rj-red text-rj-white hover:bg-rj-red-dark focus-visible:ring-rj-red/40",
        )}
      >
        <MessageSquare className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>Chat</span>
        {badge(totalUnread) ? (
          <span
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold",
              themed ? "bg-primary-foreground text-primary" : "bg-rj-white text-rj-red",
            )}
          >
            {badge(totalUnread)}
          </span>
        ) : null}
      </button>

      <div
        role="dialog"
        aria-label="Messages"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={cn(
          "fixed right-4 z-40 flex h-[34rem] max-h-[calc(100vh-2rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border shadow-xl transition-all duration-200 ease-out motion-reduce:transition-none sm:w-[40rem]",
          bottom,
          themed ? "border-border bg-card" : "border-rj-gray-200 bg-rj-white",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-b px-4 py-3",
            themed ? "border-border" : "border-rj-gray-100",
          )}
        >
          <p className={cn("flex items-center gap-1.5 text-sm font-bold", accent)}>
            <span>Chat</span>
            {badge(totalUnread) ? (
              <span className={cn("text-xs font-semibold", mutedText)}>({badge(totalUnread)})</span>
            ) : null}
          </p>
          <button
            ref={minimizeRef}
            type="button"
            onClick={closePanel}
            aria-label="Minimize chat"
            className={cn(
              "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2",
              themed
                ? "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary/30"
                : "text-rj-gray-500 hover:bg-rj-gray-100 hover:text-rj-black focus-visible:ring-rj-red/30",
            )}
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* List pane — hidden on phones once a conversation is open. */}
          <div
            className={cn(
              "min-h-0 w-full flex-col sm:flex sm:w-64 sm:shrink-0 sm:border-r",
              themed ? "sm:border-border" : "sm:border-rj-gray-100",
              selected ? "hidden sm:flex" : "flex",
            )}
          >
            <div className={cn("flex flex-col gap-2 border-b p-3", themed ? "border-border" : "border-rj-gray-100")}>
              <div className="relative">
                <Search
                  className={cn("pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2", mutedText)}
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name"
                  aria-label="Search conversations"
                  className={cn(
                    "w-full rounded-md border py-1.5 pl-8 pr-2 text-sm outline-none transition-colors",
                    themed
                      ? "border-border bg-background text-foreground focus-visible:border-foreground"
                      : "border-rj-gray-200 bg-rj-white text-rj-black focus-visible:border-rj-black",
                  )}
                />
              </div>
              <div className="flex gap-1">
                {FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                      filter === key
                        ? themed
                          ? "bg-primary text-primary-foreground"
                          : "bg-rj-red text-rj-white"
                        : themed
                          ? "bg-muted text-muted-foreground hover:text-foreground"
                          : "bg-rj-gray-100 text-rj-gray-600 hover:text-rj-black",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <li className={cn("px-3 py-6 text-center text-sm", mutedText)}>
                  {conversations.length === 0 ? "No conversations yet." : "No matches."}
                </li>
              ) : (
                visible.map((convo) => (
                  <li key={convo.orderId}>
                    <button
                      type="button"
                      onClick={() => selectConversation(convo.orderId)}
                      aria-current={convo.orderId === selected}
                      className={cn(
                        "flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors",
                        themed ? "border-border" : "border-rj-gray-100",
                        convo.orderId === selected
                          ? themed
                            ? "bg-muted"
                            : "bg-rj-gray-50"
                          : themed
                            ? "hover:bg-muted/60"
                            : "hover:bg-rj-gray-50",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {convo.pinned ? (
                            <Pin className={cn("h-3 w-3 shrink-0", mutedText)} aria-hidden="true" />
                          ) : null}
                          <p className={cn("truncate text-sm font-bold", themed ? "text-foreground" : "text-rj-black")}>
                            {convo.title}
                          </p>
                        </div>
                        <p className={cn("truncate text-xs", mutedText)}>
                          {convo.lastBody ?? "No messages yet"}
                        </p>
                        <p className={cn("truncate text-[10px]", themed ? "text-muted-foreground/70" : "text-rj-gray-400")}>
                          {convo.orderNumber}
                        </p>
                      </div>
                      {badge(convo.unreadCount) ? (
                        <span
                          className={cn(
                            "mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                            themed ? "bg-primary text-primary-foreground" : "bg-rj-red text-rj-white",
                          )}
                        >
                          {badge(convo.unreadCount)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Detail pane — hidden on phones until a conversation is picked. */}
          <div className={cn("min-h-0 flex-1 flex-col", selected ? "flex" : "hidden sm:flex")}>
            {selected && (detail || detailLoading || detailError) ? (
              <>
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 border-b px-3 py-2",
                    themed ? "border-border" : "border-rj-gray-100",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={backToList}
                      aria-label="Back to conversations"
                      className={cn("rounded p-1 sm:hidden", mutedText)}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-bold", themed ? "text-foreground" : "text-rj-black")}>
                        {detail?.context ? (detail.context.viewerIsBuyer ? detail.context.shopName : detail.context.buyerName) : activeConvo?.title}
                      </p>
                      <p className={cn("truncate text-[10px]", mutedText)}>
                        {detail?.context.orderNumber ?? activeConvo?.orderNumber}
                      </p>
                    </div>
                  </div>
                  {activeConvo ? (
                    <button
                      type="button"
                      disabled={isPinning}
                      onClick={() =>
                        startPinning(async () => {
                          const result = await toggleConversationPinAction(activeConvo.orderId, !activeConvo.pinned);
                          if (result.success) refreshList();
                        })
                      }
                      aria-label={activeConvo.pinned ? "Unpin conversation" : "Pin conversation"}
                      className={cn(
                        "rounded p-1 transition-colors disabled:opacity-50",
                        themed ? "text-muted-foreground hover:text-foreground" : "text-rj-gray-500 hover:text-rj-black",
                      )}
                    >
                      {activeConvo.pinned ? (
                        <PinOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Pin className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  ) : null}
                </div>

                {detailLoading ? (
                  <div className={cn("flex flex-1 items-center justify-center text-sm", mutedText)}>Loading…</div>
                ) : detailError ? (
                  <div className={cn("flex flex-1 items-center justify-center px-4 text-center text-sm", mutedText)}>
                    {detailError}
                  </div>
                ) : detail ? (
                  <MessageThreadBody
                    key={detail.context.orderId}
                    orderId={detail.context.orderId}
                    messages={detail.messages}
                    themed={themed}
                    className="min-h-0 flex-1 p-3"
                    listClassName="min-h-0 flex-1"
                    onSent={() => reloadActive(detail.context.orderId)}
                  />
                ) : null}
              </>
            ) : (
              <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center", mutedText)}>
                <MessageSquare className="h-10 w-10 opacity-40" aria-hidden="true" />
                <p className="text-sm font-semibold">Your messages</p>
                <p className="text-xs">Select a conversation to start chatting.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
