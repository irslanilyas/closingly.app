"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, Check, Copy, Eye } from "lucide-react";

interface Analytics {
  total_views: number;
  unique_viewers: number;
  last_viewed_at: string | null;
  total_seconds: number;
  average_seconds: number;
  sections: Array<{ section: string; count: number }>;
}

export function SharePanel({
  proposalId,
  shareToken,
  onTokenChange,
}: {
  proposalId: string;
  shareToken: string | null;
  onTokenChange: (token: string | null) => void;
}) {
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${shareToken}`
    : null;

  const loadAnalytics = useCallback(async () => {
    const res = await fetch(`/api/proposals/${proposalId}/analytics`);
    if (res.ok) setAnalytics(await res.json());
  }, [proposalId]);

  useEffect(() => {
    if (shareToken) loadAnalytics();
  }, [shareToken, loadAnalytics]);

  const createLink = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      onTokenChange(body.token);
      toast.success("Share link ready.");
    } catch {
      toast.error("Couldn't create the link.");
    } finally {
      setWorking(false);
    }
  };

  const revoke = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onTokenChange(null);
      setAnalytics(null);
      toast.success("Link revoked. Anyone holding it now sees a 404.");
    } catch {
      toast.error("Couldn't revoke the link.");
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!shareToken) {
    return (
      <div className="rounded-md border border-border px-4 py-4">
        <div className="text-[13.5px] font-medium">Share with your client</div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          Creates a link anyone can open — no account needed. You&rsquo;ll see
          when they read it and which sections they spent time on.
        </p>
        <Button
          onClick={createLink}
          disabled={working}
          className="mt-4 h-9 text-[12.5px] gap-2 bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer"
        >
          <Link2 className="size-3.5" strokeWidth={1.5} />
          {working ? "Creating…" : "Create share link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border divide-y divide-border">
      <div className="px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
          Share link
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-sm bg-secondary/60 px-2.5 py-1.5 text-[12px] font-mono">
            {shareUrl}
          </code>
          <Button
            onClick={copy}
            variant="outline"
            className="h-8 gap-1.5 text-[12px] shrink-0 cursor-pointer"
          >
            {copied ? (
              <Check className="size-3" strokeWidth={2} />
            ) : (
              <Copy className="size-3" strokeWidth={1.5} />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <button
          type="button"
          onClick={revoke}
          disabled={working}
          className="mt-3 text-[12px] text-muted-foreground hover:text-destructive transition-colors"
        >
          Revoke link
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 font-medium">
          Engagement
        </div>

        {!analytics || analytics.total_views === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Eye className="size-3.5" strokeWidth={1.5} />
            Not opened yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Opened" value={`${analytics.total_views}×`} />
              <Stat
                label="Readers"
                value={String(analytics.unique_viewers || 1)}
              />
              <Stat
                label="Avg. time"
                value={formatDuration(analytics.average_seconds)}
              />
            </div>

            {analytics.last_viewed_at && (
              <div className="mt-3 text-[12px] text-muted-foreground">
                Last opened{" "}
                {new Date(analytics.last_viewed_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}

            {analytics.sections.length > 0 && (
              <div className="mt-4">
                <div className="text-[11.5px] text-muted-foreground mb-2">
                  Sections read
                </div>
                <div className="space-y-1.5">
                  {analytics.sections.map((s) => (
                    <div
                      key={s.section}
                      className="flex items-center gap-3 text-[12.5px]"
                    >
                      <span className="w-[110px] shrink-0 capitalize">
                        {s.section.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--accent-sage)]"
                          style={{
                            width: `${(s.count / analytics.total_views) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-muted-foreground tabular-nums">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[17px] font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
