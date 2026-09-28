// Section 01 — a static, clearly-labelled illustration of the dashboard's Study Now tile.
// Numbers are consistent with the real formula in lib/engine/constants.ts:
// value = 0.30·W + 0.30·Gap + 0.20·Unlock + 0.10·Mistakes + 0.10·Decay, priority = value / √minutes.
import { Chip, DotBar, Meta, MasteryDelta, Stat, SubStat, Tile, TileHeader } from "@/components/nu";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const BREAKDOWN = [
  { key: "Weightage", weight: 0.3, value: 0.9, note: "18% of PYQ marks" },
  { key: "Gap", weight: 0.3, value: 0.58, note: "1 − 42% mastery" },
  { key: "Unlock", weight: 0.2, value: 0.95, note: "Recoverability, 2PL wait on it" },
  { key: "Mistakes", weight: 0.1, value: 0.88, note: "Same misconception twice → counts extra" },
  { key: "Decay", weight: 0.1, value: 0.1, note: "Practised 2 days ago" },
] as const;

const contributions = BREAKDOWN.map((r) => r.weight * r.value);
const TOTAL = contributions.reduce((s, c) => s + c, 0);
const TOP_TWO = new Set(
  [...contributions.keys()].sort((a, b) => contributions[b] - contributions[a]).slice(0, 2),
);
const MINUTES = 25;

const LADDER = [
  { key: "probe", label: "Probe" },
  { key: "hint1", label: "Hint" },
  { key: "hint2", label: "Hint+" },
  { key: "worked_step", label: "Worked" },
  { key: "check", label: "Check" },
] as const;
const CURRENT_RUNG = 1;

const PLAN = [
  { kind: "Learn", name: "Conflict serializability", min: 25 },
  { kind: "Learn", name: "Recoverability", min: 10 },
  { kind: "Practice", name: "Mixed questions", min: 15 },
  { kind: "Revision", name: "Functional dependencies", min: 10 },
] as const;

