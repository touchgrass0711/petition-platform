"use client";

import { ExternalLink, LayoutDashboard, ListChecks, LogOut, Megaphone, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/admin-session";
import { DEMO_MODE } from "@/lib/demo";
import { useAdminSettings } from "./AdminGate";

const navItem = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4";

// Layout after TailAdmin: fixed-width sidebar on desktop, sticky top bar on every size.
const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/campaigns", label: "Campaigns", icon: ListChecks },
];

type Props = { email: string; title: string; children: React.ReactNode };

export function AdminShell({ email, title, children }: Props) {
  const path = usePathname();
  const { developer } = useAdminSettings();
  const nav = developer ? [...NAV, { href: "/admin/developer", label: "Master", icon: SlidersHorizontal }] : NAV;
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-background px-4 py-6 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-3 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Megaphone className="size-4" aria-hidden />
          </span>
          Petition Admin
        </Link>
        <p className="mt-8 px-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">Menu</p>
        <nav className="mt-2 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? path === href : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${navItem} ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
              >
                <Icon aria-hidden /> {label}
              </Link>
            );
          })}
          <Link href="/" className={`${navItem} text-muted-foreground hover:bg-accent/60 hover:text-foreground`}>
            <ExternalLink aria-hidden /> View site
          </Link>
        </nav>
        {DEMO_MODE && (
          <div className="mt-auto rounded-xl border bg-muted/50 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">View-only demo</p>
            <p className="mt-1">Saving, pins and campaign changes are disabled. Data shown is sample data.</p>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {DEMO_MODE && <Badge className="hidden sm:inline-flex">Demo Mode</Badge>}
            <nav className="flex gap-1 lg:hidden" aria-label="Admin sections">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} aria-label={label} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4">
                  <Icon aria-hidden />
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            {developer && <Badge className="text-foreground">Master</Badge>}
            <span className="mr-2 hidden truncate text-sm text-muted-foreground md:inline">{email}</span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut aria-hidden /> Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 space-y-6 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
