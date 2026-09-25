"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", Icon: SunIcon, label: "Light" },
  { value: "dark", Icon: MoonIcon, label: "Dark" },
  { value: "system", Icon: ComputerDesktopIcon, label: "System" },
] as const;

const noop = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The stored theme only exists in the browser. Reading "mounted" from an
  // external store keeps the server and first client render identical without
  // a setState-in-effect round trip.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-8 w-[88px] pointer-coarse:h-10 pointer-coarse:w-[112px]",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-secondary/50",
        className
      )}
    >
      {MODES.map(({ value, Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          aria-label={`Switch to ${label} theme`}
          aria-pressed={theme === value}
          title={label}
          className={cn(
            "inline-flex items-center justify-center size-7 pointer-coarse:size-9 rounded-[3.2px] transition-colors",
            theme === value
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
