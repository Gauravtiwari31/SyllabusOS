import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP without nonces (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// Inline scripts are needed for Next's bootstrap and next-themes; everything else is 'self'.
// Google is allowed only where sign-in needs it (form POST redirect, avatar images).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://lh3.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // unpdf ships a large worker bundle; keep it (and pg) out of the server bundle.
  serverExternalPackages: ["unpdf", "pg"],
  experimental: {
    serverActions: {
      // Syllabus / notes / PYQ PDFs are uploaded through server actions. Vercel functions take
      // at most 4.5 MB per request; the 4 MB file cap is enforced again in
      // app/actions/onboarding.ts before any parsing, and every action requires a session.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The service worker must be re-checked on every visit so updates reach installed apps.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  async rewrites() {
    // Android app links (docs/ANDROID.md): the file is built from environment variables.
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/android/assetlinks" }];
  },
};

export default nextConfig;
