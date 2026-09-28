// Section 02 — THE LOOP (idea.md §2): numbered tiles joined by a dotted track.
import { ArrowRight, RotateCcw } from "lucide-react";
import { Tile } from "@/components/nu";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

interface Step {
  n: string;
  title: string;
  body: string;
  tag: string;
  /** the deterministic engine — the one step that gets the accent */
  engine?: boolean;
  /** last step loops back to the engine */
  loop?: boolean;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Syllabus + notes + PYQs",
    body: "Upload PDFs or paste text. Notes are split per page, so every citation points at a real page.",
    tag: "INPUT",
  },
  {
    n: "02",
    title: "Concept graph",
    body: "20–40 concepts in units, with prerequisite edges. Rename, delete or add concepts before you confirm.",
    tag: "AI · YOU EDIT",
  },
  {
    n: "03",
    title: "Diagnostic",
    body: "Up to 10 questions, high-weightage and root concepts first. Then the graph turns red, amber, green.",
    tag: "MAX 10 QUESTIONS",
  },
  {
    n: "04",
    title: "Priority engine",
    body: "Weightage, gap, unlocks, mistakes and decay, with prerequisite gating. One concept, one reason.",
    tag: "CODE, NOT LLM",
    engine: true,
  },
  {
    n: "05",
    title: "Socratic session",
    body: "Probe → hint → stronger hint → worked step → check. Grounded in your notes, with page citations.",
    tag: "AI · CITED",
  },
  {
    n: "06",
    title: "Evidence",
    body: "Every reply is graded correct, partial or wrong, with the misconception. Wrong answers go to the mistake log.",
    tag: "MEASURED",
  },
  {
    n: "07",
    title: "Mastery",
    body: "Elo-lite per concept, shown with its confidence. One lucky answer reads as low confidence, not fact.",
    tag: "ELO-LITE",
  },
  {
    n: "08",
    title: "Re-plan",
    body: "Today’s plan re-ranks. Skip a day or change minutes per day and it re-flows instantly.",
    tag: "BACK TO 04",
    loop: true,
  },
];

function LoopTrack() {
  return (
    <div aria-hidden className="mt-10 hidden items-center gap-5 md:flex">
      <div className="relative flex-1">
        <div className="relative h-3">
          <div className="nu-rule absolute inset-x-0 top-1/2 -translate-y-1/2" />
          <div className="absolute inset-0 flex items-center justify-between">
            {STEPS.map((s) => (
              <span
                key={s.n}
                className={cn(
                  "size-3 rounded-full border bg-background",
                  s.engine ? "border-nu-accent" : "border-foreground/40",
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-between">
          {STEPS.map((s) => (
            <span key={s.n} className={cn("font-dot text-[12px]", s.engine ? "text-foreground" : "text-muted-foreground")}>
              {s.n}
            </span>
          ))}
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 nu-meta">
        <RotateCcw className="size-3.5" strokeWidth={1.5} />
        04
      </span>
    </div>
  );
}

export function LoopSection() {
  return (
    <section id="loop" aria-labelledby="loop-title" className="scroll-mt-16 border-y border-border bg-background/60">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading
          index="02"
          eyebrow="The loop"
          id="loop-title"
          title="One closed loop. Every answer moves the plan."
          lede="The product is the loop: each AI interaction has to produce a visible change in what you know — and in what you study next."
        />
        <LoopTrack />
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Tile as="li" key={s.n} accent={s.engine} className="gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">{s.n}</span>
                {s.loop ? (
                  <span className="inline-flex items-center gap-1 nu-meta" aria-label="Loops back to step 04">
                    <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden />
                    04
                  </span>
                ) : (
                  <ArrowRight className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <h3 className="text-base font-semibold leading-snug">{s.title}</h3>
              <p className="text-sm text-muted-foreground text-pretty">{s.body}</p>
            </Tile>
          ))}
        </ol>
      </div>
    </section>
  );
}
