// Offline "Explain My Mistake": why-wrong and correct reasoning from the tutor script
// (misconception nudge + worked step), and a bank question as the retry (null when the
// concept has no bank coverage: no made-up questions).
import type { RetrievedChunk } from "@/lib/rag";
import type { MistakeExplanation } from "../schemas";
import { bankDraftsFor } from "./questions";
import { scriptFor } from "./tutor";
import { containsPhrase, normalize } from "./text";

export function offlineExplainMistake(input: {
  concept: { id: string; name: string; unit: string; description?: string | null };
  prompt: string;
  response: string;
  misconception: string | null;
  chunks: RetrievedChunk[];
}): MistakeExplanation {
  const script = scriptFor(input.concept, input.chunks);
  const norm = normalize(input.response);
  const matched =
    script.misconceptions.find((m) => input.misconception && m.label.toLowerCase() === input.misconception.toLowerCase()) ??
    script.misconceptions.find((m) => m.triggers.some((t) => containsPhrase(norm, t)));

  const whyWrong = matched
    ? `This looks like a common slip (${matched.label}). ${matched.nudge}`
    : input.misconception
      ? `Your answer shows this misconception: ${input.misconception}. Compare what you wrote with the key idea below.`
      : `Your answer missed a key idea of ${input.concept.name}. Compare it with the reasoning below.`;

  const [retry] = bankDraftsFor(input.concept, "practice", 3).filter((q) => q.body.trim() !== input.prompt.trim());
  return {
    whyWrong,
    correctReasoning: script.workedStep,
    retry: retry
      ? {
          conceptName: input.concept.name,
          type: retry.type,
          body: retry.body,
          options: retry.options,
          answer: retry.answer,
          explanation: retry.explanation,
          difficulty: retry.difficulty,
        }
      : null,
  };
}

