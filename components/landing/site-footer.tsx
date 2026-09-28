import { Logo } from "@/components/logo";
import { CtaGroup } from "./cta-group";

/** Closing call-to-action + footer credits. */
export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <section
        aria-labelledby="closing-title"
        className="flex flex-col gap-8 py-16 sm:py-24 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="flex max-w-2xl flex-col gap-4">
          <h2
            id="closing-title"
            className="text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-tight tracking-[-0.02em] text-balance"
          >
            Start with the demo, or bring your syllabus<span className="text-nu-accent">.</span>
          </h2>
          <p className="text-base text-muted-foreground text-pretty sm:text-lg">
            SyllabusOS doesn’t answer your homework. It decides the next best thing for you to learn, explains why,
            and makes sure you actually learn it.
          </p>
        </div>
        <CtaGroup signedIn={signedIn} size="lg" className="shrink-0" />
      </section>

      <div className="flex flex-col gap-4 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
        <Logo href="/" />
        <p className="nu-meta">© 2026 SyllabusOS · Built by Team Crazy Coders</p>
      </div>
    </footer>
  );
}
