"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { FinanceResearchContext, FinanceResearchStatus } from "../../../lib/finance-research";

const KIND_COLOR: Record<FinanceResearchContext["kind"], string> = {
  theme: "#7c3aed",
  symbol_thesis: "#10b981",
  screen_rule: "#06b6d4",
  trade_doctrine: "#d97706",
};

const KIND_LABEL: Record<FinanceResearchContext["kind"], string> = {
  theme: "Theme",
  symbol_thesis: "Symbol thesis",
  screen_rule: "Screener rule",
  trade_doctrine: "Trade doctrine",
};

const STATUS_COLOR: Record<FinanceResearchStatus, string> = {
  working: "#7c3aed",
  provisional: "#d97706",
  published: "#10b981",
  stale: "#9ca3af",
};

interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  context: FinanceResearchContext;
}

interface MapEdge {
  source: string;
  target: string;
  weight: number; // shared symbol count
  sharedSymbols: string[];
}

function buildGraph(contexts: FinanceResearchContext[]): {
  nodes: MapNode[];
  edges: MapEdge[];
} {
  const nodes: MapNode[] = contexts.map((context, i) => ({
    id: context.id,
    label: context.title,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: Math.max(30, Math.min(60, 20 + context.symbols.length * 3)),
    context,
  }));

  const edges: MapEdge[] = [];
  for (let i = 0; i < contexts.length; i++) {
    for (let j = i + 1; j < contexts.length; j++) {
      const shared = contexts[i].symbols.filter((s) =>
        contexts[j].symbols.includes(s),
      );
      if (shared.length > 0) {
        edges.push({
          source: contexts[i].id,
          target: contexts[j].id,
          weight: shared.length,
          sharedSymbols: shared,
        });
      }
    }
  }

  return { nodes, edges };
}

function simulateForceLayout(
  nodes: MapNode[],
  edges: MapEdge[],
  width: number,
  height: number,
  iterations: number = 200,
) {
  const eps = 0.5;
  const alpha = 1;
  const alphaDecay = 1 - Math.pow(eps, 1 / iterations);

  // Init positions in a circle
  const cx = width / 2;
  const cy = height / 2;
  const initRadius = Math.min(width, height) * 0.3;

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length;
    nodes[i].x = cx + initRadius * Math.cos(angle);
    nodes[i].y = cy + initRadius * Math.sin(angle);
    nodes[i].vx = 0;
    nodes[i].vy = 0;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let a = alpha;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const force = (a * 800) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx;
        nodes[i].vy += fy;
        nodes[j].vx -= fx;
        nodes[j].vy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      const force = (dist / 150) * edge.weight * a;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }

    // Center gravity
    for (const node of nodes) {
      node.vx += (cx - node.x) * a * 0.01;
      node.vy += (cy - node.y) * a * 0.01;
    }

    // Apply velocities with damping
    for (const node of nodes) {
      node.vx *= 0.6;
      node.vy *= 0.6;
      node.x += node.vx;
      node.y += node.vy;

      // Clamp to bounds
      node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
      node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
    }

    a *= alphaDecay;
  }
}

