// Interface font options (client-safe). The choice is per browser (localStorage) and applied
// as <html data-font="…"> before first paint by UI_FONT_SCRIPT in app/layout.tsx.
// Numerals and the wordmark keep the dot-matrix faces; this only changes running text.

export const UI_FONTS = [
  {
    id: "grotesk",
    name: "Space Grotesk",
    note: "Technical grotesk with quirky details. Closest to Nothing's product pages.",
  },
  {
    id: "mono",
    name: "JetBrains Mono",
    note: "Fully monospaced, like the Nothing OS system UI. Most instrument-like.",
  },
  {
    id: "geist",
    name: "Geist",
    note: "Sharp, minimal Swiss grotesk. The calmest for long reading.",
  },
] as const;

export type UiFontId = (typeof UI_FONTS)[number]["id"];

export const UI_FONT_DEFAULT: UiFontId = "grotesk";
export const UI_FONT_KEY = "sos-ui-font";

export function isUiFont(v: unknown): v is UiFontId {
  return typeof v === "string" && UI_FONTS.some((f) => f.id === v);
}

/** Inline, static script: runs before paint so the saved font never flashes. */
export const UI_FONT_SCRIPT = `try{var f=localStorage.getItem(${JSON.stringify(UI_FONT_KEY)});if(f==="grotesk"||f==="mono"||f==="geist")document.documentElement.dataset.font=f}catch(e){}`;

const EVENT = "sos-ui-font";

/** Current font from <html data-font>, for useSyncExternalStore. */
export function readUiFont(): UiFontId {
  const v = typeof document === "undefined" ? null : document.documentElement.dataset.font;
  return isUiFont(v) ? v : UI_FONT_DEFAULT;
}

export function subscribeUiFont(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Apply now and remember in this browser (storage may be blocked; the font still applies). */
export function applyUiFont(id: UiFontId): void {
  document.documentElement.dataset.font = id;
  try {
    localStorage.setItem(UI_FONT_KEY, id);
  } catch {
    // private mode / blocked storage
  }
  window.dispatchEvent(new Event(EVENT));
}
