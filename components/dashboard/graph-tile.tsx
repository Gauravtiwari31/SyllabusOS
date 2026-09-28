"use client";
// Concept graph preview on the dashboard; any node opens the full graph.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { ConceptGraphData } from "@/lib/types";
import type { MasteryBand } from "@/lib/engine/types";
import { ConceptGraph } from "@/components/concept-graph";
import { BAND_LABEL, Dot, EmptyState, Meta, Tile, TileHeader } from "@/components/nu";
import { cn } from "@/lib/utils";

const LEGEND: MasteryBand[] = ["weak", "developing", "strong", "unknown"];

export function GraphTile({
  data,
  highlightId,
  className,
}: {
  data: ConceptGraphData;
  highlightId: string | null;
  className?: string;
}) {
  const router = useRouter();
  const counts = new Map<MasteryBand, number>();
  for (const n of data.nodes) counts.set(n.band, (counts.get(n.band) ?? 0) + 1);

  return (
    <Tile flush className={cn("gap-0", className)}>
      <div className="flex flex-col gap-3 p-6 pb-3">
        <TileHeader
          label="Concept graph"
          right={
            <Link
              href="/graph"
              className="inline-flex items-center gap-1 rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Explore
              <ArrowRight strokeWidth={1.5} className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Mastery bands">
          {LEGEND.map((band) => (
            <li key={band} className="inline-flex items-center gap-1.5">
              <Dot band={band} dashed={band === "unknown"} />
              <Meta>
                {BAND_LABEL[band]} {counts.get(band) ?? 0}
              </Meta>
            </li>
          ))}
        </ul>
      </div>
      {data.nodes.length === 0 ? (
        <EmptyState title="No concepts yet" description="Confirm your syllabus to build the graph." />
      ) : (
        <div className="border-t border-border">
          <ConceptGraph
            data={data}
            compact
            interactive={false}
            highlightId={highlightId}
            height={300}
            onNodeClick={() => router.push("/graph")}
          />
        </div>
      )}
    </Tile>
  );
}
