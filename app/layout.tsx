import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { ServiceWorker } from "@/components/service-worker";
import { UI_FONT_DEFAULT, UI_FONT_SCRIPT } from "@/lib/ui-font";
import "./globals.css";

// Interface text: three options the student picks in Settings (lib/ui-font.ts).
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });
const jbmono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"], display: "swap" });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });

// NThing UI type system — each face has exactly one job.
const ndot = localFont({
  src: "./fonts/ndot55.ttf",
  variable: "--font-ndot",
  display: "swap",
});
const dot5x7 = localFont({
  src: "./fonts/nothing_5_7.ttf",
  variable: "--font-5x7",
  display: "swap",
});
const ntype = localFont({
  src: "./fonts/ntype82_bold.ttf",
  variable: "--font-ntype",
  weight: "700",
  display: "swap",
});
const nmono = localFont({
  src: "./fonts/ntype_mono.otf",
  variable: "--font-nmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SyllabusOS — knows what you don't know",
    template: "%s · SyllabusOS",
  },
  description:
    "Upload your syllabus, notes and previous-year papers. SyllabusOS finds your weak concepts, decides what to study next and why, then teaches it Socratically.",
  applicationName: "SyllabusOS",
  appleWebApp: { capable: true, title: "SyllabusOS", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// Status-bar colour for the installed app / Android TWA, and edge-to-edge on notched phones.
export const viewport: Viewport = {
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-font={UI_FONT_DEFAULT}
      className={`${grotesk.variable} ${jbmono.variable} ${geist.variable} ${ndot.variable} ${dot5x7.variable} ${ntype.variable} ${nmono.variable} h-full antialiased`}
    >
      <head>
        {/* Static script (no user input): applies the saved interface font before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: UI_FONT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
