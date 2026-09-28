// Section 04 — the honesty rules, stated plainly.
const RULES = [
  {
    title: "Won’t hand you answers.",
    body: "The worked solution only appears once the hint ladder reaches the worked step. Ask for the answer early and you get a guiding question.",
  },
  {
    title: "Won’t invent exam scores.",
    body: "No readiness percentages, no predicted grades. Seeded demo history is labelled demo data. Estimated weightage says “estimated”.",
  },
  {
    title: "Shows its confidence.",
    body: "Every mastery value carries a confidence level. Thin evidence is drawn dashed and says “low confidence”.",
  },
] as const;

export function HonestyStrip() {
  return (
    <section id="honesty" aria-labelledby="honesty-title" className="scroll-mt-16 border-y border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="honesty-title" className="text-sm font-medium text-muted-foreground">
          Honesty rules
        </h2>
        <ul className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
          {RULES.map((r) => (
            <li key={r.title} className="flex flex-col gap-3">
              <p className="flex items-start gap-3 text-xl font-semibold leading-snug text-balance sm:text-[28px]">
                <span className="nu-dot mt-[0.4em]" aria-hidden />
                {r.title}
              </p>
              <p className="pl-5 text-sm text-muted-foreground text-pretty">{r.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
