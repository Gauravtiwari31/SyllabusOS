"use server";

// Sign-in / sign-out server actions used by the landing and login pages.
// A successful signIn() throws Next's redirect, which must propagate untouched —
// only Auth.js errors are caught and turned into a /login?error=… notice.
import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isGoogleAuthEnabled, signIn, signOut } from "@/auth";

const GuestModeSchema = z.enum(["demo", "fresh"]);
type GuestMode = z.infer<typeof GuestModeSchema>;

/** Where each entry point lands after sign-in. */
const LANDING: Record<GuestMode, string> = {
  demo: "/dashboard",
  fresh: "/goal/new",
};

function toLoginError(error: unknown): never {
  if (error instanceof AuthError) {
    const code = error instanceof CredentialsSignin ? error.code : null;
    redirect(`/login?error=${encodeURIComponent(error.type)}${code ? `&code=${encodeURIComponent(code)}` : ""}`);
  }
  throw error;
}

async function guestSignIn(mode: GuestMode): Promise<void> {
  try {
    await signIn("guest", { mode, redirectTo: LANDING[mode] });
  } catch (error) {
    toLoginError(error);
  }
}

/** "Try the demo": guest account with the seeded DBMS goal → /dashboard. */
export async function startDemo(): Promise<void> {
  await guestSignIn("demo");
}

/** "Use my syllabus" / "Start fresh as guest": empty guest account → /goal/new. */
export async function startFresh(): Promise<void> {
  await guestSignIn("fresh");
}

/** Form variant: reads a hidden `mode` field ("demo" | "fresh"); anything else → demo. */
export async function signInAsGuest(formData: FormData): Promise<void> {
  const parsed = GuestModeSchema.safeParse(formData.get("mode"));
  await guestSignIn(parsed.success ? parsed.data : "demo");
}

/** Google OAuth (only offered when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are set). */
export async function signInWithGoogle(): Promise<void> {
  if (!isGoogleAuthEnabled()) redirect("/login?error=Configuration");
  try {
    await signIn("google", { redirectTo: "/dashboard" });
  } catch (error) {
    toLoginError(error);
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
