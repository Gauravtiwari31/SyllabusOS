import { Chip, Tile } from "@/components/nu";

/** Honesty label for the seeded guest account (idea.md §7: seeded history is labelled). */
export function DemoBanner() {
  return (
    <Tile as="aside" className="flex-row flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3" aria-label="Demo account">
      <Chip tone="neutral">DEMO</Chip>
      <p className="text-sm text-muted-foreground">Demo account — seeded history is labelled demo data.</p>
    </Tile>
  );
}
