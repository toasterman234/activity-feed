"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";

type Props = {
  kind: string;
  content: string;
};

const proseCSS = `
  h1,h2,h3,h4 { margin-top: 1em; margin-bottom: 0.5em; font-weight: 600; }
  h1 { font-size: 1.3em; }
  h2 { font-size: 1.1em; }
  h3 { font-size: 1em; }
  p { margin-bottom: 0.75em; }
  ul,ol { padding-left: 1.5em; margin-bottom: 0.75em; }
  li { margin-bottom: 0.25em; }
  code { font-size: 0.9em; background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px; }
  pre { margin-bottom: 0.75em; border-radius: 6px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d4d4d8; padding-left: 1em; color: #71717a; margin-bottom: 0.75em; }
  a { color: #2563eb; text-decoration: underline; }
  img { max-width: 100%; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0.75em; }
  th,td { border: 1px solid #d4d4d8; padding: 4px 8px; text-align: left; font-size: 0.9em; }
  th { background: rgba(0,0,0,0.04); font-weight: 600; }
`;

function MarkdownContent({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <>
      <style>{proseCSS}</style>
      <div
        className="prose text-[11px] text-zinc-700 dark:text-zinc-300"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

function HtmlContent({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      className="w-full rounded-md border border-zinc-200 dark:border-zinc-700"
      style={{ minHeight: 200, border: "none" }}
      title="HTML artifact"
    />
  );
}

function MermaidContent({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        if (cancelled || !ref.current) return;
        const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, content);
        if (!cancelled) svgRef.current = svg;
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [content]);

  if (error) {
    return (
      <div>
        <p className="mb-1 text-[10px] text-red-500">Diagram render failed: {error}</p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[11px] text-zinc-500 dark:bg-zinc-950">
          {content}
        </pre>
      </div>
    );
  }

  if (svgRef.current) {
    return (
      <div
        className="flex justify-center overflow-auto rounded bg-zinc-50 p-2 dark:bg-zinc-950"
        dangerouslySetInnerHTML={{ __html: svgRef.current }}
      />
    );
  }

  return (
    <div ref={ref} className="flex items-center justify-center rounded bg-zinc-50 p-6 dark:bg-zinc-950">
      <span className="text-[10px] text-zinc-400">Loading diagram…</span>
    </div>
  );
}

function CodeContent({ content }: { content: string }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
      {content}
    </pre>
  );
}

export function ArtifactContent({ kind, content }: Props) {
  switch (kind) {
    case "markdown":
      return <MarkdownContent content={content} />;
    case "html":
      return <HtmlContent content={content} />;
    case "mermaid":
      return <MermaidContent content={content} />;
    case "code":
    default:
      return <CodeContent content={content} />;
  }
}
