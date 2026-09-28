import { DotLoader, Tile, TileHeader } from "@/components/nu";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the dashboard grid so nothing jumps when data arrives.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-72 max-w-full rounded-full" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile accent className="col-span-2 min-h-[360px] gap-6 lg:row-span-2">
          <TileHeader label="Study now" live right={<DotLoader label="Ranking concepts…" />} />
          <Skeleton className="h-10 w-3/4 rounded-full" />
          <Skeleton className="h-20 w-40 rounded-2xl" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-2/3 rounded-full" />
          <Skeleton className="mt-auto h-14 w-48 rounded-full" />
        </Tile>
        {["Mastery", "Days left", "Sessions", "Open mistakes"].map((label) => (
          <Tile key={label} className="min-h-[172px] justify-between gap-4">
            <TileHeader label={label} />
            <Skeleton className="h-12 w-20 rounded-xl" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </Tile>
        ))}
        <Tile className="col-span-2 min-h-[280px] gap-4">
          <TileHeader label="Today's plan" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full rounded-full" />
          ))}
        </Tile>
        <Tile className="col-span-2 min-h-[280px] gap-4 lg:col-span-1">
          <TileHeader label="Mode" />
          <Skeleton className="h-24 w-32 rounded-xl" />
        </Tile>
        <Tile className="col-span-2 min-h-[280px] gap-4 lg:col-span-1">
          <TileHeader label="Weakest 3" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </Tile>
        <Tile className="col-span-2 min-h-[380px] gap-4">
          <TileHeader label="Concept graph" />
          <Skeleton className="flex-1 rounded-2xl" />
        </Tile>
        <Tile className="col-span-2 min-h-[380px] gap-4">
          <TileHeader label="Mastery trend" />
          <Skeleton className="flex-1 rounded-2xl" />
        </Tile>
      </div>
    </div>
  );
}
