// Client-safe band derivation for view models that carry mastery + confidence
// but not the band itself (Recommendation, WeakTopic, RevisionItem).
import { BAND_STRONG_FROM, BAND_WEAK_BELOW } from "@/lib/engine/constants";
import type { Confidence, MasteryBand } from "@/lib/engine/types";

export function bandFrom(mastery: number, confidence: Confidence): MasteryBand {
  if (confidence === "none") return "unknown";
  if (mastery < BAND_WEAK_BELOW) return "weak";
  if (mastery >= BAND_STRONG_FROM) return "strong";
  return "developing";
}

/** Band from a bare 0..1 mastery value when confidence is unknown to the caller. */
export function bandFromMastery(mastery: number): MasteryBand {
  return bandFrom(mastery, "low");
}
