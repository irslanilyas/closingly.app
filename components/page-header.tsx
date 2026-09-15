interface PageHeaderProps {
  title: string;
  description?: string;
  right?: React.ReactNode;
}

/**
 * The page's own sentence, set in the display serif.
 *
 * There is no eyebrow. A small capitalised label above every title repeating
 * the nav item you just clicked is the single clearest tell of a template, and
 * the rail already says where you are.
 */
export function PageHeader({ title, description, right }: PageHeaderProps) {
  return (
    <div className="mb-6 sm:mb-9 flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-[26px] sm:text-[31px] leading-[1.15] tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2.5 text-[13.5px] text-muted-foreground max-w-[62ch] leading-relaxed text-pretty">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
