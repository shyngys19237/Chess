import type { CoachReview, GameRecord } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getGame,
  getReview,
  listGames,
  listReviews,
  saveGame,
  saveReview,
  settleLocalBotWager,
} from "@/lib/storage";

export type PersistenceResult = {
  destination: "supabase" | "local";
  error?: string;
  settledWallet?: boolean;
};

type RemoteGameRow = {
  id: string;
  mode: GameRecord["mode"];
  player_color: GameRecord["playerColor"];
  result: GameRecord["result"];
  result_cause?: string | null;
  pgn: string;
  final_fen: string;
  moves_count: number;
  opponent?: string | null;
  room_id?: string | null;
  difficulty?: GameRecord["difficulty"] | null;
  coin_mode?: GameRecord["coinMode"] | null;
  stake_coins?: number | null;
  payout_multiplier?: number | null;
  coin_delta?: number | null;
  wager_settled?: boolean | null;
  created_at: string;
};

type RemoteReviewRow = {
  game_id: string;
  review_json: CoachReview;
};

function mapRemoteGame(row: RemoteGameRow): GameRecord {
  return {
    id: row.id,
    mode: row.mode,
    playerColor: row.player_color,
    result: row.result,
    resultCause: row.result_cause ?? undefined,
    pgn: row.pgn,
    fen: row.final_fen,
    movesCount: row.moves_count,
    createdAt: row.created_at,
    opponent: row.opponent ?? undefined,
    roomId: row.room_id ?? undefined,
    difficulty: row.difficulty ?? undefined,
    coinMode: row.coin_mode ?? undefined,
    stakeCoins: row.stake_coins ?? undefined,
    payoutMultiplier: row.payout_multiplier ?? undefined,
    coinDelta: row.coin_delta ?? undefined,
    wagerSettled: row.wager_settled ?? undefined,
  };
}

async function currentUserId() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function localCoinDelta(game: GameRecord) {
  if (game.coinMode !== "stake" || !game.stakeCoins || !game.payoutMultiplier || game.mode !== "ai") return 0;
  if (game.result === "1/2-1/2") return 0;
  const playerWon =
    (game.playerColor === "w" && game.result === "1-0") ||
    (game.playerColor === "b" && game.result === "0-1");
  return playerWon ? Math.round(game.stakeCoins * (game.payoutMultiplier - 1)) : -game.stakeCoins;
}

export async function persistGame(game: GameRecord): Promise<PersistenceResult> {
  saveGame(game);
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) {
    if (game.coinMode === "stake") {
      settleLocalBotWager(game.id, localCoinDelta(game));
    }
    return { destination: "local", settledWallet: game.coinMode === "stake" };
  }

  const { error } = await supabase.from("games").upsert(
    {
      id: game.id,
      user_id: userId,
      mode: game.mode,
      player_color: game.playerColor,
      result: game.result,
      result_cause: game.resultCause ?? null,
      pgn: game.pgn,
      final_fen: game.fen,
      moves_count: game.movesCount,
      opponent: game.opponent ?? null,
      room_id: game.roomId ?? null,
      difficulty: game.difficulty ?? null,
      coin_mode: game.coinMode ?? "free",
      stake_coins: game.stakeCoins ?? 0,
      payout_multiplier: game.payoutMultiplier ?? 1,
      created_at: game.createdAt,
    },
    { onConflict: "id" },
  );

  if (error) return { destination: "local", error: error.message };
  return { destination: "supabase", settledWallet: game.coinMode === "stake" };
}

export async function persistReview(gameId: string, review: CoachReview): Promise<PersistenceResult> {
  saveReview(gameId, review);
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return { destination: "local" };

  const { error } = await supabase.from("game_reviews").upsert(
    {
      game_id: gameId,
      user_id: userId,
      white_accuracy: review.whiteAccuracy,
      black_accuracy: review.blackAccuracy,
      review_json: review,
      generated_at: review.generatedAt,
    },
    { onConflict: "game_id" },
  );

  if (error) return { destination: "local", error: error.message };
  return { destination: "supabase" };
}

export async function listPersistedGames(): Promise<GameRecord[]> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return listGames();

  const { data, error } = await supabase
    .from("games")
    .select("id, mode, player_color, result, result_cause, pgn, final_fen, moves_count, opponent, room_id, difficulty, coin_mode, stake_coins, payout_multiplier, coin_delta, wager_settled, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return listGames();
  return (data as RemoteGameRow[]).map(mapRemoteGame);
}

export async function getPersistedGame(gameId: string): Promise<GameRecord | undefined> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return getGame(gameId);

  const { data, error } = await supabase
    .from("games")
    .select("id, mode, player_color, result, result_cause, pgn, final_fen, moves_count, opponent, room_id, difficulty, coin_mode, stake_coins, payout_multiplier, coin_delta, wager_settled, created_at")
    .eq("user_id", userId)
    .eq("id", gameId)
    .maybeSingle();

  if (error || !data) return getGame(gameId);
  return mapRemoteGame(data as RemoteGameRow);
}

export async function getPersistedReview(gameId: string): Promise<CoachReview | undefined> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return getReview(gameId);

  const { data, error } = await supabase
    .from("game_reviews")
    .select("game_id, review_json")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();

  if (error || !data) return getReview(gameId);
  return (data as RemoteReviewRow).review_json;
}

export async function listPersistedReviews(gameIds?: string[]): Promise<Record<string, CoachReview>> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return listReviews();

  let query = supabase.from("game_reviews").select("game_id, review_json").eq("user_id", userId);
  if (gameIds?.length) query = query.in("game_id", gameIds);
  const { data, error } = await query;
  if (error || !data) return listReviews();

  return (data as RemoteReviewRow[]).reduce<Record<string, CoachReview>>((accumulator, row) => {
    accumulator[row.game_id] = row.review_json;
    return accumulator;
  }, {});
}
