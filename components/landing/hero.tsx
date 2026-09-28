import { CtaGroup } from "./cta-group";
import { ConceptGlyph } from "./concept-glyph";
import styles from "./landing.module.css";

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="nu-dotgrid border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20 lg:grid-cols-12 lg:pt-20 lg:pb-24">
        <div className="flex min-w-0 flex-col gap-7 lg:col-span-7">
          <p className="text-sm font-medium text-muted-foreground">For university exam preparation</p>

          <h1
            id="hero-title"
            className="font-display uppercase leading-[0.9] tracking-[0.01em] text-[clamp(2.75rem,14vw,7rem)] lg:text-[min(7.6vw,7rem)]"
          >
            <span className={styles.rise}>Knows what</span>
            <span className={styles.rise}>you don’t</span>
            <span className={styles.rise}>
              know<span className="text-nu-accent">.</span>
            </span>
          </h1>

          <p className="text-xl font-semibold leading-snug sm:text-2xl">Teaches it without doing it for you.</p>

          <p className="max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
            Upload your syllabus, notes and previous-year papers. SyllabusOS finds your weak concepts, decides
            what you should study next and <em className="text-foreground">why</em>,
            then teaches it Socratically — and every answer you give updates the plan.
          </p>

          <CtaGroup signedIn={signedIn} />
        </div>

        <div className="mx-auto flex w-full min-w-0 max-w-lg flex-col justify-end gap-4 lg:col-span-5 lg:max-w-none">
          <ConceptGlyph />
        </div>
      </div>
    </section>
  );
}
