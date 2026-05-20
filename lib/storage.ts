import type { CoachReview, GameRecord, PieceSkinId, WalletSnapshot } from "@/lib/types";

const GAMES_KEY = "matemind-games";
const REVIEWS_KEY = "matemind-reviews";
const WALLET_KEY = "matemind-wallet";
const DEFAULT_WALLET: WalletSnapshot = {
  coins: 1_000,
  activeSkin: "classic",
  ownedSkins: ["classic"],
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listGames(): GameRecord[] {
  return readJson<GameRecord[]>(GAMES_KEY, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getGame(gameId: string): GameRecord | undefined {
  return listGames().find((game) => game.id === gameId);
}

export function saveGame(game: GameRecord) {
  const games = listGames().filter((item) => item.id !== game.id);
  games.unshift(game);
  writeJson(GAMES_KEY, games.slice(0, 160));
}

export function saveReview(gameId: string, review: CoachReview) {
  const reviews = readJson<Record<string, CoachReview>>(REVIEWS_KEY, {});
  reviews[gameId] = review;
  writeJson(REVIEWS_KEY, reviews);
}

export function getReview(gameId: string): CoachReview | undefined {
  const reviews = readJson<Record<string, CoachReview>>(REVIEWS_KEY, {});
  return reviews[gameId];
}

export function listReviews(): Record<string, CoachReview> {
  return readJson<Record<string, CoachReview>>(REVIEWS_KEY, {});
}

export function getLocalWallet(): WalletSnapshot {
  const wallet = readJson<WalletSnapshot>(WALLET_KEY, DEFAULT_WALLET);
  return {
    coins: Number.isFinite(wallet.coins) ? Math.max(0, Math.round(wallet.coins)) : DEFAULT_WALLET.coins,
    activeSkin: wallet.activeSkin || "classic",
    ownedSkins: Array.from(new Set(wallet.ownedSkins?.length ? wallet.ownedSkins : ["classic"])),
  };
}

export function saveLocalWallet(wallet: WalletSnapshot) {
  writeJson(WALLET_KEY, {
    coins: Math.max(0, Math.round(wallet.coins)),
    activeSkin: wallet.activeSkin,
    ownedSkins: Array.from(new Set(wallet.ownedSkins.length ? wallet.ownedSkins : ["classic"])),
  });
}

export function updateLocalCoins(delta: number) {
  const wallet = getLocalWallet();
  const next = { ...wallet, coins: Math.max(0, wallet.coins + Math.round(delta)) };
  saveLocalWallet(next);
  return next;
}

export function setLocalActiveSkin(activeSkin: PieceSkinId) {
  const wallet = getLocalWallet();
  const ownedSkins = wallet.ownedSkins.includes(activeSkin) ? wallet.ownedSkins : [...wallet.ownedSkins, activeSkin];
  const next = { ...wallet, activeSkin, ownedSkins };
  saveLocalWallet(next);
  return next;
}

export function addLocalSkin(skinId: PieceSkinId, price: number) {
  const wallet = getLocalWallet();
  if (wallet.ownedSkins.includes(skinId)) return { ok: false as const, reason: "owned", wallet };
  if (wallet.coins < price) return { ok: false as const, reason: "insufficient", wallet };
  const next = {
    ...wallet,
    coins: wallet.coins - price,
    ownedSkins: [...wallet.ownedSkins, skinId],
  };
  saveLocalWallet(next);
  return { ok: true as const, wallet: next };
}

export function settleLocalBotWager(gameId: string, coinDelta: number) {
  const games = listGames();
  const target = games.find((game) => game.id === gameId);
  if (!target || target.wagerSettled || target.coinMode !== "stake") return getLocalWallet();
  target.wagerSettled = true;
  target.coinDelta = coinDelta;
  writeJson(GAMES_KEY, games);
  return updateLocalCoins(coinDelta);
}

export function createId(prefix = "item") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.round(Math.random() * 1_000_000)}`;
}
