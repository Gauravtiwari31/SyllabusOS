import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db } from "@/lib/db";
import { createGuestUser } from "@/lib/demo";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; isGuest: boolean } & DefaultSession["user"];
  }
}

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Shown on /login?error=CredentialsSignin&code=rate_limited. */
class GuestRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const GuestMode = z.enum(["demo", "fresh"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Host headers are trusted on Vercel, in development, or when AUTH_TRUST_HOST=true (behind
  // your own proxy). Elsewhere set AUTH_URL.
  trustHost:
    process.env.VERCEL === "1" || process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    // Judges click "Try demo" → fresh guest account with the seeded DBMS goal.
    // mode "fresh" → empty guest account to run onboarding on their own syllabus.
    // Both the server actions and POST /api/auth/callback/guest land here, so the
    // account-minting limits live here too.
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: { mode: { type: "text" } },
      async authorize(credentials, request) {
        const parsed = GuestMode.safeParse(credentials?.mode);
        const mode = parsed.success ? parsed.data : "demo";
        const ip = ipFromHeaders(request.headers);
        const [perIp, global] = await Promise.all([rateLimit("guestSignup", ip), rateLimit("guestSignupGlobal", "all")]);
        if (!perIp.ok || !global.ok) throw new GuestRateLimited();
        const user = await createGuestUser(mode);
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Only verified Google addresses may sign in (the account is keyed by email).
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        if (account.provider === "google") {
          if (!user.email) throw new Error("Google account has no email");
          const email = user.email.toLowerCase();
          const existing = await db.user.findUnique({ where: { email }, select: { id: true, isGuest: true } });
          // Guest rows use a reserved domain, but never let a Google login take one over.
          if (existing?.isGuest) throw new Error("Email belongs to a guest account");
          const dbUser = await db.user.upsert({
            where: { email },
            update: { name: user.name ?? undefined, image: user.image ?? undefined },
            create: { email, name: user.name, image: user.image, isGuest: false },
          });
          token.uid = dbUser.id;
          token.isGuest = false;
        } else {
          token.uid = user.id;
          token.isGuest = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.isGuest = Boolean(token.isGuest);
      return session;
    },
  },
});

export const isGoogleAuthEnabled = () => googleEnabled;
