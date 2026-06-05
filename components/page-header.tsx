interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  right,
}: PageHeaderProps) {
  return (
    <div className="mb-10 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2 font-medium">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] font-medium tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[13.5px] text-muted-foreground max-w-[680px] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
