import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The mark: an open arc that terminates in a bead. The arc is the
 * conversation, the bead is where it closes — the one idea the product is
 * about, drawn once. Set in the display serif because the wordmark is the
 * only place the brand voice speaks at full volume.
 */
export function Wordmark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-brand"
      >
        <svg viewBox="0 0 24 24" className="size-[15px]" fill="none">
          <path
            d="M16.6 6.6a7 7 0 1 0 0 10.8"
            stroke="var(--brand-fg)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="16.6" cy="6.6" r="2.1" fill="var(--brand-fg)" />
        </svg>
      </span>
      <span className="font-display text-[17px] font-medium tracking-[-0.02em] leading-none">
        Closingly
      </span>
    </>
  );

  const classes = cn("flex items-center gap-2.5 min-w-0", className);

  if (!href) return <span className={classes}>{content}</span>;

  return (
    <Link
      href={href}
      aria-label="Closingly, go to dashboard"
      className={cn(classes, "transition-opacity hover:opacity-75")}
    >
      {content}
    </Link>
  );
}
