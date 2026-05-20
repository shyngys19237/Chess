"use client";

import { useEffect, useState } from "react";
import { Check, Coins, Crown, Sparkles, WandSparkles } from "lucide-react";
import { PIECE_SKINS } from "@/lib/chess/piece-skins";
import { buySkin, equipSkin, getWalletSnapshot } from "@/lib/data/economy";
import { useAuth } from "@/components/auth/auth-provider";
import type { PieceSkinId, WalletSnapshot } from "@/lib/types";

export function ShopPanel() {
  const { user, refreshProfile } = useAuth();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [busySkin, setBusySkin] = useState<PieceSkinId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getWalletSnapshot().then((snapshot) => {
      if (alive) setWallet(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function handleBuy(skinId: PieceSkinId) {
    setBusySkin(skinId);
    setMessage(null);
    const result = await buySkin(skinId);
    setWallet(result.wallet);
    setMessage(result.message);
    await refreshProfile();
    setBusySkin(null);
  }

  async function handleEquip(skinId: PieceSkinId) {
    setBusySkin(skinId);
    setMessage(null);
    const result = await equipSkin(skinId);
    setWallet(result.wallet);
    setMessage(result.message);
    await refreshProfile();
    setBusySkin(null);
  }

  return (
    <div className="shop-layout">
      <section className="panel-strong shop-hero-card">
        <div>
          <span className="kicker"><Crown size={14} /> Cosmetics shop</span>
          <h1>Spend bot-match coins on piece skins.</h1>
          <p>
            Coins are virtual MateMind currency. Win stake matches against bots to grow the wallet, then buy and equip piece skins for live games and review boards.
          </p>
        </div>
        <div className="shop-wallet-card"><Coins size={22} /><strong>{wallet?.coins ?? 0}</strong><span>coins available</span></div>
      </section>

      {message ? <div className="panel shop-message-card"><Sparkles size={18} /><span>{message}</span></div> : null}

      <section className="shop-grid">
        {PIECE_SKINS.map((skin) => {
          const owned = wallet?.ownedSkins.includes(skin.id) ?? skin.id === "classic";
          const equipped = wallet?.activeSkin === skin.id;
          return (
            <article key={skin.id} className={`panel shop-card ${equipped ? "active" : ""}`}>
              <div className={`skin-preview skin-preview-${skin.id}`}>
                <span>♔</span><span>♛</span><span>♘</span>
              </div>
              <div className="shop-card-head">
                <span>{skin.rarity}</span>
                <h2>{skin.name}</h2>
              </div>
              <p>{skin.description}</p>
              <div className="shop-price"><Coins size={16} /> {skin.price}</div>
              <div className="shop-actions">
                {equipped ? (
                  <button type="button" className="button-secondary" disabled><Check size={16} /> Equipped</button>
                ) : owned ? (
                  <button type="button" className="button-primary" onClick={() => void handleEquip(skin.id)} disabled={busySkin === skin.id}>
                    <WandSparkles size={16} /> {busySkin === skin.id ? "Equipping…" : "Equip"}
                  </button>
                ) : (
                  <button type="button" className="button-primary" onClick={() => void handleBuy(skin.id)} disabled={busySkin === skin.id}>
                    <Coins size={16} /> {busySkin === skin.id ? "Buying…" : "Buy"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
