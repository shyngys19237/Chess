"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins, ImagePlus, Save, Shirt, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getWalletSnapshot } from "@/lib/data/economy";
import type { WalletSnapshot } from "@/lib/types";

function sanitizeFileName(file: File) {
  return file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").slice(-64) || "avatar.png";
}

export function ProfilePanel() {
  const { configured, user, profile, displayName, avatarUrl, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? displayName);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUsername(profile?.username ?? displayName);
  }, [displayName, profile?.username]);

  useEffect(() => {
    let alive = true;
    void getWalletSnapshot().then((snapshot) => {
      if (alive) setWallet(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function uploadAvatar(userId: string, file: File) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const path = `${userId}/${Date.now()}-${sanitizeFileName(file)}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/png",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setMessage("Guest profiles are local only. Sign up to save avatar and username in Supabase.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const updates: Record<string, string> = { username: username.trim() || displayName };
      if (avatarFile) {
        const uploaded = await uploadAvatar(user.id, avatarFile);
        if (uploaded) updates.avatar_url = uploaded;
      }
      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setMessage("Profile updated.");
      setAvatarFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="profile-layout">
      <section className="panel-strong profile-hero-card">
        <div className="profile-avatar-xl">
          {avatarUrl ? <span className="avatar-image-fill" style={{ backgroundImage: `url(${avatarUrl})` }} aria-label={`${displayName} avatar`} /> : <UserRound size={42} />}
        </div>
        <div>
          <span className="kicker">Player profile</span>
          <h1>{displayName}</h1>
          <p>{user ? "Supabase-backed account" : configured ? "Guest mode — sign in to sync" : "Offline guest profile"}</p>
        </div>
        <div className="profile-wallet-pill"><Coins size={18} /> <strong>{wallet?.coins ?? 0}</strong> coins</div>
      </section>

      <section className="panel profile-edit-card">
        <div className="section-title-row">
          <div>
            <span className="side-kicker">Identity</span>
            <h2>Avatar and username</h2>
          </div>
        </div>
        <form className="profile-form-grid" onSubmit={saveProfile}>
          <label>
            Username
            <input className="input-shell" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={28} />
          </label>
          <label className="avatar-upload-field">
            <span>Avatar image</span>
            <div className="avatar-upload-shell">
              <ImagePlus size={18} />
              <div>
                <strong>{avatarFile ? avatarFile.name : "Choose a PNG/JPG/WebP avatar"}</strong>
                <small>Stored in Supabase Storage when connected.</small>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
            </div>
          </label>
          <button type="submit" className="button-primary" disabled={loading || !user}>
            <Save size={18} /> {loading ? "Saving…" : "Save profile"}
          </button>
        </form>
        {message ? <p className="profile-message">{message}</p> : null}
      </section>

      <section className="panel profile-collection-card">
        <div className="section-title-row">
          <div>
            <span className="side-kicker"><Shirt size={15} /> Cosmetics</span>
            <h2>Piece skin collection</h2>
          </div>
          <Link href="/shop" className="button-secondary">Open shop</Link>
        </div>
        <div className="profile-collection-meta">
          <div><span>Active skin</span><strong>{wallet?.activeSkin ?? "classic"}</strong></div>
          <div><span>Owned skins</span><strong>{wallet?.ownedSkins.length ?? 1}</strong></div>
          <div><span>Wallet</span><strong>{wallet?.coins ?? 0} coins</strong></div>
        </div>
      </section>
    </div>
  );
}
