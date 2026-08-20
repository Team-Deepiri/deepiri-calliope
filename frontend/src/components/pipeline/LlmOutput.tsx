import { useMemo, type ReactNode } from "react";

type MdBlock =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "code"; lang: string; text: string };

const HEADING_RE = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /```([\w-]*)[^\n]*\n?([\s\S]*?)```/g;

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function prettyIfJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function fenceAsMarkdown(lang: string, body: string): boolean {
  const l = lang.toLowerCase();
  if (l === "json" || l === "calliope-json") return false;
  if (looksLikeJson(body)) return false;
  if (l === "markdown" || l === "md" || l === "text") return true;
  return HEADING_RE.test(body.split("\n").find((line) => line.trim()) ?? "");
}

function parseFlow(src: string, into: MdBlock[]): void {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) {
      i += 1;
      continue;
    }
    const heading = HEADING_RE.exec(raw);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      into.push({ type: "h", level, text: heading[2].trim() });
      i += 1;
      continue;
    }
    if (/^\s{0,3}[-*]\s+\S/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s{0,3}[-*]\s+\S/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}[-*]\s+/, "").trim());
        i += 1;
      }
      into.push({ type: "ul", items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !HEADING_RE.test(lines[i]) && !/^\s{0,3}[-*]\s+\S/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    const joined = buf.join("\n").trim();
    if (looksLikeJson(joined)) {
      into.push({ type: "code", lang: "json", text: prettyIfJson(joined) });
    } else {
      into.push({ type: "p", text: buf.join(" ").replace(/\s+/g, " ").trim() });
    }
  }
}

function parseArchitectMarkdown(src: string): MdBlock[] {
  const chunks: { kind: "text" | "code"; lang?: string; body: string }[] = [];
  const fence = new RegExp(FENCE_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (m.index > last) chunks.push({ kind: "text", body: src.slice(last, m.index) });
    chunks.push({ kind: "code", lang: (m[1] || "").trim(), body: m[2].replace(/\s+$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) chunks.push({ kind: "text", body: src.slice(last) });

  const blocks: MdBlock[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === "code") {
      if (fenceAsMarkdown(chunk.lang ?? "", chunk.body)) {
        parseFlow(chunk.body, blocks);
        continue;
      }
      const body =
        (chunk.lang ?? "").includes("json") || looksLikeJson(chunk.body) ? prettyIfJson(chunk.body) : chunk.body;
      blocks.push({
        type: "code",
        lang: chunk.lang || (looksLikeJson(chunk.body) ? "json" : ""),
        text: body,
      });
      continue;
    }
    parseFlow(chunk.body, blocks);
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{nodes}</>;
}

export function LlmOutput({ text, compact }: { text: string; compact?: boolean }) {
  const blocks = useMemo(() => parseArchitectMarkdown(text), [text]);
  return (
    <div className={`llm-output${compact ? " llm-output--compact" : ""}`}>
      <div className="llm-output__scroll">
        {blocks.map((block, i) => {
          if (block.type === "h") {
            return (
              <p key={i} className="llm-output__h" role="heading" aria-level={block.level === 3 ? 3 : 2}>
                <Inline text={block.text} />
              </p>
            );
          }
          if (block.type === "ul") {
            return (
              <ul key={i} className="llm-output__ul">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          }
          if (block.type === "code") {
            return (
              <pre key={i} className={`llm-output__code${block.lang ? ` is-${block.lang}` : ""}`}>
                <code>{block.text}</code>
              </pre>
            );
          }
          return (
            <p key={i} className="llm-output__p">
              <Inline text={block.text} />
            </p>
          );
        })}
      </div>
    </div>
  );
}
