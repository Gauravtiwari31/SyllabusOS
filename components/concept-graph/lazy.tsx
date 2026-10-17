"use client";
// Code-split entry for the concept graph. React Flow + dagre are the heaviest client code in
// the app, so screens import this instead of ./index: the canvas downloads in its own chunk
// (server-rendered HTML stays in place while it hydrates) and the rest of the page doesn't
// wait for it.
import { lazy, Suspense } from "react";
import { DotLoader } from "@/components/nu";
import { cn } from "@/lib/utils";
import type { ConceptGraphProps } from "./index";

const ConceptGraphImpl = lazy(() => import("./index").then((m) => ({ default: m.ConceptGraph })));

/** Same footprint as the canvas, so nothing shifts when it arrives. */
export function GraphPlaceholder({
  height = 520,
  className,
}: {
  height?: number | string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)} style={{ height }}>
      <DotLoader label="Loading graph" />
    </div>
  );
}

export function LazyConceptGraph(props: ConceptGraphProps) {
  return (
    <Suspense fallback={<GraphPlaceholder height={props.height} className={props.className} />}>
      <ConceptGraphImpl {...props} />
    </Suspense>
  );
}
