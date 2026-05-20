"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Coins,
  History,
  LogIn,
  LogOut,
  ShoppingBag,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { href: "/play", label: "Play", icon: Swords },
  { href: "/history", label: "History", icon: History },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function NavLink({ href, label, icon: Icon, compact = false }: (typeof navItems)[number] & { compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={`chess-nav-link ${active ? "active" : ""} ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 18 : 20} />
      <span>{label}</span>
    </Link>
  );
}

export function Navbar() {
  const router = useRouter();
  const { configured, loading, user, displayName, avatarUrl, coins, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const accountLabel = loading ? "Checking session…" : user ? displayName : configured ? "Guest mode" : "Offline guest";

  return (
    <>
      <aside className="desktop-sidebar">
        <Link href="/" className="sidebar-brand" aria-label="MateMind home">
          <span className="brand-knight">♞</span>
          <span className="brand-copy">
            <strong>MateMind</strong>
            <small>Play + Review</small>
          </span>
        </Link>

        <div className="sidebar-coins"><Coins size={16} /><strong>{coins}</strong><span>coins</span></div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="sidebar-account-card">
          <Link href="/profile" className="account-row account-link">
            <span className="account-avatar">
              {avatarUrl ? <span className="avatar-image-fill" style={{ backgroundImage: `url(${avatarUrl})` }} aria-label="Profile avatar" /> : <UserRound size={17} />}
            </span>
            <div>
              <strong>{accountLabel}</strong>
              <small>{user ? "Cloud profile · avatar editable" : configured ? "Sign in to sync" : "Supabase not configured"}</small>
            </div>
          </Link>
          {user ? (
            <button type="button" className="sidebar-account-button" onClick={handleSignOut}>
              <LogOut size={16} /> Sign out
            </button>
          ) : (
            <div className="sidebar-auth-actions">
              <Link href="/login"><LogIn size={15} /> Log in</Link>
              <Link href="/signup"><UserRound size={15} /> Sign up</Link>
            </div>
          )}
        </div>
      </aside>

      <header className="mobile-topbar">
        <Link href="/" className="mobile-brand">
          <span>♞</span>
          <strong>MateMind</strong>
        </Link>
        <div className="mobile-top-actions">
          <span className="mobile-coins"><Coins size={15} /> {coins}</span>
          {user ? (
            <Link href="/profile" className="mobile-auth-button">
              {avatarUrl ? <span className="avatar-image-fill" style={{ backgroundImage: `url(${avatarUrl})` }} aria-label="Profile avatar" /> : <UserRound size={16} />}
              <span>{displayName}</span>
            </Link>
          ) : (
            <Link href="/login" className="mobile-auth-button">
              <LogIn size={16} /> Log in
            </Link>
          )}
        </div>
      </header>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => (
          <NavLink key={item.href} {...item} compact />
        ))}
      </nav>
    </>
  );
}
