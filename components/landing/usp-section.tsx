// Section 03 — the three USPs from idea.md §3, one hero numeral per tile.
import { Dot, DotBar, Meta, Tile, TileHeader } from "@/components/nu";
import { SectionHeading } from "./section-heading";

const RUNGS = ["Probe", "Hint", "Stronger hint", "Worked step", "Check"] as const;

const WEIGHTAGE = [
  { name: "Conflict serializability", share: 18, source: "pyq" },
  { name: "Normal forms", share: 14, source: "pyq" },
  { name: "ER model", share: 9, source: "pyq" },
  { name: "File organisation", share: 4, source: "estimated" },
] as const;

export function UspSection() {
  return (
    <section id="why" aria-labelledby="why-title" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        index="03"
        eyebrow="Why it’s different"
        id="why-title"
        title="What makes it different"
        lede="Students aren’t short of content. They’re short of decisions and real understanding — so that’s all SyllabusOS does."
      />

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {/* USP 1 */}
        <Tile as="article" className="gap-5">
          <TileHeader label="Decision engine" />
          <h3 className="text-lg font-semibold leading-snug">
            Decisions come from a tested study engine
          </h3>
          <p className="text-sm text-muted-foreground text-pretty">
            A deterministic, unit-tested priority engine decides what you study — from mastery, exam weightage,
            prerequisite unlocks, mistakes and time left. Every recommendation ships with a reason built from the
            actual score components.
          </p>
          <pre className="mt-auto overflow-x-auto rounded-xl border border-border bg-muted/50 p-3.5 font-mono text-[11px] leading-relaxed text-foreground">
            {`value = 0.30·Weightage + 0.30·Gap
      + 0.20·Unlock
      + 0.10·Mistakes + 0.10·Decay
priority = value / √minutes`}
          </pre>
        </Tile>

        {/* USP 2 */}
        <Tile as="article" className="gap-5">
          <TileHeader label="Socratic tutor" />
          <h3 className="text-lg font-semibold leading-snug">
            Socratic by default, every exchange measured
          </h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Tutors that never give the answer get abandoned. SyllabusOS climbs a hint ladder instead, and grades each
            reply into evidence — correct, partial or wrong, plus the misconception. An LLM-graded reply counts half a
            quiz answer.
          </p>
          <ol className="mt-auto flex flex-col gap-2" aria-label="Hint ladder">
            {RUNGS.map((r, i) => (
              <li key={r} className="flex items-center gap-3">
                <span className="w-5 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="h-px flex-1 nu-rule" aria-hidden />
                <span className="text-sm">{r}</span>
              </li>
            ))}
          </ol>
        </Tile>

        {/* USP 3 */}
        <Tile as="article" className="gap-5">
          <TileHeader label="Real weightage" />
          <h3 className="text-lg font-semibold leading-snug">
            Weightage from real previous-year papers
          </h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Upload two or three years of PYQs: every question is mapped to a concept, and weightage comes from actual
            marks in your university’s exam. No PYQs? You get an estimate — labelled “estimated”.
          </p>
          <ul className="mt-auto flex flex-col gap-3">
            {WEIGHTAGE.map((w) => (
              <li key={w.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">{w.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {w.source === "estimated" ? (
                      <span className="inline-flex items-center gap-1 nu-meta">
                        <Dot band="unknown" dashed size={7} /> estimated
                      </span>
                    ) : (
                      <Meta>PYQ</Meta>
                    )}
                    <span className="nu-substat text-[14px]">{w.share}%</span>
                  </span>
                </div>
                <DotBar
                  value={w.share / 20}
                  segments={20}
                  className={w.source === "estimated" ? "opacity-45" : undefined}
                  label={`${w.name}: ${w.share} percent of marks, ${w.source === "pyq" ? "from PYQs" : "estimated"}`}
                />
              </li>
            ))}
          </ul>
        </Tile>
      </div>
    </section>
  );
}
