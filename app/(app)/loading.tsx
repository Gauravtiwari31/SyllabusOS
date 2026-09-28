import { DotLoader, Tile } from "@/components/nu";
import { Skeleton } from "@/components/ui/skeleton";

// Streaming fallback for every page under the app shell: a header + tile-grid skeleton.
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-8 w-64 max-w-full rounded-full" />
        </div>
        <DotLoader label="Loading…" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        <Tile className="gap-5 md:col-span-2 lg:col-span-7 lg:row-span-2">
          <Skeleton className="h-3 w-28 rounded-full" />
          <Skeleton className="h-8 w-3/4 rounded-full" />
          <Skeleton className="h-14 w-32 rounded-2xl" />
          <div className="flex flex-col gap-3 pt-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-2 w-full rounded-full" />
            ))}
          </div>
        </Tile>
        {Array.from({ length: 4 }, (_, i) => (
          <Tile key={i} className="gap-4 lg:col-span-5">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-12 w-28 rounded-2xl" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </Tile>
        ))}
      </div>
    </div>
  );
}
