interface PageHeaderProps {
  title: string;
  description?: string;
  right?: React.ReactNode;
}

/**
 * The page's own sentence, set as the display heading.
 *
 * There is no eyebrow. A small capitalised label above every title repeating
 * the nav item you just clicked is the single clearest tell of a template, and
 * the rail already says where you are.
 */
export function PageHeader({ title, description, right }: PageHeaderProps) {
  return (
    <div className="mb-6 sm:mb-9 flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-[25px] sm:text-[31px] leading-[1.15]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 sm:mt-2.5 text-[13.5px] text-muted-foreground max-w-[62ch] leading-relaxed text-pretty">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0 self-start sm:self-auto">{right}</div>}
    </div>
  );
}
