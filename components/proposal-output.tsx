import { FitScore } from "./fit-score";
import { ReplyCard } from "./reply-card";
import { ProposalGeneration } from "@/lib/types";

interface ProposalOutputProps {
  data: Partial<ProposalGeneration>;
  streaming?: boolean;
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-medium">
        {label}
      </div>
      <div className="text-[13px] leading-relaxed">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

export function ProposalOutput({ data, streaming }: ProposalOutputProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[12px] uppercase tracking-[0.14em] font-medium">
            Deal Summary
          </h3>
          {streaming && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[var(--accent-sage)] animate-pulse" />
              streaming
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Field label="Client" value={data.client_name} />
          <Field label="Company" value={data.client_company} />
          <Field
            label="Pain Point"
            value={
              <span className="text-pretty">{data.pain_point}</span>
            }
          />
          <Field label="Budget Signal" value={data.budget_signal} />
          <Field label="Timeline" value={data.timeline} />
          <Field label="Decision Maker" value={data.decision_maker} />
          <div className="col-span-2 pt-1">
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
              Fit Score
            </div>
            <FitScore score={data.fit_score} />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <h3 className="text-[12px] uppercase tracking-[0.14em] font-medium mb-5">
          Proposal
        </h3>
        <div className="space-y-5">
          <Section title="The Challenge" body={data.proposal?.challenge} />
          <Section title="Our Approach" body={data.proposal?.approach} />
          {data.proposal?.deliverables && data.proposal.deliverables.length > 0 && (
            <div>
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
                Key Deliverables
              </div>
              <ul className="space-y-1.5">
                {data.proposal.deliverables.map((d, i) => (
                  <li key={i} className="text-[13px] flex gap-3 leading-relaxed">
                    <span className="text-muted-foreground/50 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Section
            title="Timeline"
            body={data.proposal?.timeline_phased}
            preWrap
          />
          {data.proposal?.investment_number && (
            <div className="border-t border-border pt-5">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
                Investment
              </div>
              <div className="text-[26px] font-medium tracking-tight text-[var(--accent-sage)]">
                {data.proposal.investment_number}
              </div>
              {data.proposal.investment_terms && (
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  {data.proposal.investment_terms}
                </div>
              )}
            </div>
          )}
          <Section title="Next Steps" body={data.proposal?.next_steps} />
        </div>
      </div>

      {data.suggested_replies && data.suggested_replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[12px] uppercase tracking-[0.14em] font-medium px-1">
            Suggested Replies
          </h3>
          {data.suggested_replies.map((r, i) => (
            <ReplyCard
              key={i}
              tone={r.tone}
              subject={r.subject}
              body={r.body}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  body,
  preWrap,
}: {
  title: string;
  body?: string;
  preWrap?: boolean;
}) {
  if (!body) return null;
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground mb-2 font-medium">
        {title}
      </div>
      <div
        className={`text-[13px] text-foreground/85 leading-relaxed ${
          preWrap ? "whitespace-pre-wrap" : ""
        }`}
      >
        {body}
      </div>
    </div>
  );
}
