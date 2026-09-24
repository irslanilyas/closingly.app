import { cn } from "@/lib/utils";

/**
 * The loading indicator. A quarter arc turning over a faint full ring, drawn
 * in currentColor so it takes the colour and size of wherever it sits, the
 * way an icon would.
 */
export function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      data-slot="spinner"
      className={cn("animate-spin", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.5} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
