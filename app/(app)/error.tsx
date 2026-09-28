"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Meta, Tile } from "@/components/nu";

// Rendered inside the app shell when a page under (app) throws.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Server errors arrive with a generic message in production; only show client-side messages.
  const detail = error.digest ? null : error.message;

  return (
    <div className="flex flex-1 items-center justify-center py-10 sm:py-16">
      <Tile className="w-full max-w-xl items-start gap-5" role="alert" aria-live="assertive">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">Something went wrong on this screen</h1>
          <p className="text-sm text-muted-foreground text-pretty">
            This page failed to load. Try again — if it keeps happening, go back to the dashboard.
          </p>
          {detail && <p className="text-sm text-pretty">{detail}</p>}
          {error.digest && <Meta>ref · {error.digest}</Meta>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => retry()} size="lg">
            <RotateCcw data-icon="inline-start" strokeWidth={1.5} />
            Retry
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </Tile>
    </div>
  );
}
