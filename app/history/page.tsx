"use client";

import Link from "next/link";
import { CalendarDays, Cloud, History, Swords, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { listPersistedGames } from "@/lib/data/game-repository";
import type { GameRecord } from "@/lib/types";

function prettyDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HistoryPage() {
  const { user, configured } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listPersistedGames().then((records) => {
      if (!alive) return;
      setGames(records);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const storageLabel = user
    ? "Supabase game history"
    : configured
      ? "Guest history · sign in to sync"
      : "Local guest history";

  return (
    <div className="page-shell py-8 sm:py-12">
      <section className="panel-strong page-hero-card p-6 sm:p-8">
        <span className="kicker"><History size={14} /> {storageLabel}</span>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Game history</h1>
            <p className="muted-text mt-3 max-w-3xl leading-7">
              Authenticated accounts read saved games from Supabase. Guest sessions keep the same flow in localStorage, without pretending cloud sync exists.
            </p>
          </div>
          <Link href="/play" className="button-primary"><Swords size={18} /> Play another game</Link>
        </div>
      </section>

      {loading ? (
        <section className="panel mt-6 p-6"><p className="muted-text">Loading saved games…</p></section>
      ) : games.length === 0 ? (
        <section className="panel mt-6 p-6 sm:p-8">
          <h2 className="text-2xl font-black">No games saved yet</h2>
          <p className="muted-text mt-3 max-w-2xl leading-7">
            Finish a match or open Game Review from the Play page. MateMind will persist the game locally or to your signed-in Supabase profile.
          </p>
          <Link href="/play" className="button-secondary mt-5">Go to board</Link>
        </section>
      ) : (
        <section className="panel mt-6 overflow-hidden p-4 sm:p-6">
          <div className="history-table-header">
            <strong>{games.length} saved games</strong>
            <span><Cloud size={15} /> {user ? "Cloud-backed" : "Browser-backed"}</span>
          </div>
          <div className="overflow-auto">
            <table className="table-shell min-w-[820px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Mode</th>
                  <th>Color</th>
                  <th>Result</th>
                  <th>Moves</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id}>
                    <td><span className="inline-flex items-center gap-2"><CalendarDays size={15} />{prettyDate(game.createdAt)}</span></td>
                    <td className="font-bold">{game.opponent ?? "—"}</td>
                    <td className="font-bold capitalize">{game.mode}</td>
                    <td className="font-bold uppercase">{game.playerColor}</td>
                    <td><span className="badge">{game.result}</span></td>
                    <td>{game.movesCount}</td>
                    <td>
                      <Link href={`/games/${game.id}`} className="button-ghost text-sm"><WandSparkles size={15} /> View review</Link>
                    </td>
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
