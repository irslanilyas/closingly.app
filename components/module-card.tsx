import Link from "next/link";
import { type LucideIcon } from "lucide-react";

interface ModuleCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  size?: "full" | "half";
}

export function ModuleCard({
  href,
  title,
  description,
  icon: Icon,
  size = "half",
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-border bg-card hover:border-foreground/20 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.10)] transition-all"
    >
      <div className={size === "full" ? "p-8" : "p-7"}>
        <div className="flex items-start justify-between">
          <div className="flex items-center justify-center size-10 rounded-md bg-secondary border border-border">
            <Icon
              className="size-[18px] text-foreground/70 group-hover:text-foreground transition-colors"
              strokeWidth={1.5}
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.12em] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-sage)]/10 text-[var(--accent-sage)] border border-[var(--accent-sage)]/20">
            Built
          </span>
        </div>
        <div className="mt-6">
          <div className="text-[15px] font-medium tracking-tight">{title}</div>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}
