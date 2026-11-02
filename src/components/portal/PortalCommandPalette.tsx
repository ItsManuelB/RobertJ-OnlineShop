"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useScrollLock } from "@/hooks/useScrollLock";
import { cn } from "@/lib/utils/cn";

import { filterNavItems } from "./portal-nav";
import type { PortalShellConfig } from "./portal.types";

interface PaletteEntry {
  id: string;
  group: "Actions" | "Search" | "Go to";
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

export interface PortalCommandPaletteProps {
  config: PortalShellConfig;
  open: boolean;
  onClose: () => void;
}

/**
 * Ctrl K palette: jump to any page, run the "+ New" action, or search orders and
 * products. Searches hand off to the list pages' own `?search=` filters, so the
 * results are the same ones those pages already show.
 */
export function PortalCommandPalette({ config, open, onClose }: PortalCommandPaletteProps) {
  if (!open) return null;
  return <PaletteDialog config={config} onClose={onClose} />;
}

function PaletteDialog({ config, onClose }: { config: PortalShellConfig; onClose: () => void }) {
  const router = useRouter();
  useScrollLock(true);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusTo.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
    };
  }, []);

  const entries = useMemo<PaletteEntry[]>(() => {
    const term = query.trim();
    const list: PaletteEntry[] = [];
    if (config.createAction && (!term || config.createAction.label.toLowerCase().includes(term.toLowerCase()))) {
      list.push({
        id: "create",
        group: "Actions",
        label: config.createAction.label,
        href: config.createAction.href,
        icon: config.createAction.icon,
      });
    }
    if (term) {
      list.push(
        {
          id: "search-orders",
          group: "Search",
          label: `Orders matching “${term}”`,
          href: `${config.searchRoutes.orders}?search=${encodeURIComponent(term)}`,
          icon: Search,
        },
        {
          id: "search-products",
          group: "Search",
          label: `Products matching “${term}”`,
          href: `${config.searchRoutes.products}?search=${encodeURIComponent(term)}`,
          icon: Search,
        },
      );
    }
    const pages = filterNavItems([...config.groups.flatMap((group) => group.items), config.settings], term);
    for (const page of pages) {
      list.push({ id: `page-${page.href}`, group: "Go to", label: page.label, href: page.href, icon: page.icon });
    }
    return list;
  }, [config, query]);

  const selected = Math.min(active, Math.max(entries.length - 1, 0));

  function go(entry: PaletteEntry | undefined) {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((selected + 1) % Math.max(entries.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((selected - 1 + entries.length) % Math.max(entries.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(entries[selected]);
    } else if (event.key === "Tab") {
      // Keep focus on the field: the list is driven with the arrow keys.
      event.preventDefault();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-3 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump to"
        onKeyDown={onKeyDown}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            maxLength={60}
            placeholder={config.searchHint}
            aria-label="Search orders, products and pages"
            aria-controls="portal-palette-list"
            aria-activedescendant={entries[selected] ? `portal-palette-${entries[selected].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">Esc</kbd>
        </div>

        <ul id="portal-palette-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query.trim()}”.</li>
          ) : (
            entries.map((entry, index) => {
              const showGroup = entries[index - 1]?.group !== entry.group;
              const Icon = entry.icon;
              return (
                <li key={entry.id} role="presentation">
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {entry.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    id={`portal-palette-${entry.id}`}
                    role="option"
                    aria-selected={index === selected}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(entry)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground",
                      index === selected && "bg-primary/10",
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                    {index === selected ? (
                      <CornerDownLeft className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑ ↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
