"use client";

import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { ArrowLeft, History, WandSparkles } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CoachReview } from "@/components/coach/coach-review";
import { boardPaletteForSkin, customPiecesForSkin } from "@/lib/chess/piece-skins";
import { useAuth } from "@/components/auth/auth-provider";
import { getPersistedGame, getPersistedReview } from "@/lib/data/game-repository";
import type { CoachReview as CoachReviewType, GameRecord } from "@/lib/types";

export default function GameDetailsPage() {
  const params = useParams<{ id: string }>();
  const gameId = params?.id;
  const { user, activeSkin } = useAuth();
  const palette = boardPaletteForSkin(activeSkin);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [review, setReview] = useState<CoachReviewType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const [savedGame, savedReview] = await Promise.all([
        getPersistedGame(gameId),
        getPersistedReview(gameId),
      ]);
      if (!alive) return;
      setGame(savedGame ?? null);
      setReview(savedReview ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [gameId, user?.id]);

  if (loading) {
    return (
      <div className="page-shell py-8 sm:py-12">
        <section className="panel p-6 sm:p-8"><p className="muted-text">Loading saved game…</p></section>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="page-shell py-8 sm:py-12">
        <section className="panel p-6 sm:p-8">
          <h1 className="text-3xl font-black tracking-tight">Game not found</h1>
          <p className="muted-text mt-3 leading-7">
            This record is not available in the current account or browser storage. Return to History or play a new game.
          </p>
          <Link href="/history" className="button-secondary mt-5"><ArrowLeft size={18} /> Back to history</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell py-8 sm:py-12">
      <section className="panel-strong page-hero-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="kicker"><History size={14} /> Saved game</span>
            <h1 className="mt-4 text-4xl font-black tracking-tight">{game.opponent ?? "Game details"}</h1>
            <p className="muted-text mt-3 leading-7">
              {game.mode.toUpperCase()} · {game.result} · {game.movesCount} plies · {new Date(game.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/history" className="button-secondary"><ArrowLeft size={18} /> Back</Link>
            <Link href="/play" className="button-primary"><WandSparkles size={18} /> Play again</Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(320px,520px)_1fr]">
        <article className="panel p-5">
          <h2 className="text-2xl font-black tracking-tight">Final board</h2>
          <div className="board-frame mt-4 overflow-hidden">
            <Chessboard
              options={{
                id: `final-board-${game.id}`,
                position: game.fen,
                allowDragging: false,
                showNotation: true,
                boardStyle: { borderRadius: "0.45rem", overflow: "hidden" },
                darkSquareStyle: { backgroundColor: palette.dark },
                lightSquareStyle: { backgroundColor: palette.light },
                pieces: customPiecesForSkin(activeSkin),
              }}
            />
          </div>
        </article>

        <article className="panel p-5">
          <h2 className="text-2xl font-black tracking-tight">PGN</h2>
          <pre className="code-block mt-4 whitespace-pre-wrap">{game.pgn || "No PGN saved."}</pre>
          <div className="saved-game-meta-grid">
            <div><span>Color</span><strong>{game.playerColor}</strong></div>
            <div><span>Cause</span><strong>{game.resultCause ?? "board result"}</strong></div>
            <div><span>Mode</span><strong>{game.mode}</strong></div>
            <div><span>Coins</span><strong>{game.coinMode === "stake" ? `${game.stakeCoins ?? 0} stake · ${game.coinDelta ?? "pending"}` : "free"}</strong></div>
          </div>
        </article>
      </section>

      {review ? (
        <div className="mt-6"><CoachReview review={review} /></div>
      ) : (
        <section className="panel mt-6 p-6">
          <h2 className="text-2xl font-black tracking-tight">No saved Game Review</h2>
          <p className="muted-text mt-3 leading-7">
            Run Game Review from the live board after a match. The review JSON is stored with the game in Supabase for authenticated accounts or localStorage for guests.
          </p>
        </section>
      )}
    </div>
  );
}
