"use client";

import { AppShellClient } from "@/components/app-shell-client";
import { PageHeader } from "@/components/page-header";
import { FollowUpQueue } from "@/components/follow-ups/queue";

export default function FollowUpsPage() {
  return (
    <AppShellClient>
      <PageHeader
        title="What's waiting on a reply"
        description="Proposals that went unopened, conversations that stalled, clients who read it and went quiet. Each one arrives with the message already drafted from what was actually said on the call."
      />
      <div className="max-w-[760px]">
        <FollowUpQueue />
      </div>
    </AppShellClient>
  );
}
