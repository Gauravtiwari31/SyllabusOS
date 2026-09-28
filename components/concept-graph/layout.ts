// Auto-layout for the concept graph: dagre, left → right (prerequisites on the left).
// Pure — safe to unit test or run during render.
import dagre from "@dagrejs/dagre";
import type { ConceptGraphData, GraphEdge } from "@/lib/types";

export const NODE_SIZE = {
  normal: { width: 200, height: 88 },
  compact: { width: 156, height: 64 },
} as const;

const SPACING = {
  normal: { nodesep: 18, ranksep: 64, gapX: 24, gapY: 18 },
  compact: { nodesep: 12, ranksep: 44, gapX: 16, gapY: 12 },
} as const;

/** Columns taller than this wrap into a second column (edge-less / isolated nodes). */
const MAX_COLUMN = 8;
/** Stagger for the recolour wave: prerequisites recolour first, dependents after. */
const DELAY_PER_RANK_MS = 90;
const DELAY_PER_ROW_MS = 14;
const MAX_DELAY_MS = 1100;

export interface NodePlacement {
  x: number;
  y: number;
  /** transition-delay for band changes (left → right wave) */
  delayMs: number;
}

export interface GraphLayout {
  positions: Map<string, NodePlacement>;
  edges: GraphEdge[];
  width: number;
  height: number;
}

/** Edges whose endpoints both exist, without self-loops or duplicates. */
export function validEdges(data: ConceptGraphData): GraphEdge[] {
  const ids = new Set(data.nodes.map((n) => n.id));
  const seen = new Set<string>();
  return data.edges.filter((e) => {
    const key = `${e.from}>${e.to}`;
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lay nodes out in unit columns (used for nodes without any prerequisite link). */
function gridByUnit(
  nodes: ConceptGraphData["nodes"],
  size: { width: number; height: number },
  gap: { gapX: number; gapY: number },
  origin: { x: number; y: number },
  maxWidth?: number,
): Map<string, { x: number; y: number; col: number; row: number }> {
  const out = new Map<string, { x: number; y: number; col: number; row: number }>();
  if (maxWidth !== undefined) {
    // Row-major grid under an existing layout, grouped by unit order.
    const perRow = Math.max(1, Math.floor((maxWidth + gap.gapX) / (size.width + gap.gapX)));
    const units = [...new Set(nodes.map((n) => n.unit))];
    const sorted = [...nodes].sort((a, b) => units.indexOf(a.unit) - units.indexOf(b.unit));
    sorted.forEach((n, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      out.set(n.id, {
        x: origin.x + col * (size.width + gap.gapX),
        y: origin.y + row * (size.height + gap.gapY),
        col,
        row,
      });
    });
    return out;
  }
  let col = 0;
  const units = [...new Set(nodes.map((n) => n.unit))];
  for (const unit of units) {
    const members = nodes.filter((n) => n.unit === unit);
    members.forEach((n, i) => {
      const c = col + Math.floor(i / MAX_COLUMN);
      const row = i % MAX_COLUMN;
      out.set(n.id, {
        x: origin.x + c * (size.width + gap.gapX),
        y: origin.y + row * (size.height + gap.gapY),
        col: c,
        row,
      });
    });
    col += Math.ceil(members.length / MAX_COLUMN);
  }
  return out;
}

export function layoutGraph(data: ConceptGraphData, compact = false): GraphLayout {
  const size = compact ? NODE_SIZE.compact : NODE_SIZE.normal;
  const sp = compact ? SPACING.compact : SPACING.normal;
  const edges = validEdges(data);
  const positions = new Map<string, NodePlacement>();
  if (data.nodes.length === 0) return { positions, edges, width: 0, height: 0 };

  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const connected = data.nodes.filter((n) => linked.has(n.id));
  const isolated = data.nodes.filter((n) => !linked.has(n.id));

  let width = 0;
  let height = 0;

  if (connected.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: sp.nodesep, ranksep: sp.ranksep, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of connected) g.setNode(n.id, { width: size.width, height: size.height });
    for (const e of edges) g.setEdge(e.from, e.to);
    dagre.layout(g);

    for (const n of connected) {
      const p = g.node(n.id);
      const x = (p.x ?? 0) - size.width / 2;
      const y = (p.y ?? 0) - size.height / 2;
      const rank = Math.round(x / (size.width + sp.ranksep));
      const row = Math.round(y / (size.height + sp.nodesep));
      positions.set(n.id, {
        x,
        y,
        delayMs: Math.min(MAX_DELAY_MS, rank * DELAY_PER_RANK_MS + row * DELAY_PER_ROW_MS),
      });
      width = Math.max(width, x + size.width);
      height = Math.max(height, y + size.height);
    }
  }

  if (isolated.length > 0) {
    // Nothing links to these: park them in a grid (unit order) below the DAG, or as
    // unit columns when the graph has no edges at all.
    const underDag = connected.length > 0;
    const grid = gridByUnit(
      isolated,
      size,
      sp,
      { x: 0, y: underDag ? height + sp.ranksep * 0.75 : 0 },
      underDag ? Math.max(width, size.width * 3 + sp.gapX * 2) : undefined,
    );
    for (const n of isolated) {
      const p = grid.get(n.id)!;
      positions.set(n.id, {
        x: p.x,
        y: p.y,
        delayMs: Math.min(MAX_DELAY_MS, p.col * DELAY_PER_RANK_MS + p.row * DELAY_PER_ROW_MS),
      });
      width = Math.max(width, p.x + size.width);
      height = Math.max(height, p.y + size.height);
    }
  }

  return { positions, edges, width, height };
}

/** "Unit 2 · Transactions" → "U2"; otherwise a short uppercase tag. */
export function unitTag(unit: string): string {
  const m = /^\s*unit\s*[-:#]?\s*([0-9]+|[ivxlc]+)\b/i.exec(unit);
  if (m) return `U${m[1].toUpperCase()}`;
  const word = unit.trim().split(/[\s·:—-]+/)[0] ?? "";
  return word.length > 10 ? `${word.slice(0, 9)}…` : word;
}
