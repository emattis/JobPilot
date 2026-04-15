"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Compass,
  KanbanSquare,
  FileText,
  BarChart2,
  UserCircle,
  LogOut,
  Briefcase,
  Users,
  BookOpen,
  Database,
  Mail,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analyze", label: "Analyze", icon: Zap },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/metrics", label: "Metrics", icon: BarChart2 },
  { href: "/networking", label: "Networking", icon: Users },
  { href: "/story", label: "My Story", icon: BookOpen },
  { href: "/sources", label: "Sources", icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);

  useEffect(() => {
    fetch("/api/auth/google")
      .then((r) => r.json())
      .then((d) => { if (d.success) setGmailConnected(d.connected); })
      .catch(() => {});
  }, []);

  async function handleConnectGmail() {
    setConnectingGmail(true);
    try {
      const res = await fetch("/api/auth/google", { method: "POST" });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to start Gmail connection");
      }
    } catch {
      toast.error("Failed to connect Gmail");
    } finally {
      setConnectingGmail(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 h-screen border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20">
          <Briefcase className="w-4 h-4 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-foreground">
          JobPilot
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-border pt-3">
        <div className="flex items-center justify-between px-3 py-1 mb-1">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        {gmailConnected !== null && (
          gmailConnected ? (
            <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0 text-green-400" />
              <span className="text-xs">Gmail Connected</span>
              <span className="w-2 h-2 rounded-full bg-green-400 ml-auto shrink-0" />
            </div>
          ) : (
            <button
              onClick={handleConnectGmail}
              disabled={connectingGmail}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              {connectingGmail ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Mail className="w-4 h-4 shrink-0" />}
              Connect Gmail
            </button>
          )
        )}
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
            pathname === "/profile"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          <UserCircle className="w-4 h-4 shrink-0" />
          Profile
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
