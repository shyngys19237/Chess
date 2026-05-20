"use client";

import Link from "next/link";
import { BarChart3, BrainCircuit, Coins, Crown, History, Swords, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { listPersistedGames, listPersistedReviews } from "@/lib/data/game-repository";
import type { CoachReview, GameRecord, MoveClassification } from "@/lib/types";

function playerOutcome(game: GameRecord) {
  if (game.result === "1/2-1/2") return "draw" as const;
  if (game.result === "*") return "unfinished" as const;
  if (game.playerColor === "both") return "local" as const;
  const playerWon = (game.playerColor === "w" && game.result === "1-0") || (game.playerColor === "b" && game.result === "0-1");
  return playerWon ? "win" as const : "loss" as const;
}

function mostCommonIssue(reviews: Record<string, CoachReview>): MoveClassification | "None yet" {
  const counts = new Map<MoveClassification, number>();
  Object.values(reviews).forEach((review) => {
    review.issues.forEach((issue) => {
      counts.set(issue.label, (counts.get(issue.label) ?? 0) + 1);
    });
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "None yet";
}

export default function DashboardPage() {
  const { user, displayName, coins } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [reviews, setReviews] = useState<Record<string, CoachReview>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const savedGames = await listPersistedGames();
      const savedReviews = await listPersistedReviews(savedGames.map((game) => game.id));
      if (!alive) return;
      setGames(savedGames);
      setReviews(savedReviews);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const stats = useMemo(() => {
    const outcomes = games.map(playerOutcome);
    const wins = outcomes.filter((outcome) => outcome === "win").length;
    const losses = outcomes.filter((outcome) => outcome === "loss").length;
    const draws = outcomes.filter((outcome) => outcome === "draw").length;
    const reviewed = Object.values(reviews);
    const averageAccuracy = reviewed.length
      ? Math.round(reviewed.reduce((sum, review) => sum + review.accuracy, 0) / reviewed.length)
      : null;
    return {
      wins,
      losses,
      draws,
      averageAccuracy,
      commonIssue: mostCommonIssue(reviews),
    };
  }, [games, reviews]);

  const recentGames = games.slice(0, 5);

  return (
    <div className="page-shell py-8 sm:py-12">
      <section className="panel-strong page-hero-card p-6 sm:p-8">
        <span className="kicker"><BarChart3 size={14} /> Player dashboard</span>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight">{user ? `${displayName}'s progress` : "Guest progress"}</h1>
            <p className="muted-text mt-3 max-w-3xl leading-7">
              The dashboard reads actual saved games and reviews. Signed-in accounts sync through Supabase; guests use the same metrics from browser storage.
            </p>
          </div>
          <Link href="/play" className="button-primary"><Swords size={18} /> Start a match</Link>
        </div>
      </section>

      {loading ? (
        <section className="panel mt-6 p-6"><p className="muted-text">Loading dashboard metrics…</p></section>
      ) : (
        <>
          <section className="dashboard-stat-grid mt-6">
            <article className="panel metric-card"><span>Total games</span><strong>{games.length}</strong><small>Saved records</small></article>
            <article className="panel metric-card"><span><Coins size={15} /> Coins</span><strong>{coins}</strong><small>Bot stakes + shop balance</small></article>
            <article className="panel metric-card"><span>Wins</span><strong>{stats.wins}</strong><small>AI games won</small></article>
            <article className="panel metric-card"><span>Losses</span><strong>{stats.losses}</strong><small>AI games lost</small></article>
            <article className="panel metric-card"><span>Draws</span><strong>{stats.draws}</strong><small>Drawn results</small></article>
            <article className="panel metric-card"><span>Avg accuracy</span><strong>{stats.averageAccuracy ?? "—"}</strong><small>{stats.averageAccuracy === null ? "Run Game Review" : "Reviewed games"}</small></article>
            <article className="panel metric-card"><span>Common issue</span><strong>{stats.commonIssue}</strong><small>From key review moments</small></article>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="panel p-5 sm:p-6">
              <div className="section-title-row">
                <div>
                  <span className="side-kicker"><History size={15} /> Recent games</span>
                  <h2>Latest saved matches</h2>
                </div>
                <Link href="/history" className="button-ghost text-sm">Open history</Link>
              </div>
              {recentGames.length === 0 ? (
                <p className="muted-text mt-5 leading-7">No saved games yet. Play against a bot, finish the match, and the record appears here.</p>
              ) : (
                <div className="dashboard-recent-list">
                  {recentGames.map((game) => (
                    <Link key={game.id} href={`/games/${game.id}`} className="dashboard-recent-row">
                      <div>
                        <strong>{game.opponent ?? game.mode.toUpperCase()}</strong>
                        <span>{game.result} · {game.movesCount} plies</span>
                      </div>
                      <em>{reviews[game.id] ? `${reviews[game.id].accuracy}% review` : "No review"}</em>
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="panel p-5 sm:p-6">
              <div className="section-title-row">
                <div>
                  <span className="side-kicker"><BrainCircuit size={15} /> Training loop</span>
                  <h2>Next focus</h2>
                </div>
              </div>
              <div className="dashboard-focus-card">
                <Target size={20} />
                <div>
                  <strong>{stats.commonIssue === "None yet" ? "Generate your first Game Review" : `Repair ${stats.commonIssue.toLowerCase()} patterns`}</strong>
                  <p>
                    {stats.commonIssue === "None yet"
                      ? "Finish a game and run Game Review so MateMind can identify a concrete priority."
                      : "Open your recent reviewed games and replay the top educational moments before starting the next match."}
                  </p>
                </div>
              </div>
              <div className="dashboard-cta-stack">
                <Link href="/play" className="button-primary"><Crown size={18} /> Play bots</Link>
                <Link href="/history" className="button-secondary"><History size={18} /> Review saved games</Link>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
