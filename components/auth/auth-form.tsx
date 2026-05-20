"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ImagePlus,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";

type AuthMode = "login" | "signup";

function suggestedUsername(email: string) {
  const raw = email.split("@")[0] ?? "player";
  return raw.replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 28) || "player";
}

function sanitizeFileName(file: File) {
  return file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-").slice(-64) || "avatar.png";
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const configured = isSupabaseConfigured();
  const signupUsername = useMemo(() => username.trim() || suggestedUsername(email), [email, username]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase keys are missing. Guest mode stays available, and games are saved locally in this browser.");
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const response =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: {
                data: {
                  username: signupUsername,
                },
              },
            });

      if (response.error) throw response.error;

      if (mode === "signup" && !response.data.session) {
        setMessage("Account created. Confirm your email if Supabase email confirmation is enabled, then log in. Avatar upload will be available from Profile after login.");
        return;
      }

      if (mode === "signup" && response.data.user && avatarFile) {
        const avatarUrl = await uploadAvatar(response.data.user.id, avatarFile);
        if (avatarUrl) {
          const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", response.data.user.id);
          if (error) throw error;
        }
      }

      await refreshProfile();
      setMessage(mode === "login" ? "Logged in. Your games, coins, shop items, and reviews can sync to Supabase." : "Account created and signed in.");
      router.push(mode === "signup" ? "/profile" : "/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="auth-shell panel-strong mx-auto max-w-xl p-6 sm:p-8">
      <span className="kicker">
        {mode === "login" ? <ShieldCheck size={14} /> : <UserRoundPlus size={14} />}
        {mode === "login" ? "Welcome back" : "Create profile"}
      </span>
      <h1 className="mt-4 text-4xl font-black tracking-tight">
        {mode === "login" ? "Log in to MateMind" : "Sign up for MateMind"}
      </h1>
      <p className="muted-text mt-3 leading-7">
        Email/password auth is real when Supabase environment variables are present. Signup can also store an avatar in the public avatars bucket when the session is created immediately.
      </p>

      <div className={configured ? "badge badge-success mt-5" : "badge badge-warning mt-5"}>
        {configured ? "Supabase auth connected" : "Guest fallback active"}
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <>
            <label className="grid gap-2 text-sm font-black">
              Username
              <span className="relative">
                <UserRound className="input-icon" size={18} />
                <input
                  className="input-shell pl-12"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  type="text"
                  autoComplete="nickname"
                  placeholder={suggestedUsername(email) || "mate_mind_player"}
                  maxLength={28}
                />
              </span>
            </label>

            <label className="avatar-upload-field text-sm font-black">
              <span>Profile image</span>
              <div className="avatar-upload-shell">
                <ImagePlus size={18} />
                <div>
                  <strong>{avatarFile ? avatarFile.name : "Choose a PNG/JPG avatar"}</strong>
                  <small>Optional. You can replace it later from Profile.</small>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </label>
          </>
        ) : null}

        <label className="grid gap-2 text-sm font-black">
          Email
          <span className="relative">
            <Mail className="input-icon" size={18} />
            <input
              className="input-shell pl-12"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </span>
        </label>

        <label className="grid gap-2 text-sm font-black">
          Password
          <span className="relative">
            <LockKeyhole className="input-icon" size={18} />
            <input
              className="input-shell pl-12"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              placeholder="At least 6 characters"
              required
            />
          </span>
        </label>

        <button type="submit" className="button-primary mt-2" disabled={isLoading}>
          {isLoading ? "Working…" : mode === "login" ? "Log in" : "Create account"}
          <ArrowRight size={18} />
        </button>
      </form>

      {message ? (
        <div className="panel-muted mt-5 p-4 text-sm leading-6">
          <p className="muted-text">{message}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm font-bold">
        <Link href="/play" className="button-secondary text-sm">
          Continue as guest
        </Link>
        <Link href={mode === "login" ? "/signup" : "/login"} className="button-ghost text-sm">
          {mode === "login" ? "Need an account?" : "Already registered?"}
        </Link>
      </div>
    </section>
  );
}
