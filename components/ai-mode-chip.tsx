import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AiMode } from "@/lib/types";

/** Honest indicator of whether answers come from Gemini or the offline engine. */
export function AiModeChip({ mode }: { mode: AiMode }) {
  const online = mode === "gemini";
  const label = online ? "Gemini" : "Offline mode";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`AI: ${label}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:border sm:border-border"
        >
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: online ? "var(--nu-strong)" : "var(--nu-mid)" }}
            aria-hidden
          />
          <span className="hidden sm:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {online
          ? "Tutor replies, question writing and syllabus reading use Gemini. What you study next is always calculated by the study engine."
          : "No Gemini key configured: the built-in question bank, a rule-based tutor and keyword search over your notes are used instead."}
      </TooltipContent>
    </Tooltip>
  );
}
