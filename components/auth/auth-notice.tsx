import { CircleAlert, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline notice above the sign-in tiles (expired session, failed sign-in). */
export function AuthNotice({
  tone,
  children,
  className,
}: {
  tone: "expired" | "error";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "expired" ? Clock : CircleAlert;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-[var(--nu-radius-sm)] border px-4 py-3 text-sm",
        tone === "error"
          ? "border-nu-accent/50 bg-nu-accent-muted text-foreground"
          : "border-border bg-card text-foreground",
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-nu-accent" : "text-muted-foreground")}
        strokeWidth={1.5}
        aria-hidden
      />
      <p>{children}</p>
    </div>
  );
}

const ERROR_COPY = new Map<string, string>([
  ["CallbackRouteError", "Couldn’t start the guest session. Please try again."],
  ["CredentialsSignin", "Couldn’t start the guest session. Please try again."],
  ["AccessDenied", "Google sign-in was cancelled, or that Google account isn’t verified."],
  ["OAuthSignInError", "Couldn’t reach Google. Try again, or use a guest account."],
  ["OAuthCallbackError", "Google sign-in didn’t complete. Try again, or use a guest account."],
  ["OAuthAccountNotLinked", "That Google account can’t be linked. Use a guest account instead."],
  ["Configuration", "Sign-in isn’t configured correctly on this server."],
  ["MissingSecret", "Sign-in isn’t configured correctly on this server."],
]);

const CODE_COPY = new Map<string, string>([
  ["rate_limited", "Too many guest sessions were started from this network. Please wait a while and try again."],
]);

/**
 * Human copy for an Auth.js error type from ?error=… and an optional ?code=… (unknown or
 * malformed values get a generic line; lookups never touch the prototype chain).
 */
export function authErrorMessage(error: string, code?: string | null): string {
  const clean = (v: string | null | undefined) => (v && v.length <= 40 && /^[A-Za-z_]+$/.test(v) ? v : null);
  const c = clean(code);
  if (c && CODE_COPY.has(c)) return CODE_COPY.get(c)!;
  const e = clean(error);
  return (e && ERROR_COPY.get(e)) || "Couldn’t sign you in. Please try again.";
}
