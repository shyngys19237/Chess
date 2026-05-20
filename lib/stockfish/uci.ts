import type { EngineEvaluation, PlayerColor } from "@/lib/types";

export type ParsedUciInfo = {
  depth?: number;
  scoreType?: "cp" | "mate";
  scoreValue?: number;
  pv?: string[];
};

export function sideToMoveFromFen(fen: string): PlayerColor {
  const side = fen.trim().split(/\s+/)[1];
  return side === "b" ? "b" : "w";
}

export function parseBestMove(line: string): string | null {
  const match = line.match(/^bestmove\s+([^\s]+)/);
  if (!match) return null;
  const move = match[1];
  return move === "(none)" ? null : move;
}

export function parseUciInfo(line: string): ParsedUciInfo | null {
  if (!line.startsWith("info ")) return null;

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);

  if (!depthMatch && !scoreMatch && !pvMatch) return null;

  return {
    depth: depthMatch ? Number(depthMatch[1]) : undefined,
    scoreType: scoreMatch ? (scoreMatch[1] as "cp" | "mate") : undefined,
    scoreValue: scoreMatch ? Number(scoreMatch[2]) : undefined,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/).filter(Boolean) : undefined,
  };
}

export function mateScoreToCentipawns(mate: number) {
  const sign = mate >= 0 ? 1 : -1;
  const distance = Math.min(99, Math.abs(mate));
  return sign * Math.max(12_000, 100_000 - distance * 1_000);
}

export function evaluationFromUciInfo(
  info: ParsedUciInfo | null,
  fen: string,
): EngineEvaluation {
  const sideToMove = sideToMoveFromFen(fen);
  const sign = sideToMove === "w" ? 1 : -1;

  if (!info || info.scoreValue === undefined || !info.scoreType) {
    return {
      whiteCentipawns: 0,
      depth: info?.depth,
      pv: info?.pv,
    };
  }

  if (info.scoreType === "mate") {
    const whiteMate = info.scoreValue * sign;
    return {
      whiteCentipawns: mateScoreToCentipawns(whiteMate),
      whiteMate,
      depth: info.depth,
      pv: info.pv,
    };
  }

  return {
    whiteCentipawns: info.scoreValue * sign,
    depth: info.depth,
    pv: info.pv,
  };
}

export function clampCentipawns(value: number, maxAbs = 2_000) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

export function expectedWhiteScore(whiteCentipawns: number) {
  const bounded = clampCentipawns(whiteCentipawns, 2_000);
  const probability = 1 / (1 + Math.exp(-bounded / 390));
  return Number(probability.toFixed(4));
}

export function scoreForSide(whiteExpected: number, side: PlayerColor) {
  return side === "w" ? whiteExpected : Number((1 - whiteExpected).toFixed(4));
}

export function centipawnsForSide(whiteCentipawns: number, side: PlayerColor) {
  return side === "w" ? whiteCentipawns : -whiteCentipawns;
}

export function uciToMove(uci: string | null) {
  if (!uci || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
  };
}
