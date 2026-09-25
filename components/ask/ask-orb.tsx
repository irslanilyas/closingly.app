import Image from "next/image";
import orb from "@/public/brand/ask-orb.webp";
import { cn } from "@/lib/utils";

/**
 * Ask Closingly's mark: a glossy brand orb (public/brand/ask-orb.png is the
 * supplied master; this is its squared, 9.6 KB WebP).
 *
 * - `arrive`: the panel's one authored moment. The orb turns in out of a
 *   soft blur and lands on exactly the angle it was painted at, so its
 *   highlight ends where the light is, and one bloom of brand light goes out
 *   behind it.
 * - `thinking`: spins while the agent works. Used at small sizes, where a
 *   turning highlight reads as motion rather than as the light moving.
 *
 * Decorative: whatever carries it (a button, a status row) names it.
 */
export type OrbState = "idle" | "thinking";

export function AskOrb({
  size = 24,
  state = "idle",
  arrive = false,
  className,
}: {
  size?: number;
  state?: OrbState;
  arrive?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      {arrive && (
        <span
          className="orb-bloom absolute inset-[-35%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--brand-vivid), transparent 55%) 0%, transparent 62%)",
          }}
        />
      )}
      <span className={cn("relative size-full", arrive && "orb-arrive")}>
        <Image
          src={orb}
          alt=""
          width={size}
          height={size}
          unoptimized
          draggable={false}
          className={cn("size-full select-none", state === "thinking" && "orb-spin")}
        />
      </span>
    </span>
  );
}
