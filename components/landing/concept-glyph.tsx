import { Tile, TileHeader, Dot } from "@/components/nu";
import type { MasteryBand } from "@/lib/engine/types";
import styles from "./landing.module.css";

// Decorative mini concept graph for the hero. Static illustration, not live data.
type GlyphNode = { id: string; label: string; x: number; y: number; band: MasteryBand; target?: boolean };

const NODES: GlyphNode[] = [
  { id: "txn", label: "TRANSACTIONS", x: 44, y: 48, band: "strong" },
  { id: "sch", label: "SCHEDULES", x: 44, y: 158, band: "strong" },
  { id: "acid", label: "ACID", x: 142, y: 26, band: "developing" },
  { id: "conf", label: "CONFLICT SER.", x: 142, y: 104, band: "weak", target: true },
  { id: "view", label: "VIEW SER.", x: 142, y: 184, band: "unknown" },
  { id: "rec", label: "RECOVERABILITY", x: 236, y: 60, band: "unknown" },
  { id: "2pl", label: "2PL", x: 236, y: 150, band: "developing" },
  { id: "dl", label: "DEADLOCKS", x: 312, y: 104, band: "unknown" },
];

const EDGES: Array<[string, string]> = [
  ["txn", "acid"],
  ["txn", "conf"],
  ["sch", "conf"],
  ["sch", "view"],
  ["acid", "rec"],
  ["conf", "rec"],
  ["conf", "2pl"],
  ["view", "2pl"],
  ["rec", "dl"],
  ["2pl", "dl"],
];

const FILL: Record<MasteryBand, string> = {
  strong: "var(--nu-strong)",
  developing: "var(--nu-mid)",
  weak: "var(--nu-weak)",
  unknown: "var(--nu-unknown)",
};

const byId = new Map(NODES.map((n) => [n.id, n]));

export function ConceptGlyph({ className }: { className?: string }) {
  return (
    <Tile as="aside" className={className} aria-labelledby="glyph-title">
      <TileHeader label={<span id="glyph-title">Your syllabus, as a graph</span>} />
      <figure className="flex flex-col gap-4">
        <svg
          viewBox="0 0 356 212"
          className="h-auto w-full text-foreground"
          role="img"
          aria-label="Illustration: a concept graph coloured by mastery. Conflict serializability is weak and highlighted as the next thing to study; it unlocks Recoverability."
        >
          {EDGES.map(([a, b]) => {
            const from = byId.get(a);
            const to = byId.get(b);
            if (!from || !to) return null;
            const hot = a === "conf" && b === "rec";
            return (
              <line
                key={`${a}-${b}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                strokeOpacity={hot ? 0.85 : 0.3}
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="0.1 6"
              />
            );
          })}
          {NODES.map((n) => {
            const unknown = n.band === "unknown";
            return (
              <g key={n.id}>
                {n.target && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={16}
                    className={styles.target}
                    style={{ fill: "var(--nu-accent-muted)", stroke: "var(--nu-accent)", strokeOpacity: 0.4 }}
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={unknown ? 7.5 : 9}
                  style={
                    unknown
                      ? { fill: "transparent", stroke: FILL[n.band], strokeWidth: 1.6, strokeDasharray: "2.4 2.4" }
                      : { fill: FILL[n.band] }
                  }
                />
                <text
                  x={n.x}
                  y={n.y + (n.target ? 30 : 23)}
                  textAnchor="middle"
                  className="font-mono"
                  style={{ fontSize: 8.5, letterSpacing: "0.04em", fill: n.target ? "var(--foreground)" : "var(--nu-dim)" }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption>
          <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Legend">
            <li className="inline-flex items-center gap-1.5 nu-meta">
              <Dot band="weak" /> Weak
            </li>
            <li className="inline-flex items-center gap-1.5 nu-meta">
              <Dot band="developing" /> Developing
            </li>
            <li className="inline-flex items-center gap-1.5 nu-meta">
              <Dot band="strong" /> Strong
            </li>
            <li className="inline-flex items-center gap-1.5 nu-meta">
              <Dot band="unknown" dashed /> No data yet
            </li>
          </ul>
        </figcaption>
      </figure>
    </Tile>
  );
}
