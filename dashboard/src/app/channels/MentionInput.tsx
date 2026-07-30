"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type MentionOption = {
  handle: string;
  label: string;
  hint?: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  options: MentionOption[];
  className?: string;
  disabled?: boolean;
};

/** Text input with @autocomplete for agents. */
export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  options,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = options.filter(
      (o) =>
        !q ||
        o.handle.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q),
    );
    // de-dupe by handle
    const seen = new Set<string>();
    return list.filter((o) => {
      const k = o.handle.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
  }, [options, query]);

  useEffect(() => { setActive(0); }, [query, open]);

  const updateMentionState = (next: string, caret: number) => {
    const before = next.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setOpen(false);
      setMentionStart(null);
      setQuery("");
      return;
    }
    const prev = at === 0 ? " " : before[at - 1];
    if (prev && !/[\s([{]/.test(prev)) {
      setOpen(false);
      setMentionStart(null);
      setQuery("");
      return;
    }
    const frag = before.slice(at + 1);
    if (/[\s]/.test(frag)) {
      setOpen(false);
      setMentionStart(null);
      setQuery("");
      return;
    }
    setMentionStart(at);
    setQuery(frag);
    setOpen(true);
  };

  const applyMention = (handle: string) => {
    if (mentionStart == null || !inputRef.current) return;
    const caret = inputRef.current.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(caret);
    const next = `${before}@${handle} ${after.replace(/^\s*/, "")}`;
    onChange(next);
    setOpen(false);
    setMentionStart(null);
    setQuery("");
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const pos = before.length + handle.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          updateMentionState(next, e.target.selectionStart ?? next.length);
        }}
        onKeyDown={(e) => {
          if (open && filtered.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % filtered.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + filtered.length) % filtered.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              applyMention(filtered[active].handle);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onBlur={() => {
          // allow click on option
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-card py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((o, i) => (
            <li key={o.handle}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(o.handle);
                }}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${
                  i === active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <span className="font-medium">@{o.handle}</span>
                <span className="truncate text-[10px] text-zinc-400">{o.hint || o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MessageBody({ body, className }: { body: string; className?: string }) {
  const nodes: ReactNode[] = [];
  const re = /@([A-Za-z0-9][A-Za-z0-9._:-]{0,63})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body))) {
    if (m.index > last) nodes.push(body.slice(last, m.index));
    nodes.push(
      <span
        key={`m-${i++}`}
        className="rounded bg-blue-50 px-0.5 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
      >
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return <p className={className ?? "whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300"}>{nodes}</p>;
}
