import * as React from "react";
import { cn } from "@/lib/utils";

/** Section eyebrow + title + optional lede. `index` is kept for call-site compatibility. */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lede,
  id,
  className,
}: {
  index: string;
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** id for the <h2>, used by aria-labelledby on the section */
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 max-w-3xl", className)}>
      <p className="text-sm font-medium text-muted-foreground" data-index={index}>
        {eyebrow}
      </p>
      <h2 id={id} className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-balance sm:text-4xl">
        {title}
      </h2>
      {lede && <p className="text-base text-muted-foreground max-w-2xl text-pretty">{lede}</p>}
    </div>
  );
}
