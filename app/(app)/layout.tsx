import { Logo } from "@/components/logo";
import { NavLinks, TabBar } from "@/components/app-shell/nav-links";
import { UserMenu } from "@/components/app-shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiModeChip } from "@/components/ai-mode-chip";
import { aiMode } from "@/lib/ai";
import { requireUser } from "@/lib/session";

// Authenticated app shell. Every page under (app) requires a signed-in user (and each page
// also runs its own guard). Top nav from lg; a bottom tab bar below that, except on short
// landscape screens (phones turned sideways), where icon nav moves into the header.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 short:h-12 sm:px-6">
          <Logo href="/dashboard" />
          <NavLinks className="ml-4 hidden lg:flex" />
          <NavLinks compact className="ml-1 hidden short:max-lg:flex" />
          <div className="ml-auto flex items-center gap-1">
            <AiModeChip mode={aiMode()} />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="nu-tabbar-pad mx-auto w-full max-w-7xl flex-1 px-4 pt-5 short:pt-4 sm:px-6 sm:pt-8 lg:pb-10">{children}</main>
      <TabBar />
    </div>
  );
}
