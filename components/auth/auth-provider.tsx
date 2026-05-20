"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getLocalWallet } from "@/lib/storage";
import type { PieceSkinId } from "@/lib/types";

export type MateMindProfile = {
  id: string;
  username: string;
  city: string;
  avatar_url?: string | null;
  coins: number;
  active_skin: PieceSkinId;
  xp?: number;
  games_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  reviews_completed?: number;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: MateMindProfile | null;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  activeSkin: PieceSkinId;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function fallbackDisplayName(user: User | null) {
  if (!user?.email) return "Guest";
  return user.email.split("@")[0] || "Player";
}

function guestSnapshot() {
  return getLocalWallet();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MateMindProfile | null>(null);
  const [guestCoins, setGuestCoins] = useState(1_000);
  const [guestSkin, setGuestSkin] = useState<PieceSkinId>("classic");

  function refreshGuestWallet() {
    const wallet = guestSnapshot();
    setGuestCoins(wallet.coins);
    setGuestSkin(wallet.activeSkin);
  }

  async function loadProfile(userId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, city, avatar_url, coins, active_skin, xp, games_played, wins, losses, draws, reviews_completed")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      setProfile({
        ...(data as MateMindProfile),
        coins: Number((data as MateMindProfile).coins ?? 1_000),
        active_skin: ((data as MateMindProfile).active_skin ?? "classic") as PieceSkinId,
      });
      return;
    }

    setProfile(null);
  }

  async function refreshProfile() {
    if (!session?.user?.id) {
      setProfile(null);
      refreshGuestWallet();
      return;
    }
    await loadProfile(session.user.id);
  }

  useEffect(() => {
    refreshGuestWallet();
    const handleStorage = () => refreshGuestWallet();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      setSession(null);
      setProfile(null);
      refreshGuestWallet();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let alive = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user?.id) {
        await loadProfile(data.session.user.id);
      } else {
        setProfile(null);
        refreshGuestWallet();
      }
      if (alive) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      if (nextSession?.user?.id) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        refreshGuestWallet();
      }
      setLoading(false);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [configured]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    refreshGuestWallet();
  }

  const user = session?.user ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user,
      profile,
      displayName: profile?.username || fallbackDisplayName(user),
      avatarUrl: profile?.avatar_url ?? null,
      coins: profile?.coins ?? guestCoins,
      activeSkin: profile?.active_skin ?? guestSkin,
      refreshProfile,
      signOut,
    }),
    [configured, guestCoins, guestSkin, loading, profile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
