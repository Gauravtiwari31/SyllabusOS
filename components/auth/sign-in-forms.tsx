// Server-rendered sign-in forms. Each is a <form> bound to a server action with a
// client PendingButton inside, so they work without client JS and show a pending state with it.
import { ArrowRight, LogIn } from "lucide-react";
import { signInWithGoogle, startDemo, startFresh } from "@/app/actions/auth";
import { PendingButton } from "@/components/auth/pending-button";
import { cn } from "@/lib/utils";

type Size = "default" | "lg" | "xl";

interface FormButtonProps {
  label?: string;
  size?: Size;
  className?: string;
  /** stretch the button to the form width */
  block?: boolean;
}

/** Red primary CTA: guest account with the seeded DBMS demo → /dashboard. */
export function DemoSignInForm({ label = "Try the demo", size = "lg", className, block }: FormButtonProps) {
  return (
    <form action={startDemo} className={cn(block && "w-full", className)}>
      <PendingButton
        variant="accent"
        size={size}
        pendingLabel="Building your demo…"
        className={cn(block && "w-full")}
      >
        {label}
        <ArrowRight data-icon="inline-end" strokeWidth={1.5} />
      </PendingButton>
    </form>
  );
}

/** Empty guest account → onboarding at /goal/new. */
export function FreshSignInForm({ label = "Use my syllabus", size = "lg", className, block }: FormButtonProps) {
  return (
    <form action={startFresh} className={cn(block && "w-full", className)}>
      <PendingButton variant="outline" size={size} pendingLabel="Creating guest account…" className={cn(block && "w-full")}>
        {label}
      </PendingButton>
    </form>
  );
}

/** Google OAuth. Only render when isGoogleAuthEnabled() is true. */
export function GoogleSignInForm({ label = "Continue with Google", size = "lg", className, block }: FormButtonProps) {
  return (
    <form action={signInWithGoogle} className={cn(block && "w-full", className)}>
      <PendingButton variant="default" size={size} pendingLabel="Opening Google…" className={cn(block && "w-full")}>
        <LogIn data-icon="inline-start" strokeWidth={1.5} />
        {label}
      </PendingButton>
    </form>
  );
}
