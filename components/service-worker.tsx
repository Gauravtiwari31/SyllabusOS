"use client";
// Registers public/sw.js (offline fallback page) in production builds only, so local
// development never serves a stale worker.
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
