import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, isGoogleAuthEnabled } from "@/auth";
import { AuthNotice, authErrorMessage } from "@/components/auth/auth-notice";
import { DemoSignInForm, FreshSignInForm, GoogleSignInForm } from "@/components/auth/sign-in-forms";
import { Logo } from "@/components/logo";
import { Meta, Tile } from "@/components/nu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const expired = first(sp.expired) === "1";
  const errorCode = first(sp.error);

  // Signed in → straight to the app. Skipped on ?expired=1: that JWT points at a user
  // that no longer exists, and redirecting would bounce straight back here.
  const session = await auth().catch(() => null);
  if (session?.user?.id && !expired) redirect("/dashboard");

  const google = isGoogleAuthEnabled();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Get started</h1>
          <p className="max-w-xl text-base text-muted-foreground text-pretty">
            No email, no password. Open the seeded demo, start a blank guest account for your own syllabus
            {google ? ", or use Google to keep your goals." : "."}
          </p>
        </div>

        {(expired || errorCode) && (
          <div className="flex flex-col gap-3">
            {expired && <AuthNotice tone="expired">Your session expired — sign in again</AuthNotice>}
            {errorCode && <AuthNotice tone="error">{authErrorMessage(errorCode, first(sp.code))}</AuthNotice>}
          </div>
        )}

        <div className={cn("grid gap-4 md:grid-cols-2", google && "lg:grid-cols-3")}>
          <Tile accent className="gap-4">
            <h2 className="text-lg font-semibold">Try the demo</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              A seeded Database Management Systems account: concept graph, PYQ weightage, notes and about ten days of
              study history. No sign-up.
            </p>
            <Meta>Seeded history is labelled demo data.</Meta>
            <DemoSignInForm label="Try the demo" block className="mt-auto pt-2" />
          </Tile>

          <Tile className="gap-4">
            <h2 className="text-lg font-semibold">Start with your syllabus</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              An empty guest account. Set a goal, then upload your own syllabus, notes and previous-year papers.
            </p>
            <Meta>You can edit everything the syllabus reader extracts.</Meta>
            <FreshSignInForm label="Start fresh as guest" block className="mt-auto pt-2" />
          </Tile>

          {google && (
            <Tile className="gap-4 md:col-span-2 lg:col-span-1">
              <h2 className="text-lg font-semibold">Continue with Google</h2>
              <p className="text-sm text-muted-foreground text-pretty">Keep your goals and progress under your Google account.</p>
              <Meta>We only read your name, email and avatar.</Meta>
              <GoogleSignInForm block className="mt-auto pt-2" />
            </Tile>
          )}
        </div>

        <p className="nu-meta">
          Guest accounts need no email and are deleted after 7 days. Sign out of a guest account and it can’t be reopened.
        </p>
      </main>
    </div>
  );
}
