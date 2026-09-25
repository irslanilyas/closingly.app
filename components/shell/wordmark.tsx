import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * The logo where the app's chrome carries it: linked to the dashboard inside
 * the app, unlinked where there is nowhere to go yet (sign-in, setup).
 */
export function Wordmark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const classes = cn("flex items-center min-w-0", className);

  if (!href) {
    return (
      <span className={classes}>
        <Logo label="Closingly" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label="Closingly, go to dashboard"
      className={cn(classes, "transition-opacity hover:opacity-75")}
    >
      <Logo />
    </Link>
  );
}
