import Link from "next/link";
import { cn } from "@/lib/utils";

/** Dot-matrix wordmark: SYLLABUS·OS with the red dot as the separator. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 select-none", className)} aria-label="SyllabusOS home">
      <span className="font-dot text-[19px] leading-none tracking-[0.08em] uppercase">Syllabus</span>
      <span className="nu-dot" aria-hidden />
      <span className="font-dot text-[19px] leading-none tracking-[0.08em] uppercase">OS</span>
    </Link>
  );
}
