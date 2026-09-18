import { CopyButton } from "./copy-button";

export function ReplyCard({
  tone,
  subject,
  body,
}: {
  tone: string;
  subject: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[10.5px] uppercase tracking-[0.14em] font-medium text-muted-foreground">
          {tone}
        </span>
        <CopyButton text={`Subject: ${subject}\n\n${body}`} />
      </div>
      <div className="text-[13px] font-medium mb-2 leading-snug">{subject}</div>
      <div className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {body}
      </div>
    </div>
  );
}
