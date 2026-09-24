"use client";

import { useState } from "react";
import {
  CheckIcon,
  Square2StackIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* swallow */
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onCopy}
      className={cn("h-7 px-2 text-[12px] gap-1.5 text-muted-foreground hover:text-foreground", className)}
    >
      {copied ? (
        <>
          <CheckIcon className="size-3.5" strokeWidth={2} /> Copied
        </>
      ) : (
        <>
          <Square2StackIcon className="size-3.5" strokeWidth={1.75} /> {label}
        </>
      )}
    </Button>
  );
}
