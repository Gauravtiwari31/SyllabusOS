import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

// Global 404 (also used when requireGoal() hits a goal the user doesn't own).
// Renders in the root layout only, so it brings its own minimal header.
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
        <p className="font-display text-[clamp(5rem,20vw,9rem)] leading-[0.85]" aria-hidden>
          404
        </p>
        <div className="flex max-w-xl flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">Page not found</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            This page doesn’t exist, or it belongs to a different account.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
