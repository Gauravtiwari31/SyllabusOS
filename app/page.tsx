import { auth } from "@/auth";
import { Hero } from "@/components/landing/hero";
import { HonestyStrip } from "@/components/landing/honesty-strip";
import { LoopSection } from "@/components/landing/loop-section";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { StudyNowPreview } from "@/components/landing/study-now-preview";
import { UspSection } from "@/components/landing/usp-section";

// Public marketing page. Signed-in visitors get "Open dashboard" instead of the sign-in CTAs.
export default async function Home() {
  // A broken/missing auth config must not take the landing page down with it.
  const session = await auth().catch(() => null);
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>
      <SiteHeader signedIn={signedIn} />
      <main id="main" className="flex-1">
        <Hero signedIn={signedIn} />
        <StudyNowPreview />
        <LoopSection />
        <UspSection />
        <HonestyStrip />
      </main>
      <SiteFooter signedIn={signedIn} />
    </div>
  );
}
