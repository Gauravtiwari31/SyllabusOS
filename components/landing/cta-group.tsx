import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DemoSignInForm, FreshSignInForm } from "@/components/auth/sign-in-forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Landing CTAs. Signed out: "Try the demo" (red, seeded DBMS guest) + "Use my syllabus"
 * (fresh guest → onboarding). Signed in: a single "Open dashboard".
 */
export function CtaGroup({
  signedIn,
  size = "xl",
  showNote = true,
  className,
}: {
  signedIn: boolean;
  size?: "lg" | "xl";
  showNote?: boolean;
  className?: string;
}) {
  if (signedIn) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="accent" size={size}>
            <Link href="/dashboard">
              Open dashboard
              <ArrowRight data-icon="inline-end" strokeWidth={1.5} />
            </Link>
          </Button>
        </div>
        {showNote && <p className="nu-meta">You&apos;re signed in · pick up where you left off</p>}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <DemoSignInForm size={size} className="w-full sm:w-auto" block />
        <FreshSignInForm size={size} className="w-full sm:w-auto" block />
      </div>
      {showNote && <p className="nu-meta">No sign-up · seeded demo data is labelled</p>}
    </div>
  );
}
