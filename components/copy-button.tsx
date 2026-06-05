"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
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
          <Check className="size-3.5" strokeWidth={2} /> Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" strokeWidth={1.75} /> {label}
        </>
      )}
    </Button>
  );
}
