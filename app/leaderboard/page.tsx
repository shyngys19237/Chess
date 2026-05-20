"use client";

import Link from "next/link";
import { Coins, Trophy, UsersRound, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { LeaderboardEntry } from "@/lib/types";

function normalizeRows(rows: unknown): LeaderboardEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is LeaderboardEntry => {
      if (!row || typeof row !== "object") return false;
      const entry = row as Partial<LeaderboardEntry>;
      return (
        typeof entry.rank === "number" &&
        typeof entry.id === "string" &&
        typeof entry.username === "string" &&
        typeof entry.city === "string" &&
        typeof entry.xp === "number" &&
        typeof entry.coins === "number" &&
        typeof entry.games_played === "number" &&
        typeof entry.wins === "number" &&
        typeof entry.losses === "number" &&
        typeof entry.draws === "number" &&
        typeof entry.reviews_completed === "number"
      );
    })
    .sort((left, right) => left.rank - right.rank);
}

export default function LeaderboardPage() {
  const configured = isSupabaseConfigured();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [city, setCity] = useState("All");
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (alive) {
          setLoading(false);
          setError("Supabase is not available in this browser session.");
        }
        return;
      }

      const { data, error: leaderboardError } = await supabase
        .from("leaderboard")
        .select("rank, id, username, city, avatar_url, xp, coins, games_played, wins, losses, draws, reviews_completed")
        .order("rank", { ascending: true })
        .limit(100);

      if (!alive) return;
      if (leaderboardError) {
        setError(leaderboardError.message);
        setEntries([]);
      } else {
        setEntries(normalizeRows(data));
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [configured, reloadToken]);

  const cities = useMemo(() => ["All", ...Array.from(new Set(entries.map((entry) => entry.city))).sort()], [entries]);
  const filtered = useMemo(
    () => entries.filter((entry) => city === "All" || entry.city === city),
    [city, entries],
  );

  return (
    <div className="page-shell py-8 sm:py-12">
      <section className="panel-strong page-hero-card p-6 sm:p-8">
        <span className="kicker"><Trophy size={14} /> Leaderboard</span>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Real profile rankings, not demo filler</h1>
            <p className="muted-text mt-3 max-w-3xl leading-7">
              This table reads the Supabase <code>leaderboard</code> view from saved profiles, games, and completed reviews. When Supabase is not configured or no players exist yet, MateMind says so instead of rendering fake rankings.
            </p>
          </div>
          <Link href="/play" className="button-primary">Play to create data</Link>
        </div>
      </section>

      {!configured ? (
        <section className="panel mt-6 p-6 sm:p-8 leaderboard-empty-card">
          <CloudOff size={24} />
          <div>
            <h2 className="text-2xl font-black">Leaderboard needs Supabase</h2>
            <p className="muted-text mt-2 leading-7">
              Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and a Supabase publishable/anon key, run <code>supabase-schema.sql</code>, and the table will populate from real account data.
            </p>
          </div>
        </section>
      ) : loading ? (
        <section className="panel mt-6 p-6"><p className="muted-text">Loading leaderboard entries…</p></section>
      ) : error ? (
        <section className="panel mt-6 p-6 sm:p-8 leaderboard-empty-card">
          <CloudOff size={24} />
          <div>
            <h2 className="text-2xl font-black">Leaderboard query failed</h2>
            <p className="muted-text mt-2 leading-7">{error}</p>
            <button type="button" className="button-secondary mt-4" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </section>
      ) : entries.length === 0 ? (
        <section className="panel mt-6 p-6 sm:p-8 leaderboard-empty-card">
          <UsersRound size={24} />
          <div>
            <h2 className="text-2xl font-black">No ranked profiles yet</h2>
            <p className="muted-text mt-2 leading-7">
              Create an account, finish a game, and save a Game Review. The SQL triggers update profile XP and review counts automatically.
            </p>
          </div>
        </section>
      ) : (
        <section className="panel mt-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Top profiles</h2>
              <p className="muted-text mt-2">Ranked by XP, wins, and games played.</p>
            </div>
            <div className="leaderboard-filter-row">
              {cities.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCity(item)}
                  className={city === item ? "button-primary text-sm" : "button-secondary text-sm"}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-auto">
            <table className="table-shell min-w-[820px]">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>City</th>
                  <th>XP</th>
                  <th>Coins</th>
                  <th>Games</th>
                  <th>W / L / D</th>
                  <th>Reviews</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td><span className="card-number">{entry.rank}</span></td>
                    <td className="font-black leaderboard-player-cell">{entry.avatar_url ? <span className="leaderboard-avatar-image" style={{ backgroundImage: `url(${entry.avatar_url})` }} aria-hidden="true" /> : <span>♟</span>}{entry.username}</td>
                    <td>{entry.city}</td>
                    <td className="font-black">{entry.xp}</td>
                    <td><span className="inline-flex items-center gap-1"><Coins size={14} /> {entry.coins}</span></td>
                    <td>{entry.games_played}</td>
                    <td>{entry.wins} / {entry.losses} / {entry.draws}</td>
                    <td>{entry.reviews_completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
