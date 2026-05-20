import type { ChessboardOptions } from "react-chessboard";
import type { PieceSkinId, StoreSkin } from "@/lib/types";

const symbolMap = {
  wP: "♙", wN: "♘", wB: "♗", wR: "♖", wQ: "♕", wK: "♔",
  bP: "♟", bN: "♞", bB: "♝", bR: "♜", bQ: "♛", bK: "♚",
} as const;

type PieceKey = keyof typeof symbolMap;

export const PIECE_SKINS: StoreSkin[] = [
  { id: "classic", name: "Classic", description: "Clean tournament-style pieces for every board.", price: 0, rarity: "Starter" },
  { id: "emerald", name: "Emerald", description: "Green-tinted crowned pieces that match MateMind's primary UI.", price: 220, rarity: "Common" },
  { id: "midnight", name: "Midnight", description: "High-contrast pieces with a neon shadow for dark rooms.", price: 420, rarity: "Rare" },
  { id: "gold", name: "Gold Crown", description: "Warm premium pieces with a celebratory champion edge.", price: 720, rarity: "Epic" },
  { id: "pixel", name: "Pixel Arcade", description: "Blocky retro glyph treatment for casual bot grinding.", price: 360, rarity: "Rare" },
  { id: "marble", name: "Marble", description: "Soft stone-toned pieces designed for slower review sessions.", price: 520, rarity: "Rare" },
];

function skinClass(skinId: PieceSkinId) {
  return `skin-piece skin-${skinId}`;
}

function makePiece(key: PieceKey, skinId: PieceSkinId) {
  const symbol = symbolMap[key];
  const colorClass = key.startsWith("w") ? "skin-white" : "skin-black";
  return function Piece() {
    return (
      <span
        className={`${skinClass(skinId)} ${colorClass}`}
        aria-hidden="true"
      >
        {symbol}
      </span>
    );
  };
}

export function customPiecesForSkin(skinId: PieceSkinId): NonNullable<ChessboardOptions["pieces"]> {
  return (Object.keys(symbolMap) as PieceKey[]).reduce((accumulator, key) => {
    accumulator[key] = makePiece(key, skinId);
    return accumulator;
  }, {} as NonNullable<ChessboardOptions["pieces"]>);
}

export function boardPaletteForSkin(skinId: PieceSkinId) {
  switch (skinId) {
    case "emerald":
      return { dark: "#698d48", light: "#eef1d6" };
    case "midnight":
      return { dark: "#546b7c", light: "#d9e2e8" };
    case "gold":
      return { dark: "#8c7440", light: "#f0e6c9" };
    case "pixel":
      return { dark: "#5d7c3e", light: "#edf1d8" };
    case "marble":
      return { dark: "#8c8a83", light: "#f4f2ec" };
    case "classic":
    default:
      return { dark: "#779556", light: "#ebecd0" };
  }
}
