export function FitScore({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground">—</span>;
  const tone =
    score >= 8
      ? "text-[var(--accent-sage)]"
      : score >= 5
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[15px] font-medium tabular-nums ${tone}`}>
        {score}
        <span className="text-muted-foreground/60 font-normal">/10</span>
      </span>
      <div className="flex gap-[2px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-1 rounded-[1px] ${
              i < score ? "bg-[var(--accent-sage)]" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