export function StudyNowPreview() {
  return (
    <section aria-labelledby="money-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <SectionHeading
        index="01"
        eyebrow="Study now"
        id="money-title"
        title="One button. One concept. The reason, in numbers."
        lede="Study Now picks what to learn next with a deterministic engine — weightage, gap, unlocks, mistakes and decay — and shows its working. No chatbot decides your day."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        {/* Study Now — the hero widget */}
        <Tile accent className="gap-6 md:col-span-2 lg:col-span-7 lg:row-span-2">
          <TileHeader label="Study now" live />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-2xl font-semibold leading-tight text-balance sm:text-[32px]">
                Conflict serializability
              </p>
              <Meta>UNIT 3 · TRANSACTIONS &amp; CONCURRENCY</Meta>
            </div>
            <Stat value={MINUTES} unit="MIN" size="lg" className="shrink-0" />
          </div>

          <p className="text-base text-pretty sm:text-lg">
            High exam weightage (18% of PYQ marks) and it unlocks Recoverability.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="nu-label">Why this, now</span>
              <Meta className="hidden sm:inline">weight × score = contribution</Meta>
            </div>
            <ul className="flex flex-col gap-3">
              {BREAKDOWN.map((row, i) => {
                const top = TOP_TWO.has(i);
                return (
                  <li key={row.key} className="grid grid-cols-[5.25rem_1fr_auto] items-center gap-x-3 gap-y-1">
                    <span className={cn("nu-label text-[11px]", top && "text-foreground")}>{row.key}</span>
                    <DotBar
                      value={row.value}
                      segments={16}
                      className={cn(!top && "opacity-45")}
                      label={`${row.key} score ${Math.round(row.value * 100)} percent`}
                    />
                    <span className="font-mono text-xs tabular-nums">
                      <span className="hidden text-muted-foreground sm:inline">
                        {row.weight.toFixed(2)} × {row.value.toFixed(2)} ={" "}
                      </span>
                      <span className={cn(top ? "text-foreground" : "text-muted-foreground")}>
                        {contributions[i].toFixed(2)}
                      </span>
                    </span>
                    <span className="col-start-2 col-end-4 hidden nu-meta text-[11px] sm:block">{row.note}</span>
                  </li>
                );
              })}
            </ul>
            <div className="nu-rule my-1" aria-hidden />
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Meta>
                value {TOTAL.toFixed(2)} · priority = value ÷ √{MINUTES} = {(TOTAL / Math.sqrt(MINUTES)).toFixed(3)}
              </Meta>
              <Meta>prereq gate: Schedules 72% ≥ 50% ✓</Meta>
            </div>
          </div>
        </Tile>

        {/* Mastery before → after */}
        <Tile className="gap-4 lg:col-span-5">
          <TileHeader label="Mastery · after one session" />
          <MasteryDelta before={0.42} after={0.61} />
          <DotBar value={0.61} band="developing" label="Conflict serializability mastery 61 percent" />
          <Meta>Confidence: medium · 4 pieces of evidence</Meta>
        </Tile>

        {/* Socratic session + hint ladder */}
        <Tile className="gap-4 lg:col-span-5">
          <TileHeader label="Socratic session" right={<Meta>STAGE 2 / 5</Meta>} />
          <ol className="grid grid-cols-5 gap-1.5" aria-label={`Hint ladder, current stage ${LADDER[CURRENT_RUNG].label}`}>
            {LADDER.map((r, i) => (
              <li key={r.key} className="flex flex-col gap-1.5" aria-current={i === CURRENT_RUNG ? "step" : undefined}>
                <span
                  aria-hidden
                  className="h-1.5 rounded-full"
                  style={{
                    background:
                      i < CURRENT_RUNG ? "var(--foreground)" : i === CURRENT_RUNG ? "var(--nu-accent)" : "var(--nu-line)",
                  }}
                />
                <span className={cn("font-mono text-[10px] uppercase", i === CURRENT_RUNG ? "text-foreground" : "text-muted-foreground")}>
                  {r.label}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 text-sm">
            <p className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2">
              Just tell me if S1 is serializable.
            </p>
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border px-3.5 py-2.5">
              <p>
                I won’t hand you the verdict — you can get there. Which pairs of operations in S1 conflict? Start with
                T1’s write on A.
              </p>
              <Meta className="mt-1.5 block">DBMS_Unit2.pdf · p.7</Meta>
            </div>
          </div>
        </Tile>

        {/* Today's plan */}
        <Tile className="gap-4 lg:col-span-4">
          <TileHeader label="Today’s plan" right={<Meta>60 / 60 MIN</Meta>} />
          <ul className="flex flex-col gap-2.5">
            {PLAN.map((b) => (
              <li key={`${b.kind}-${b.name}`} className="flex items-center gap-3">
                <span className="nu-label w-18 shrink-0 text-[10px]">{b.kind}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                <SubStat className="text-[15px]">{b.min}</SubStat>
              </li>
            ))}
          </ul>
          <Meta>Skip a day or change minutes/day → it re-plans.</Meta>
        </Tile>

        {/* Days left / mode */}
        <Tile className="gap-3 lg:col-span-3">
          <TileHeader label="Exam in" />
          <Stat value="12" unit="DAYS" />
          <SubStat className="text-[15px]">LEARN MODE</SubStat>
          <Meta>≤ 3 days → revision. Not enough time → triage.</Meta>
        </Tile>

        {/* Mistake log */}
        <Tile className="gap-3 md:col-span-2 lg:col-span-5">
          <TileHeader label="Mistake log" right={<Chip tone="weak">Recurring</Chip>} />
          <Stat value="2" unit="× SAME MISTAKE" size="md" />
          <p className="text-sm">Confuses conflict serializability with view serializability.</p>
          <Meta>Recurring misconceptions raise that concept’s priority.</Meta>
        </Tile>
      </div>

      <p className="mt-4 nu-meta">
        Illustration built from the seeded DBMS demo account. Numbers are demo data, not a real student’s results.
      </p>
    </section>
  );
}
