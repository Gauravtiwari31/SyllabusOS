import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest). Makes the site installable and is
// the source Bubblewrap reads to build the Android app (see docs/ANDROID.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SyllabusOS",
    short_name: "SyllabusOS",
    description:
      "Finds your weak concepts, decides what to study next and why, then teaches it Socratically.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["education", "productivity"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Study now", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Today's plan", url: "/plan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mistakes", url: "/mistakes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
