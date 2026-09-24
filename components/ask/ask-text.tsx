"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";

/**
 * The agent's prose, rendered.
 *
 * A deliberately small subset of Markdown (paragraphs, bullet and numbered
 * lists, **bold**, `code`, and links to pages inside the app), parsed into
 * React elements, never injected as HTML: the text came from a model that
 * read client transcripts, so nothing in it is trusted to become markup.
 *
 * While a reply streams in, every word is its own element that develops out
 * of a soft blur as it arrives. Keys are positional, so words already on
 * screen stay still and only the new ones move.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      blocks.push({ kind: "ul", items: lines.map((l) => l.replace(/^\s*[-*•]\s+/, "")) });
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ kind: "ol", items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) });
    } else {
      blocks.push({ kind: "p", text: lines.join("\n") });
    }
  }
  return blocks;
}

// Bold, inline code, and [label](/internal/path) links. External URLs are left
// as plain text on purpose.
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(\/[^)\s]*\))/g;

function Words({ text, animate, keyBase }: { text: string; animate: boolean; keyBase: string }) {
  if (!animate) return <>{text}</>;
  return (
    <>
      {text.split(/(\s+)/).map((token, i) =>
        /^\s*$/.test(token) ? (
          <Fragment key={`${keyBase}-${i}`}>{token}</Fragment>
        ) : (
          <span key={`${keyBase}-${i}`} className="reveal-word">
            {token}
          </span>
        )
      )}
    </>
  );
}

function Inline({ text, animate, keyBase }: { text: string; animate: boolean; keyBase: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  // One key per segment, taken before the element is built: JSX evaluates
  // props before the key, so incrementing inside a prop would skew them.
  let n = 0;
  const plain = (slice: string) => {
    const k = `${keyBase}-${n++}`;
    nodes.push(<Words key={k} keyBase={k} text={slice} animate={animate} />);
  };

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) plain(text.slice(last, at));
    const token = match[0];
    const k = `${keyBase}-${n++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={k} className="font-semibold text-foreground">
          <Words keyBase={k} text={token.slice(2, -2)} animate={animate} />
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={k} className="rounded bg-secondary px-1 py-px font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(
        <Link key={k} href={href} className="font-medium text-brand underline-offset-2 hover:underline">
          {label}
        </Link>
      );
    }
    last = at + token.length;
  }
  if (last < text.length) plain(text.slice(last));
  return <>{nodes}</>;
}

// The prompt forbids em dashes and the model still slips now and then. Tidied
// on the whole text at render time, so a dash split across two streamed
// chunks is caught the same as any other.
const tidy = (text: string) => text.replace(/\s*—\s*/g, ", ");

export function AskText({ text, animate = false }: { text: string; animate?: boolean }) {
  const blocks = parseBlocks(tidy(text));
  return (
    <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-foreground/90">
      {blocks.map((block, b) => {
        if (block.kind === "p") {
          return (
            <p key={b} className="whitespace-pre-line text-pretty">
              <Inline text={block.text} animate={animate} keyBase={`b${b}`} />
            </p>
          );
        }
        const List = block.kind === "ul" ? "ul" : "ol";
        return (
          <List key={b} className={block.kind === "ul" ? "space-y-1.5 pl-1" : "list-decimal space-y-1.5 pl-5 marker:text-muted-foreground"}>
            {block.items.map((item, i) => (
              <li key={i} className={block.kind === "ul" ? "flex gap-2.5" : undefined}>
                {block.kind === "ul" && <span aria-hidden className="mt-[0.62em] size-1 shrink-0 rounded-full bg-brand" />}
                <span className="min-w-0">
                  <Inline text={item} animate={animate} keyBase={`b${b}-${i}`} />
                </span>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
