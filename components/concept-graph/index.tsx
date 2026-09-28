"use client";
// Concept graph (React Flow + dagre). Prerequisites on the left, the concepts they unlock to
// the right; nodes coloured by mastery band, dashed when the estimate is low-confidence.
import "@xyflow/react/dist/base.css";
import "./concept-graph.css";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useTheme } from "next-themes";
import {
  ControlButton,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BAND_LABEL, BAND_VAR, pct } from "@/components/nu";
import type { ConceptGraphData, GraphNode } from "@/lib/types";
import { layoutGraph, NODE_SIZE, unitTag } from "./layout";

export interface ConceptGraphProps {
  data: ConceptGraphData;
  /** Recommended concept → accent ring + red marker dot. */
  highlightId?: string | null;
  /** CSS height of the canvas (default 520). */
  height?: number | string;
  /** Pan / zoom / drag enabled (default true). Dashboard tile passes false. */
  interactive?: boolean;
  /** Smaller nodes, no minimap/controls — for dashboard tiles. */
  compact?: boolean;
  showLegend?: boolean;
  onNodeClick?: (conceptId: string) => void;
  className?: string;
  /** Mouse-wheel / trackpad zoom (default: on when interactive and not compact). */
  scrollZoom?: boolean;
}

interface ConceptNodeData extends Record<string, unknown> {
  concept: GraphNode;
  compact: boolean;
  highlight: boolean;
  delayMs: number;
  /** weightage relative to the heaviest concept, 0..1 */
  weightRel: number;
}

type ConceptFlowNode = Node<ConceptNodeData, "concept">;

const SEGMENTS = 8;

function weightText(c: GraphNode): string {
  const share = Math.round(c.weightage * 100);
  return c.weightageSource === "pyq" ? `${share}% of marks` : `~${share}% est.`;
}

const ConceptNode = memo(function ConceptNode({ data }: NodeProps<ConceptFlowNode>) {
  const { concept: c, compact, highlight, delayMs, weightRel } = data;
  const unsure = c.band !== "unknown" && (c.confidence === "none" || c.confidence === "low");
  const on = Math.round(weightRel * SEGMENTS);
  return (
    <div
      className={cn("sos-node", compact && "sos-node--compact", unsure && "sos-node--unsure", highlight && "sos-node--hl")}
      data-band={c.band}
      style={{ "--sos-band": BAND_VAR[c.band], "--sos-delay": `${delayMs}ms` } as React.CSSProperties}
      title={`${c.name} · ${c.unit}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <div className="sos-node__top">
        <span className="sos-node__dot" aria-hidden />
        <span className="sos-node__pct">{c.band === "unknown" ? "—" : `${pct(c.mastery)}%`}</span>
        <span className="sos-node__unit">{unitTag(c.unit)}</span>
      </div>
      <div className="sos-node__name">{c.name}</div>
      <div className="sos-node__weight" aria-hidden>
        <div className="sos-node__bar">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={cn("sos-node__seg", i < on && "sos-node__seg--on")} />
          ))}
        </div>
        <span className="sos-node__w">{weightText(c)}</span>
      </div>
      {highlight && <span className="nu-dot sos-node__live" aria-hidden />}
    </div>
  );
});

const nodeTypes = { concept: ConceptNode };
const noopSubscribe = () => () => {};

export function GraphLegend({ className }: { className?: string }) {
  return (
    <div className={cn("sos-graph__legend text-xs text-muted-foreground", className)}>
      {(["weak", "developing", "strong", "unknown"] as const).map((band) => (
        <span key={band} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={
              band === "unknown"
                ? { border: `1.5px dashed ${BAND_VAR[band]}` }
                : { background: BAND_VAR[band] }
            }
            aria-hidden
          />
          {BAND_LABEL[band]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-[4px] border border-dashed border-muted-foreground" aria-hidden />
        Low confidence
      </span>
    </div>
  );
}

export function ConceptGraph({
  data,
  highlightId = null,
  height = 520,
  interactive = true,
  compact = false,
  showLegend = false,
  onNodeClick,
  className,
  scrollZoom,
}: ConceptGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<ConceptFlowNode, Edge> | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );
  const wheelZoom = scrollZoom ?? (interactive && !compact);

  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === wrapRef.current;
      setFullscreen(on);
      // Re-fit once the canvas has its new size.
      requestAnimationFrame(() => flowRef.current?.fitView({ padding: 0.12, duration: 200 }));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  // React Flow puts a "light"/"dark" class on its root; it must match the app theme, or the
  // .light token block in globals.css would repaint the canvas.
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "light" ? "light" : "dark";
  const { nodes, edges } = useMemo(() => {
    const layout = layoutGraph(data, compact);
    const maxW = data.nodes.reduce((m, n) => Math.max(m, n.weightage), 0) || 1;
    const size = compact ? NODE_SIZE.compact : NODE_SIZE.normal;
    const nodes: ConceptFlowNode[] = data.nodes.map((c) => {
      const p = layout.positions.get(c.id) ?? { x: 0, y: 0, delayMs: 0 };
      return {
        id: c.id,
        type: "concept",
        position: { x: p.x, y: p.y },
        width: size.width,
        height: size.height,
        draggable: false,
        connectable: false,
        ariaLabel: `${c.name}, ${c.band === "unknown" ? "no data yet" : `${BAND_LABEL[c.band]} ${pct(c.mastery)} percent`}`,
        data: { concept: c, compact, highlight: c.id === highlightId, delayMs: p.delayMs, weightRel: c.weightage / maxW },
      };
    });
    const edges: Edge[] = layout.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      focusable: false,
      className: highlightId && (e.from === highlightId || e.to === highlightId) ? "sos-edge--hl" : undefined,
    }));
    return { nodes, edges };
  }, [data, compact, highlightId]);

  if (data.nodes.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)} style={{ height }}>
        No concepts yet.
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn("sos-graph", onNodeClick && "sos-graph--click", fullscreen && "sos-graph--full", className)}
      style={{ height: fullscreen ? "100%" : height }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: compact ? 0.08 : 0.12, maxZoom: 1.1 }}
        minZoom={0.15}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onNodeClick)}
        nodesFocusable={Boolean(onNodeClick)}
        edgesFocusable={false}
        panOnDrag={interactive}
        zoomOnScroll={wheelZoom}
        panOnScroll={false}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={interactive}
        preventScrolling={wheelZoom}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
        colorMode={colorMode}
      >
        {interactive && !compact && (
          <Controls showInteractive={false} position="bottom-right" fitViewOptions={{ padding: 0.12, duration: 200 }}>
            {canFullscreen && (
              <ControlButton
                onClick={toggleFullscreen}
                title={fullscreen ? "Exit full screen" : "Full screen"}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              >
                {fullscreen ? <Minimize /> : <Maximize />}
              </ControlButton>
            )}
          </Controls>
        )}
        {interactive && !compact && (
          <MiniMap
            position="top-right"
            pannable
            zoomable
            nodeColor={(n) => BAND_VAR[(n.data as ConceptNodeData).concept.band]}
            nodeBorderRadius={6}
          />
        )}
      </ReactFlow>
      {showLegend && <GraphLegend className="absolute bottom-3 left-3 max-w-[calc(100%-5rem)]" />}
    </div>
  );
}
