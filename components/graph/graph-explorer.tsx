"use client";
// /graph: the whole concept graph with a details panel. Phones get a list view (panning a
// 30-node graph on a small screen is poor UX) and the details open as a bottom sheet.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, List, Network } from "lucide-react";
import { ConceptGraph, GraphLegend } from "@/components/concept-graph";
import { BAND_LABEL, DotBar, MasteryReadout, Tile, TileHeader, pct } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ConceptGraphData, GraphNode } from "@/lib/types";

function weightLine(c: GraphNode): string {
  const share = `${Math.round(c.weightage * 100)}%`;
  return c.weightageSource === "pyq"
    ? `${share} of past-paper marks${c.pyqMarks ? ` (${c.pyqMarks} marks)` : ""}`
    : `about ${share} of marks (estimated)`;
}

function ConceptDetails({
  concept,
  data,
  onSelect,
}: {
  concept: GraphNode;
  data: ConceptGraphData;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const prereqs = data.edges.filter((e) => e.to === concept.id).map((e) => byId.get(e.from)).filter(Boolean) as GraphNode[];
  const unlocks = data.edges.filter((e) => e.from === concept.id).map((e) => byId.get(e.to)).filter(Boolean) as GraphNode[];
  const related = (title: string, list: GraphNode[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <ul className="flex flex-wrap gap-1.5">
          {list.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs hover:bg-muted"
              >
                <span className="size-1.5 rounded-full" style={{ background: `var(--nu-${n.band === "developing" ? "mid" : n.band})` }} aria-hidden />
                {n.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{concept.unit}</p>
        {concept.description && <p className="text-sm text-muted-foreground text-pretty">{concept.description}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <MasteryReadout mastery={concept.mastery} band={concept.band} confidence={concept.confidence} />
          <span className="text-xs text-muted-foreground">
            {concept.band === "unknown" ? "Not assessed yet" : BAND_LABEL[concept.band]}
          </span>
        </div>
        <DotBar value={concept.band === "unknown" ? 0 : concept.mastery} band={concept.band} label="Mastery" />
        <p className="text-xs text-muted-foreground">
          {concept.evidenceCount < 0.01
            ? "No answers on this concept yet."
            : `Based on ${Math.round(concept.evidenceCount * 10) / 10} pieces of evidence · ${concept.confidence} confidence.`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Exam weightage</dt>
          <dd className="font-medium">{weightLine(concept)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Time to learn</dt>
          <dd className="font-medium tabular-nums">~{concept.estMinutes} min</dd>
        </div>
      </dl>
      {related("Needs first", prereqs)}
      {related("Unlocks", unlocks)}
      <Button asChild variant="accent" className="self-start">
        <Link href={`/learn/${concept.id}`} prefetch={false}>
          Study this now
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}

export function GraphExplorer({ data, recommendedId }: { data: ConceptGraphData; recommendedId: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(recommendedId);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = data.nodes.find((n) => n.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    // Below lg the details live in a sheet.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  };

  const units = data.units;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Tile flush className="min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <TileHeader label={`${data.nodes.length} concepts · ${units.length} units`} />
          <div className="inline-flex rounded-full border border-border p-0.5" role="group" aria-label="View">
            {(
              [
                ["graph", "Graph", Network],
                ["list", "List", List],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium pointer-coarse:h-10",
                  view === key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === "graph" ? (
          <div className="relative">
            <ConceptGraph
              data={data}
              highlightId={selectedId}
              height="min(70vh, 640px)"
              onNodeClick={select}
              className="min-h-[360px]"
            />
            <GraphLegend className="mx-4 mb-4 sm:absolute sm:bottom-3 sm:left-3 sm:mx-0 sm:mb-0 sm:max-w-[calc(100%-6rem)]" />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {units.map((u) => (
              <section key={u.name} className="px-4 py-3 sm:px-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{u.name}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {pct(u.mastery)}% · {Math.round(u.weightage * 100)}% of marks
                  </span>
                </div>
                <ul className="flex flex-col">
                  {data.nodes
                    .filter((n) => n.unit === u.name)
                    .map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => select(n.id)}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm hover:bg-muted",
                            n.id === selectedId && "bg-accent",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{n.name}</span>
                          <MasteryReadout mastery={n.mastery} band={n.band} confidence={n.confidence} />
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Tile>

      <Tile className="hidden lg:flex" aria-live="polite">
        {selected ? (
          <>
            <h2 className="text-lg font-semibold leading-snug">{selected.name}</h2>
            <ConceptDetails concept={selected} data={data} onSelect={setSelectedId} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a concept to see its mastery, weightage and prerequisites.</p>
        )}
      </Tile>

      <Dialog open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto lg:hidden">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription className="sr-only">Concept details</DialogDescription>
              </DialogHeader>
              <ConceptDetails concept={selected} data={data} onSelect={setSelectedId} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