export default function ResearchMap({
  contexts,
  onSelectContext,
}: {
  contexts: FinanceResearchContext[];
  onSelectContext: (context: FinanceResearchContext) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(400, rect.width),
          height: Math.max(400, rect.height),
        });
      }
    };

    updateDimensions();
    const handle = () => updateDimensions();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const layout = useMemo(() => {
    const { nodes, edges } = buildGraph(contexts);
    simulateForceLayout(nodes, edges, dimensions.width, dimensions.height);
    return { nodes, edges };
  }, [contexts, dimensions]);

  const edgeOpacity = (edge: MapEdge, hoveredNodeId: string | null) => {
    if (!hoveredNodeId && !hoveredEdge) return 0.25;
    if (hoveredNodeId) {
      return edge.source === hoveredNodeId || edge.target === hoveredNodeId
        ? 0.6
        : 0.06;
    }
    return edge.source + "-" + edge.target === hoveredEdge ? 0.6 : 0.06;
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        style={{ minHeight: 500 }}
      >
        {/* Edges */}
        {layout.edges.map((edge) => {
          const src = layout.nodes.find((n) => n.id === edge.source);
          const tgt = layout.nodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;

          const edgeId = edge.source + "-" + edge.target;
          const opacity = edgeOpacity(edge, hoveredNode);
          const strokeWidth = Math.max(1, edge.weight * 1.5);

          return (
            <g key={edgeId}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke="#9ca3af"
                strokeWidth={strokeWidth}
                opacity={opacity}
                className="transition-opacity duration-200"
                onMouseEnter={() => setHoveredEdge(edgeId)}
                onMouseLeave={() => setHoveredEdge(null)}
              />
              {/* Edge label: shared symbol count */}
              {opacity > 0.3 && (
                <text
                  x={(src.x + tgt.x) / 2}
                  y={(src.y + tgt.y) / 2 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#9ca3af"
                  className="pointer-events-none"
                >
                  {edge.weight} shared
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node) => {
          const color = KIND_COLOR[node.context.kind];
          const isHovered = hoveredNode === node.id;
          const scale = isHovered ? 1.15 : 1;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y}) scale(${scale})`}
              className="cursor-pointer transition-transform duration-200"
              onClick={() => onSelectContext(node.context)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Outer ring for status */}
              <circle
                r={node.radius + 4}
                fill="none"
                stroke={STATUS_COLOR[node.context.status]}
                strokeWidth={2.5}
                strokeDasharray={
                  node.context.status === "provisional" ? "6 3" : "none"
                }
                opacity={0.7}
              />

              {/* Main node circle */}
              <circle r={node.radius} fill={color} opacity={0.9} />

              {/* Symbol count */}
              {node.context.symbols.length > 0 && (
                <text
                  y={-6}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={700}
                  fill="white"
                  className="pointer-events-none"
                >
                  {node.context.symbols.length}
                </text>
              )}
              <text
                y={8}
                textAnchor="middle"
                fontSize={9}
                fill="rgba(255,255,255,0.8)"
                className="pointer-events-none"
              >
                symbols
              </text>

              {/* Label below node */}
              <text
                y={node.radius + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#374151"
                className="pointer-events-none"
              >
                {node.label.length > 22
                  ? node.label.slice(0, 22) + "…"
                  : node.label}
              </text>

              {/* Kind label */}
              <text
                y={node.radius + 29}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
                className="pointer-events-none"
              >
                {KIND_LABEL[node.context.kind]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 bg-white/90 rounded-lg border border-gray-200 p-2.5 backdrop-blur">
        <span className="text-[10px] font-semibold text-gray-400 mr-1 self-center">
          Kind:
        </span>
        {(
          ["theme", "screen_rule", "trade_doctrine", "symbol_thesis"] as const
        ).map((kind) => (
          <span
            key={kind}
            className="flex items-center gap-1 text-[11px] text-gray-600"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: KIND_COLOR[kind] }}
            />
            {KIND_LABEL[kind]}
          </span>
        ))}
        <span className="border-l border-gray-200 mx-1" />
        <span className="text-[10px] font-semibold text-gray-400 self-center">
          Ring:
        </span>
        <span className="flex items-center gap-1 text-[11px] text-gray-600">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: STATUS_COLOR.working }}
          />
          working
        </span>
        <span className="flex items-center gap-1 text-[11px] text-gray-600">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed"
            style={{ borderColor: STATUS_COLOR.provisional }}
          />
          provisional
        </span>
        <span className="flex items-center gap-1 text-[11px] text-gray-600">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: STATUS_COLOR.published }}
          />
          published
        </span>
      </div>
    </div>
  );
}
