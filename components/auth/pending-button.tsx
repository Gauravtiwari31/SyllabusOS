"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PendingButtonProps = Omit<React.ComponentProps<typeof Button>, "type" | "asChild"> & {
  /** Label shown while the parent <form> action is running. */
  pendingLabel?: string;
};

/**
 * Submit button for a server-action <form>: disables itself and swaps to three
 * pulsing dots + `pendingLabel` while the action runs. Must render inside the form.
 */
export function PendingButton({ children, pendingLabel, disabled, className, ...props }: PendingButtonProps) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        className={cn(className)}
        {...props}
      >
        {pending ? (
          <>
            <span className="inline-flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.25 rounded-full bg-current nu-dot--live"
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </span>
            <span>{pendingLabel ?? children}</span>
          </>
        ) : (
          children
        )}
      </Button>
      {/* Announced outside the button so it doesn't change the button's accessible name. */}
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? (pendingLabel ?? "Working…") : ""}
      </span>
    </>
  );
}
