import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addLocalSkin,
  getLocalWallet,
  saveLocalWallet,
  setLocalActiveSkin,
  updateLocalCoins,
} from "@/lib/storage";
import { PIECE_SKINS } from "@/lib/chess/piece-skins";
import type { PieceSkinId, WalletSnapshot } from "@/lib/types";

export type EconomyActionResult = {
  ok: boolean;
  wallet: WalletSnapshot;
  message: string;
};

async function currentUserId() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function normalizeWallet(input: Partial<WalletSnapshot> | null | undefined): WalletSnapshot {
  return {
    coins: Math.max(0, Math.round(input?.coins ?? 1_000)),
    activeSkin: input?.activeSkin ?? "classic",
    ownedSkins: Array.from(new Set(input?.ownedSkins?.length ? input.ownedSkins : ["classic"])),
  };
}

export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) return getLocalWallet();

  const [{ data: profile }, { data: owned }] = await Promise.all([
    supabase.from("profiles").select("coins, active_skin").eq("id", userId).maybeSingle(),
    supabase.from("owned_skins").select("skin_id").eq("user_id", userId),
  ]);

  if (!profile) return getLocalWallet();
  return normalizeWallet({
    coins: Number(profile.coins ?? 1_000),
    activeSkin: (profile.active_skin as PieceSkinId | null) ?? "classic",
    ownedSkins: ["classic", ...((owned ?? []).map((row) => row.skin_id as PieceSkinId))],
  });
}

export async function equipSkin(skinId: PieceSkinId): Promise<EconomyActionResult> {
  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) {
    const wallet = getLocalWallet();
    if (!wallet.ownedSkins.includes(skinId)) return { ok: false, wallet, message: "Buy this skin before equipping it." };
    const next = setLocalActiveSkin(skinId);
    return { ok: true, wallet: next, message: "Skin equipped in guest storage." };
  }

  const wallet = await getWalletSnapshot();
  if (!wallet.ownedSkins.includes(skinId)) return { ok: false, wallet, message: "Buy this skin before equipping it." };

  const { error } = await supabase.from("profiles").update({ active_skin: skinId }).eq("id", userId);
  if (error) return { ok: false, wallet, message: error.message };
  return { ok: true, wallet: { ...wallet, activeSkin: skinId }, message: "Skin equipped." };
}

export async function buySkin(skinId: PieceSkinId): Promise<EconomyActionResult> {
  const skin = PIECE_SKINS.find((entry) => entry.id === skinId);
  if (!skin) return { ok: false, wallet: await getWalletSnapshot(), message: "Unknown skin." };

  const supabase = getSupabaseBrowserClient();
  const userId = await currentUserId();
  if (!supabase || !userId) {
    const result = addLocalSkin(skinId, skin.price);
    if (!result.ok) {
      return {
        ok: false,
        wallet: result.wallet,
        message: result.reason === "owned" ? "You already own this skin." : "Not enough coins.",
      };
    }
    return { ok: true, wallet: result.wallet, message: `${skin.name} added to your guest collection.` };
  }

  const wallet = await getWalletSnapshot();
  if (wallet.ownedSkins.includes(skinId)) return { ok: false, wallet, message: "You already own this skin." };
  if (wallet.coins < skin.price) return { ok: false, wallet, message: "Not enough coins." };

  const { data, error } = await supabase.rpc("purchase_skin", { target_skin_id: skinId });
  if (error) return { ok: false, wallet, message: error.message };
  const nextWallet = normalizeWallet(data as Partial<WalletSnapshot> | null);
  return { ok: true, wallet: nextWallet, message: `${skin.name} purchased.` };
}

export async function grantGuestCoins(delta: number): Promise<WalletSnapshot> {
  return updateLocalCoins(delta);
}

export async function overwriteGuestWallet(wallet: WalletSnapshot) {
  saveLocalWallet(wallet);
}
