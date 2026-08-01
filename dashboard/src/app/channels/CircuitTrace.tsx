"use client";

import { useMemo } from "react";
import { cx as cn } from "@/components/ui";
import type { ActivityEventRow } from "./shapes";

export type CircuitTraceProps = {
  events: ActivityEventRow[];
  running: boolean;
};

const MIN_GAP = 18;
const MAX_GAP = 64;
const NODE_R = 5;
const STROKE_W = 1.5;
const PAD_X = 6;
const PAD_Y = 4;
const HEIGHT = PAD_Y * 2 + NODE_R * 2 + 4;

function nodeLabel(event: ActivityEventRow): string {
  if (event.kind === "thinking") {
    return event.status === "done" ? "Thought" : "Think";
  }
  if (event.kind === "tool") {
    return event.label.replace(/^(calling|ran)\s+/, "").slice(0, 10);
  }
  return event.label.slice(0, 10);
}

export function CircuitTrace({ events, running }: CircuitTraceProps) {
  const nodes = useMemo(() => {
    return [...events].sort((a, b) => a.seq - b.seq);
  }, [events]);

  if (nodes.length === 0) return null;

  const n = nodes.length;
  const gap = n <= 1 ? MAX_GAP : Math.max(MIN_GAP, Math.min(MAX_GAP, 200 / n));
  const totalW = PAD_X * 2 + gap * Math.max(0, n - 1);

  const doneCount = nodes.filter(
    (e) => e.status === "done" || e.status === "error",
  ).length;

  const runningIdx = nodes.findIndex((e) => e.status === "running");

  const edges = useMemo(() => {
    const result: { fromX: number; toX: number; y: number; lit: boolean; len: number }[] = [];
    for (let i = 0; i < n - 1; i++) {
      const fromX = PAD_X + i * gap + NODE_R + 2;
      const toX = PAD_X + (i + 1) * gap - NODE_R - 2;
      const isLen = toX - fromX;
      const fromDone = nodes[i].status === "done" || nodes[i].status === "error";
      const toActive =
        nodes[i + 1].status === "running" ||
        nodes[i + 1].status === "done" ||
        nodes[i + 1].status === "error";
      result.push({ fromX, toX, y: PAD_Y + NODE_R, lit: fromDone && toActive, len: isLen });
    }
    return result;
  }, [n, gap, nodes]);

  return (
    <div className="rounded-lg border border-muted/60 bg-muted/20 px-2 py-1.5">
      <svg
        viewBox={`0 0 ${totalW} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        className="block overflow-visible"
        aria-label={`Agent trace: ${doneCount}/${n} steps`}
      >
        {/* Edges */}
        {edges.map((edge, i) =>
          edge.len > 0 ? (
            <g key={`e-${i}`}>
              {/* Dim base line */}
              <line
                x1={edge.fromX}
                y1={edge.y}
                x2={edge.toX}
                y2={edge.y}
                stroke="currentColor"
                strokeWidth={STROKE_W}
                className="text-muted-foreground/25"
              />
              {/* Lit overlay */}
              {edge.lit && (
                <line
                  x1={edge.fromX}
                  y1={edge.y}
                  x2={edge.toX}
                  y2={edge.y}
                  stroke="currentColor"
                  strokeWidth={STROKE_W * 2}
                  strokeDasharray={`${edge.len * 0.4} ${edge.len * 0.6}`}
                  className={cn(
                    "text-emerald-500",
                    running && runningIdx === i + 1 && "animate-pulse",
                  )}
                />
              )}
            </g>
          ) : null,
        )}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const nodeCX = PAD_X + i * gap;
          const nodeCY = PAD_Y + NODE_R;
          const isRunning = node.status === "running";
          const isDone = node.status === "done";
          const isError = node.status === "error";

          return (
            <g key={node.id}>
              {/* Outer ring */}
              <circle
                cx={nodeCX}
                cy={nodeCY}
                r={NODE_R + 1.5}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.5}
                className={cn(
                  isDone && "text-emerald-500/40",
                  isRunning && "text-amber-500/40",
                  isError && "text-red-500/40",
                  !isDone && !isRunning && !isError && "text-muted-foreground/20",
                )}
              />
              {/* Inner dot */}
              <circle
                cx={nodeCX}
                cy={nodeCY}
                r={NODE_R}
                className={cn(
                  "transition-colors duration-300",
                  isDone && "fill-emerald-500",
                  isRunning && "fill-amber-500 animate-pulse",
                  isError && "fill-red-500",
                  !isDone && !isRunning && !isError && "fill-muted-foreground/40",
                )}
              />
              {/* Label */}
              <text
                x={nodeCX}
                y={nodeCY + NODE_R + 10}
                textAnchor="middle"
                className={cn(
                  "fill-current text-[7px]",
                  isRunning
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {nodeLabel(node)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
