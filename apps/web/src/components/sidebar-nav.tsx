"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Briefcase,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portafolio", label: "Portafolio", icon: Briefcase },
  { href: "/analisis", label: "Análisis", icon: BarChart3 },
  { href: "/operaciones", label: "Operaciones", icon: ArrowLeftRight },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 flex-none flex-col gap-1 border-r border-border bg-card/40 px-3 py-6 md:flex">
        <div className="mb-4 px-3">
          <span className="text-lg font-medium">Investment Lab</span>
          <p className="text-[13px] text-muted-foreground">Portafolio XTB</p>
        </div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive(pathname, href)
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </aside>

      {/* Nav — mobile */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card/40 px-3 py-2 md:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              isActive(pathname, href)
                ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
