export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";
import {
  FileText,
  KanbanSquare,
  Mail,
  CircleDollarSign,
  TrendingUp,
  Mic,
  ShieldCheck,
} from "lucide-react";

const PHASES = [
  {
    label: "PHASE 1 — CORE WEDGE",
    size: "full" as const,
    modules: [
      {
        href: "/proposal-generator",
        title: "Proposal Generator",
        description:
          "Paste a discovery call transcript and get a structured proposal, fit score, and ready-to-send replies.",
        icon: FileText,
      },
    ],
  },
  {
    label: "PHASE 2 — PIPELINE & COMMUNICATION",
    size: "half" as const,
    modules: [
      {
        href: "/pipeline",
        title: "Deal Pipeline",
        description:
          "Kanban or list view of every saved deal. Drag between stages, drill into details.",
        icon: KanbanSquare,
      },
      {
        href: "/follow-up-writer",
        title: "Follow-up Writer",
        description:
          "Describe a situation, get three email tones written in a human voice.",
        icon: Mail,
      },
    ],
  },
  {
    label: "PHASE 3 — PRICING & FORECASTING",
    size: "half" as const,
    modules: [
      {
        href: "/pricing-advisor",
        title: "Pricing Advisor",
        description:
          "Recommend a low / mid / high price range backed by your historical deals.",
        icon: CircleDollarSign,
      },
      {
        href: "/forecaster",
        title: "Pipeline Forecaster",
        description:
          "Visualise weighted revenue by stage probability. Pure math, no AI.",
        icon: TrendingUp,
      },
    ],
  },
  {
    label: "PHASE 4 — CAPTURE & PROTECTION",
    size: "half" as const,
    modules: [
      {
        href: "/meeting-transcriber",
        title: "Meeting Transcriber",
        description:
          "Clean up raw transcripts from Otter, Fireflies, or Zoom into readable notes.",
        icon: Mic,
      },
      {
        href: "/scope-guardian",
        title: "Scope Guardian",
        description:
          "Compare original SOW vs new client request and detect scope creep before you commit.",
        icon: ShieldCheck,
      },
    ],
  },
];

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="mb-8 sm:mb-14">
        <div className="text-[13px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Workbench
        </div>
        <h1 className="text-[24px] sm:text-[28px] lg:text-[32px] font-medium tracking-tight leading-[1.1] text-balance">
          Test seven revenue operations modules before they ship.
        </h1>
        <p className="mt-4 text-[14px] text-muted-foreground max-w-[640px] leading-relaxed">
          This is a sandbox for evaluating each AI tool in isolation. Drive real
          inputs through it, see how it reads, iterate on the prompts.
        </p>
      </div>

      <div className="space-y-8 sm:space-y-12">
        {PHASES.map((phase) => (
          <section key={phase.label}>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-4 font-medium">
              {phase.label}
            </div>
            <div
              className={
                phase.size === "full"
                  ? "grid grid-cols-1"
                  : "grid grid-cols-1 sm:grid-cols-2 gap-5"
              }
            >
              {phase.modules.map((m) => (
                <ModuleCard
                  key={m.href}
                  href={m.href}
                  title={m.title}
                  description={m.description}
                  icon={m.icon}
                  size={phase.size}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
