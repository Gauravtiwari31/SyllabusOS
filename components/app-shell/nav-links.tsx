"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, History, LayoutGrid, Network, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/mistakes", label: "Mistakes", icon: TriangleAlert },
  { href: "/revision", label: "Revision", icon: History },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Inline top navigation. Desktop (lg and up) shows labels and the single red dot on the
 * active item; `compact` is icon-only for phones in landscape, where the bottom tab bar
 * would eat too much of the height.
 */
export function NavLinks({ className, compact }: { className?: string; compact?: boolean }) {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={compact ? item.label : undefined}
            title={compact ? item.label : undefined}
            className={cn(
              "relative inline-flex h-9 items-center rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              compact ? "w-10 justify-center" : "gap-1.5 px-3",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {compact ? (
              <>
                <Icon className="size-[18px]" strokeWidth={active ? 2 : 1.5} aria-hidden />
                {active && <span className="nu-dot absolute right-1.5 top-1.5 size-1.5" aria-hidden />}
              </>
            ) : (
              <>
                {active && <span className="nu-dot size-1.5" aria-hidden />}
                {item.label}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Fixed bottom tab bar for phones and tablets (below lg). Respects the iOS safe area. Hidden
 * on short landscape screens (icon nav sits in the header) and in focus mode (globals.css).
 */
export function TabBar() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="nu-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 short:hidden lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.5} aria-hidden />
                  {active && <span className="nu-dot absolute -right-1.5 -top-0.5 size-1.5" aria-hidden />}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
