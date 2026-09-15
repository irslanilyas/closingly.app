"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Search,
  Columns3,
  Mic,
  Send,
  Loader2,
  CornerDownLeft,
  LayoutDashboard,
  LineChart,
  Settings2,
  ArrowRight,
} from "lucide-react";

interface Hit {
  type: "deal" | "meeting" | "proposal" | "follow_up";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const ICONS = {
  deal: Columns3,
  meeting: Mic,
  proposal: Columns3,
  follow_up: Send,
} as const;

const GROUP_LABELS: Record<Hit["type"], string> = {
  deal: "Deals",
  meeting: "Meetings",
  proposal: "Proposals",
  follow_up: "Follow-ups",
};

/**
 * Where you can go, offered before you type anything.
 *
 * An empty search box that does nothing until you type is a wasted surface,
 * and this is the one panel people open with the keyboard from anywhere in the
 * product. Showing the destinations turns it into a way to move around rather
 * than only a way to look things up.
 */
const JUMPS = [
  { label: "Dashboard", href: "/", Icon: LayoutDashboard },
  { label: "Calls", href: "/meetings", Icon: Mic },
  { label: "Pipeline", href: "/pipeline", Icon: Columns3 },
  { label: "Follow-ups", href: "/follow-ups", Icon: Send },
  { label: "Intelligence", href: "/intelligence", Icon: LineChart },
  { label: "Account", href: "/settings", Icon: Settings2 },
];

/** Long enough that typing a client name doesn't fire six queries. */
const DEBOUNCE_MS = 180;

/**
 * Search, opened with the key everyone already tries.
 *
 * A modal rather than an inline field: the field would sit empty in the topbar
 * on every screen for the ninety-nine percent of time nobody is searching, and
 * an always-visible empty input is the most reliable way to make a product
 * look like a template.
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Stored with the query they answered, so "results" and "still loading" are
  // both derived from render rather than kept in sync by hand.
  const [rawHits, setRawHits] = useState<{ query: string; hits: Hit[] }>({
    query: "",
    hits: [],
  });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing clears here rather than in an effect watching `open`: the reset is
  // a consequence of the action, not of the state changing, and doing it in an
  // effect means an extra render pass on every close.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRawHits({ query: "", hits: [] });
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => {
          if (v) {
            setQuery("");
            setRawHits({ query: "", hits: [] });
            setActive(0);
          }
          return !v;
        });
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // A timer rather than requestAnimationFrame: rAF does not fire in a
    // background or unpainted tab, which would open the dialog with nothing
    // focused and swallow the first thing the person types.
    const id = setTimeout(() => inputRef.current?.focus(), 0);

    return () => {
      clearTimeout(id);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const search = useCallback(async (q: string) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { hits: Hit[] };
    return body.hits;
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    // Too short to search. Both the results and the spinner are derived from
    // this below rather than written back into state.
    if (trimmed.length < 2) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      search(trimmed).then((next) => {
        if (cancelled) return;
        setRawHits({ query: trimmed, hits: next });
        setActive(0);
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const trimmed = query.trim();
  const tooShort = trimmed.length < 2;
  const hits = !tooShort && rawHits.query === trimmed ? rawHits.hits : [];
  const loading = !tooShort && rawHits.query !== trimmed;

  const goTo = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [router, close],
  );

  // Arrow keys walk the results when searching, and the destinations when not,
  // so Enter always does the obvious thing.
  const navigable = tooShort
    ? JUMPS.map((j) => j.href)
    : hits.map((h) => h.href);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (navigable.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % navigable.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + navigable.length) % navigable.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      goTo(navigable[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-8 items-center gap-2 rounded-lg border border-border bg-card pl-2.5 pr-2 text-[12.5px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        <Search className="size-3.5" strokeWidth={1.7} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-1 hidden rounded border border-border bg-secondary px-1.5 py-px font-mono text-[10px] leading-[1.4] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Portalled to the body on purpose. This component renders inside the
          topbar, and that header is `sticky z-20` with a `backdrop-blur` on
          it. A backdrop-filter creates a containing block for fixed
          descendants, so an overlay rendered in place sizes itself to the
          header rather than the viewport, and its z-index competes inside the
          header stacking context — where the rail's z-30 wins. The result was
          a backdrop that covered neither the rail nor the full page, and
          clicks on what looked like empty space landing on the rail instead of
          the overlay. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div
              className="absolute inset-0 bg-foreground/35 backdrop-blur-[3px] resolve"
              onClick={close}
            />

            <div className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-[0_2px_4px_oklch(0.215_0.012_90/0.06),0_24px_56px_-12px_oklch(0.215_0.012_90/0.28)] warm-in">
              <div className="flex items-center gap-2.5 border-b border-border px-4">
                {loading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.7}
                  />
                )}
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search clients, calls and follow-ups"
                  className="h-[46px] flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="shrink-0 rounded px-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="max-h-[min(420px,52vh)] overflow-y-auto scrollbar-thin py-1.5">
                {tooShort ? (
                  <Jumps active={active} onPick={goTo} onHover={setActive} />
                ) : hits.length === 0 && !loading ? (
                  <p className="px-4 py-7 text-center text-[12.5px] leading-relaxed text-muted-foreground">
                    Nothing matches &ldquo;{trimmed}&rdquo;.
                    <br />
                    <span className="text-muted-foreground/70">
                      Try a company name, or part of what the call was about.
                    </span>
                  </p>
                ) : (
                  <Results
                    hits={hits}
                    active={active}
                    onPick={goTo}
                    onHover={setActive}
                  />
                )}
              </div>

              <div className="flex items-center gap-3.5 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <Hint
                  keys={<CornerDownLeft className="size-3" strokeWidth={1.8} />}
                >
                  open
                </Hint>
                <Hint keys="↑↓">move</Hint>
                <Hint keys="esc">close</Hint>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Hint({
  keys,
  children,
}: {
  keys: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="grid h-[17px] min-w-[17px] place-items-center rounded border border-border bg-secondary px-1 font-mono text-[10px] leading-none text-muted-foreground">
        {keys}
      </kbd>
      {children}
    </span>
  );
}

function Row({
  Icon,
  title,
  subtitle,
  activeRow,
  onPick,
  onHover,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string | null;
  activeRow: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        activeRow ? "bg-secondary" : "hover:bg-secondary/60",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          activeRow ? "text-brand" : "text-muted-foreground",
        )}
        strokeWidth={1.6}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{title}</span>
        {subtitle && (
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {activeRow && (
        <ArrowRight
          className="size-3 shrink-0 text-muted-foreground"
          strokeWidth={1.8}
        />
      )}
    </button>
  );
}

function Jumps({
  active,
  onPick,
  onHover,
}: {
  active: number;
  onPick: (href: string) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div>
      <div className="label px-4 pb-1 pt-1.5">Go to</div>
      {JUMPS.map((jump, index) => (
        <Row
          key={jump.href}
          Icon={jump.Icon}
          title={jump.label}
          activeRow={index === active}
          onPick={() => onPick(jump.href)}
          onHover={() => onHover(index)}
        />
      ))}
    </div>
  );
}

function Results({
  hits,
  active,
  onPick,
  onHover,
}: {
  hits: Hit[];
  active: number;
  onPick: (href: string) => void;
  onHover: (index: number) => void;
}) {
  const groups: Array<{
    type: Hit["type"];
    items: Array<{ hit: Hit; index: number }>;
  }> = [];

  hits.forEach((hit, index) => {
    const group = groups.find((g) => g.type === hit.type);
    if (group) group.items.push({ hit, index });
    else groups.push({ type: hit.type, items: [{ hit, index }] });
  });

  return (
    <div>
      {groups.map((group) => (
        <div key={group.type}>
          <div className="label px-4 pb-1 pt-1.5">
            {GROUP_LABELS[group.type]}
          </div>
          {group.items.map(({ hit, index }) => (
            <Row
              key={`${hit.type}-${hit.id}`}
              Icon={ICONS[hit.type]}
              title={hit.title}
              subtitle={hit.subtitle}
              activeRow={index === active}
              onPick={() => onPick(hit.href)}
              onHover={() => onHover(index)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
