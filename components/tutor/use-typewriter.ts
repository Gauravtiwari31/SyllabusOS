"use client";

import { useEffect, useState } from "react";

/**
 * Quick typewriter reveal for a freshly arrived tutor message. Finishes within ~1.8 s regardless
 * of length; skipped entirely under prefers-reduced-motion.
 */
export function useTypewriter(text: string, animate: boolean): { text: string; done: boolean } {
  const [count, setCount] = useState(() => (animate ? 0 : text.length));

  useEffect(() => {
    if (!animate) return;
    const total = text.length;
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setCount(total));
      return () => cancelAnimationFrame(raf);
    }
    const duration = Math.min(1800, Math.max(350, total * 14));
    const start = performance.now();
    const tick = (t: number) => {
      const n = Math.min(total, Math.ceil(((t - start) / duration) * total));
      setCount(n);
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);

  if (!animate) return { text, done: true };
  return { text: text.slice(0, count), done: count >= text.length };
}
