"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { toRecordingUsage } from "@/lib/types";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

interface AccountStatus {
  email: string;
  connected: boolean;
  recording: { used_seconds: number; limit_seconds: number };
}

export default function SettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/google/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/google/status", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Google disconnected. Sign in again to reconnect.");
      await load();
    } catch {
      toast.error("Couldn't disconnect. Try again.");
    } finally {
      setDisconnecting(false);
    }
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error();

      // fetch doesn't trigger a download on its own — the standard way is a
      // throwaway object URL and a click on an invisible link.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ros-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export your data. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const onDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) throw new Error();

      // The account is already gone server-side at this point; this just
      // clears the browser's now-meaningless session cookie so the app
      // doesn't briefly act logged-in on the way to /login.
      await createClient().auth.signOut();
      toast.success("Account deleted.");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Couldn't delete your account. Try again, or reach out.");
      setDeleting(false);
    }
  };

  const usage = status
    ? toRecordingUsage(
        status.recording.used_seconds,
        status.recording.limit_seconds
      )
    : null;

  return (
    <AppShellClient>
      <PageHeader eyebrow="Settings" title="Account" />

      <div className="max-w-[560px] space-y-10">
        <section>
          <SectionLabel>Profile</SectionLabel>
          <Row label="Email" value={loading ? "—" : status?.email ?? "—"} />
        </section>

        <section>
          <SectionLabel>Connected accounts</SectionLabel>
          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">Google</div>
                <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                  Reads your calendar to find client calls and sends follow-ups
                  from your address.
                </p>
              </div>
              {loading ? (
                <span className="text-[12px] text-muted-foreground shrink-0">
                  Checking…
                </span>
              ) : status?.connected ? (
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11.5px] uppercase tracking-[0.1em] text-[var(--accent-sage)] font-medium">
                    Connected
                  </span>
                  <Button
                    onClick={disconnect}
                    disabled={disconnecting}
                    variant="outline"
                    className="h-8 text-[12px] cursor-pointer"
                  >
                    {disconnecting ? "…" : "Disconnect"}
                  </Button>
                </div>
              ) : (
                <span className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground shrink-0">
                  Not connected
                </span>
              )}
            </div>

            {!loading && !status?.connected && (
              <div className="border-t border-border px-4 py-3 text-[12.5px] text-muted-foreground">
                Sign out and back in with Google to reconnect calendar access.
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Recording allowance</SectionLabel>
          {usage && (
            <div className="rounded-md border border-border px-4 py-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-[13.5px] font-medium tabular-nums">
                  {formatHours(usage.used_seconds)} of{" "}
                  {formatHours(usage.limit_seconds)} used
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {formatHours(usage.remaining_seconds)} left
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-sage)] transition-all"
                  style={{ width: `${usage.percent_used}%` }}
                />
              </div>
              <p className="mt-3 text-[12px] text-muted-foreground leading-relaxed">
                Time the meeting agent has spent recording. Only meetings you
                switch the agent on for count toward this.
              </p>
            </div>
          )}
        </section>

        <section>
          <Button
            onClick={signOut}
            variant="outline"
            className="h-9 text-[12.5px] cursor-pointer"
          >
            Sign out
          </Button>
        </section>

        <section>
          <SectionLabel>Your data</SectionLabel>
          <div className="rounded-md border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">Export everything</div>
                <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                  Every deal, meeting, proposal, and transcript, as one JSON
                  file you can keep.
                </p>
              </div>
              <Button
                onClick={onExport}
                disabled={exporting}
                variant="outline"
                className="h-9 text-[12.5px] gap-1.5 shrink-0 cursor-pointer"
              >
                {exporting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" strokeWidth={1.75} />
                )}
                Export
              </Button>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Danger zone</SectionLabel>
          <div className="rounded-md border border-destructive/30 px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">Delete account</div>
                <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                  Every deal, meeting, transcript, and proposal — gone
                  permanently. This can&rsquo;t be undone.
                </p>
              </div>
              <Dialog
                onOpenChange={(open) => {
                  if (!open) setConfirmText("");
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 text-[12.5px] shrink-0 cursor-pointer border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Delete account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete your account?</DialogTitle>
                    <DialogDescription>
                      This permanently deletes every deal, meeting, transcript,
                      proposal, and share link tied to{" "}
                      <span className="font-medium text-foreground">
                        {status?.email}
                      </span>
                      . Export your data first if you want a copy — there is
                      no undo.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2 py-2">
                    <label
                      htmlFor="confirm-email"
                      className="text-[11.5px] uppercase tracking-[0.1em] font-medium text-muted-foreground"
                    >
                      Type your email to confirm
                    </label>
                    <Input
                      id="confirm-email"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={status?.email ?? ""}
                      autoComplete="off"
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      onClick={onDeleteAccount}
                      disabled={
                        deleting ||
                        !status?.email ||
                        confirmText !== status.email
                      }
                      variant="destructive"
                      className="cursor-pointer"
                    >
                      {deleting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Permanently delete"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>
      </div>
    </AppShellClient>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3 font-medium">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-4 py-3 border-b border-border">
      <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-[13px] break-all">{value}</div>
    </div>
  );
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  return `${Math.round(seconds / 60)} min`;
}
