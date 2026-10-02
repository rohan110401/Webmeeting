import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Settings, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    isActive && "bg-accent text-foreground",
  );

/** Header and page frame for everything except the call itself. */
export const AppShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-full">
    <header className="border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Video className="h-4 w-4" aria-hidden="true" />
          </span>
          Sessions
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/settings" className={navClass} aria-label="Settings">
            <Settings aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </NavLink>
        </nav>
      </div>
    </header>
    <main className="container py-8">{children}</main>
  </div>
);
