"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShellClient } from "@/components/app-shell-client";
import { ProposalDocument } from "@/components/proposal/proposal-document";
import { SharePanel } from "@/components/proposal/share-panel";
import {
  TemplatePicker,
  type TemplateOption,
} from "@/components/proposal/template-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { coerceTheme, DEFAULT_THEME } from "@/lib/proposal-theme";
import type { ProposalData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Sparkles, History, ArrowLeft, RotateCcw } from "lucide-react";

interface Loaded {
  id: string;
  deal_id: string;
  proposal_data: ProposalData;
  status: string;
  share_token: string | null;
  template_id: string | null;
  templates: { design: unknown } | null;
  profiles: { full_name: string | null; email: string | null } | null;
  deals: { client_name: string | null; client_company: string | null } | null;
}

interface Version {
  id: string;
  change_summary: string | null;
  created_by: "ai" | "user";
  created_at: string;
}

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [proposal, setProposal] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [changedKeys, setChangedKeys] = useState<string[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("proposals")
      .select(
        "id, deal_id, proposal_data, status, share_token, template_id, templates(design), profiles(full_name, email), deals(client_name, client_company)"
      )
      .eq("id", id)
      .single();

    if (data) setProposal(data as unknown as Loaded);
    setLoading(false);
  }, [id]);

  const loadVersions = useCallback(async () => {
    const res = await fetch(`/api/proposals/${id}/versions`);
    if (res.ok) setVersions((await res.json()).versions);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Highlighting a refined field is a nudge, not a permanent state.
  useEffect(() => {
    if (changedKeys.length === 0) return;
    const timer = setTimeout(() => setChangedKeys([]), 6000);
    return () => clearTimeout(timer);
  }, [changedKeys]);

  const save = async (next: ProposalData) => {
    setProposal((p) => (p ? { ...p, proposal_data: next } : p));

    const res = await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal_data: next }),
    });

    if (!res.ok) {
      toast.error("Couldn't save that change.");
      await load();
    }
  };

  const applyTemplate = async (template: TemplateOption | null) => {
    // Optimistic: a design switch should feel instant, and the worst case is
    // one repaint back to where it was.
    setProposal((p) =>
      p
        ? {
            ...p,
            template_id: template?.id ?? null,
            templates: template ? { design: template.design } : null,
          }
        : p
    );

    const res = await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: template?.id ?? null }),
    });

    if (!res.ok) {
      toast.error("Couldn't change the design.");
      await load();
    }
  };

  const refine = async () => {
    const text = instruction.trim();
    if (!text || refining) return;

    setRefining(true);
    try {
      const res = await fetch(`/api/proposals/${id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });

      if (!res.ok) throw new Error();

      const body = await res.json();
      setProposal((p) => (p ? { ...p, proposal_data: body.proposal_data } : p));
      setChangedKeys(body.changed ?? []);
      setInstruction("");

      toast.success(
        body.changed?.length
          ? `Updated ${body.changed.length} section${body.changed.length === 1 ? "" : "s"}.`
          : "No changes were needed."
      );
    } catch {
      toast.error("Couldn't apply that. Try rewording it.");
    } finally {
      setRefining(false);
    }
  };

  const restore = async (versionId: string) => {
    const res = await fetch(`/api/proposals/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    });

    if (!res.ok) {
      toast.error("Couldn't restore that version.");
      return;
    }

    const body = await res.json();
    setProposal((p) => (p ? { ...p, proposal_data: body.proposal_data } : p));
    setChangedKeys([]);
    await loadVersions();
    toast.success("Restored.");
  };

  if (loading) {
    return (
      <AppShellClient>
        <div className="mx-auto max-w-[680px] space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShellClient>
    );
  }

  if (!proposal) {
    return (
      <AppShellClient>
        <div className="mx-auto max-w-[680px] text-center py-20">
          <div className="text-[15px] font-medium">Proposal not found</div>
          <Link
            href="/pipeline"
            className="mt-3 inline-block text-[13px] text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Back to pipeline
          </Link>
        </div>
      </AppShellClient>
    );
  }

  return (
    <AppShellClient>
      <div className="mx-auto max-w-[680px] mb-8 flex items-center justify-between gap-4">
        <Link
          href={`/pipeline/${proposal.deal_id}`}
          className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Back to deal
        </Link>

        <button
          type="button"
          onClick={() => {
            setShowHistory((v) => !v);
            if (!showHistory) loadVersions();
          }}
          className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="size-3.5" strokeWidth={1.5} />
          History
        </button>
      </div>

      <div className="mx-auto max-w-[680px] mb-8">
        <TemplatePicker
          selectedId={proposal.template_id}
          onSelect={applyTemplate}
        />
      </div>

      {showHistory && (
        <div className="mx-auto max-w-[680px] mb-8 rounded-md border border-border divide-y divide-border">
          {versions.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No edits yet.
            </div>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-[13px] truncate">
                    {v.change_summary ?? "Edited"}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {v.created_by === "ai" ? "Refined" : "Edited"} ·{" "}
                    {new Date(v.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Button
                  onClick={() => restore(v.id)}
                  variant="outline"
                  className="h-8 text-[12px] gap-1.5 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="size-3" strokeWidth={1.5} />
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <ProposalDocument
        data={proposal.proposal_data}
        theme={
          proposal.templates
            ? coerceTheme(proposal.templates.design)
            : DEFAULT_THEME
        }
        onChange={save}
        changedKeys={changedKeys}
        clientName={proposal.deals?.client_name}
        clientCompany={proposal.deals?.client_company}
        authorName={proposal.profiles?.full_name ?? proposal.profiles?.email}
      />

      <div className="mx-auto max-w-[680px] mt-14">
        <SharePanel
          proposalId={proposal.id}
          shareToken={proposal.share_token}
          onTokenChange={(token) =>
            setProposal((p) => (p ? { ...p, share_token: token } : p))
          }
        />
      </div>

      {/* Refine box — sticky so it stays reachable on a long proposal. */}
      <div className="sticky bottom-0 mt-14 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="mx-auto max-w-[680px]">
          <div
            className={cn(
              "flex items-end gap-2 rounded-md border border-border bg-card p-2",
              refining && "opacity-70"
            )}
          >
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  refine();
                }
              }}
              disabled={refining}
              rows={1}
              placeholder="Make the approach more concise…"
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
            <Button
              onClick={refine}
              disabled={refining || !instruction.trim()}
              className="h-8 gap-1.5 text-[12.5px] bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] hover:bg-[var(--accent-sage)]/90 cursor-pointer shrink-0"
            >
              <Sparkles className="size-3.5" strokeWidth={1.5} />
              {refining ? "Working…" : "Refine"}
            </Button>
          </div>
          <p className="mt-2 px-1 text-[11.5px] text-muted-foreground">
            Click any text to edit it directly, or describe a change here.
          </p>
        </div>
      </div>
    </AppShellClient>
  );
}
