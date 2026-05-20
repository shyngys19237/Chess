import { Chess, type Move } from "chess.js";
import type {
  CoachIssue,
  CoachReview,
  EngineEvaluation,
  GameResultCode,
  MoveCategoryCounts,
  MoveClassification,
  PlayerColor,
  ReviewedMove,
  ReviewGraphPoint,
} from "@/lib/types";
import { MOVE_CLASSIFICATIONS } from "@/lib/types";
import { StockfishClient } from "@/lib/stockfish/stockfish-client";
import {
  centipawnsForSide,
  expectedWhiteScore,
  scoreForSide,
  uciToMove,
} from "@/lib/stockfish/uci";

const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const MATE_CP = 12_000;

export type ReviewProgress = {
  completed: number;
  total: number;
  label: string;
};

export type EngineReviewRequest = {
  pgn: string;
  playerColor?: PlayerColor;
  resultCode?: GameResultCode;
  resultLabel?: string;
  analysisDepth?: number;
  onProgress?: (progress: ReviewProgress) => void;
};

type PositionAnalysis = {
  fen: string;
  bestMove: string | null;
  evaluation: EngineEvaluation;
  principalVariation: string[];
};

type CandidateReviewedMove = Omit<ReviewedMove, "classification" | "explanation" | "lesson"> & {
  rawClassification: MoveClassification;
};

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function moveNumberFromPly(ply: number) {
  return Math.floor((ply + 1) / 2);
}

function moveToUci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function sanForUci(fen: string, uci: string | null) {
  const payload = uciToMove(uci);
  if (!payload) return null;
  const game = new Chess(fen);
  try {
    const legal = game.move({
      from: payload.from,
      to: payload.to,
      promotion: payload.promotion,
    });
    return legal?.san ?? null;
  } catch {
    return null;
  }
}

function applyMovePayload(game: Chess, move: Move) {
  try {
    return game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
  } catch {
    return null;
  }
}

function winnerResultLabel(game: Chess, fallback?: string, resultCode?: GameResultCode) {
  if (fallback) return fallback;
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition";
  if (resultCode === "1-0") return "White wins";
  if (resultCode === "0-1") return "Black wins";
  if (resultCode === "1/2-1/2") return "Draw";
  return "Game review";
}

function sideLabel(side: PlayerColor) {
  return side === "w" ? "White" : "Black";
}

function isCaptureSacrifice(move: Move) {
  if (!move.captured) return false;
  const moverValue = PIECE_VALUES[move.piece] ?? 0;
  const capturedValue = PIECE_VALUES[move.captured] ?? 0;
  return moverValue >= capturedValue + 180;
}

function sideMateScore(evaluation: EngineEvaluation, side: PlayerColor) {
  if (typeof evaluation.whiteMate !== "number") return null;
  const whiteFavorable = evaluation.whiteMate > 0;
  const sideFavorable = side === "w" ? whiteFavorable : !whiteFavorable;
  const distance = Math.min(90, Math.abs(evaluation.whiteMate));
  const magnitude = MATE_CP - distance * 70;
  return sideFavorable ? magnitude : -magnitude;
}

function evalForSide(evaluation: EngineEvaluation, side: PlayerColor) {
  const mateScore = sideMateScore(evaluation, side);
  if (mateScore !== null) return mateScore;
  return centipawnsForSide(evaluation.whiteCentipawns, side);
}

function mateSwingForSide(before: EngineEvaluation, after: EngineEvaluation, side: PlayerColor) {
  const beforeMate = sideMateScore(before, side);
  const afterMate = sideMateScore(after, side);
  if (beforeMate === null && afterMate !== null && afterMate < 0) return 2;
  if (beforeMate !== null && beforeMate > 0 && (afterMate === null || afterMate < beforeMate - 800)) return 1;
  if (beforeMate !== null && beforeMate < 0 && afterMate !== null && afterMate < beforeMate - 350) return 1;
  return 0;
}

function chooseBaseClassification({
  actualUci,
  bestMoveUci,
  expectedScoreLoss,
  centipawnLoss,
  mateSwing,
  move,
  expectedAfter,
  expectedBefore,
}: {
  actualUci: string;
  bestMoveUci: string | null;
  expectedScoreLoss: number;
  centipawnLoss: number;
  mateSwing: number;
  move: Move;
  expectedAfter: number;
  expectedBefore: number;
}): MoveClassification {
  const engineBest = Boolean(bestMoveUci && actualUci === bestMoveUci);
  const nearPerfect = engineBest || (expectedScoreLoss <= 0.006 && centipawnLoss <= 18);
  const nearBest = engineBest || (expectedScoreLoss <= 0.016 && centipawnLoss <= 42);

  if (mateSwing >= 2 || centipawnLoss >= 900 || expectedScoreLoss >= 0.34) return "Blunder";
  if (mateSwing >= 1 || centipawnLoss >= 460 || expectedScoreLoss >= 0.22) return "Blunder";
  if (centipawnLoss >= 260 || expectedScoreLoss >= 0.14) return "Mistake";
  if (centipawnLoss >= 120 || expectedScoreLoss >= 0.072) return "Inaccuracy";

  if (nearPerfect && isCaptureSacrifice(move) && expectedAfter >= 0.44) {
    return "Brilliant";
  }

  if (
    engineBest &&
    expectedBefore <= 0.42 &&
    expectedAfter >= expectedBefore - 0.012 &&
    centipawnLoss <= 24
  ) {
    return "Great";
  }

  if (nearPerfect) return "Best";
  if (nearBest || expectedScoreLoss <= 0.024 || centipawnLoss <= 58) return "Excellent";
  return "Good";
}

function maybeReclassifyMiss(
  current: CandidateReviewedMove,
  previous: CandidateReviewedMove | undefined,
): MoveClassification {
  if (!previous) return current.rawClassification;
  const opponentJustErred = ["Mistake", "Blunder", "Miss"].includes(previous.rawClassification);
  const currentWasCostly = current.expectedScoreBefore >= 0.62 && (current.expectedScoreLoss >= 0.095 || current.centipawnLoss >= 170);
  const losesClearChance = current.expectedScoreAfter < current.expectedScoreBefore - 0.08;

  if (
    opponentJustErred &&
    currentWasCostly &&
    losesClearChance &&
    current.rawClassification !== "Blunder"
  ) {
    return "Miss";
  }

  return current.rawClassification;
}

function categoryCounts(moves: ReviewedMove[], side: PlayerColor): MoveCategoryCounts {
  const counts = MOVE_CLASSIFICATIONS.reduce((accumulator, label) => {
    accumulator[label] = 0;
    return accumulator;
  }, {} as MoveCategoryCounts);

  moves
    .filter((move) => move.side === side)
    .forEach((move) => {
      counts[move.classification] += 1;
    });

  return counts;
}

function moveAccuracy(move: ReviewedMove) {
  if (move.classification === "Brilliant" || move.classification === "Great" || move.classification === "Best") {
    return 100;
  }

  const cpPenalty = Math.min(78, Math.sqrt(Math.max(0, move.centipawnLoss)) * 2.35);
  const expectedPenalty = Math.min(56, move.expectedScoreLoss * 128);
  const matePenalty = move.mateSwing * 22;
  const raw = Math.max(0, Math.round(100 - cpPenalty - expectedPenalty - matePenalty));

  if (move.classification === "Blunder") return Math.min(raw, 28);
  if (move.classification === "Mistake") return Math.min(raw, 54);
  if (move.classification === "Miss") return Math.min(raw, 58);
  if (move.classification === "Inaccuracy") return Math.min(raw, 76);
  if (move.classification === "Good") return Math.min(raw, 90);
  return Math.max(0, Math.min(100, raw));
}

function accuracyForSide(moves: ReviewedMove[], side: PlayerColor) {
  const sideMoves = moves.filter((move) => move.side === side);
  if (sideMoves.length === 0) return 0;
  const total = sideMoves.reduce((sum, move) => sum + moveAccuracy(move), 0);
  return Math.round(total / sideMoves.length);
}

function applyAccuracySanity(
  preliminary: number,
  counts: MoveCategoryCounts,
  side: PlayerColor,
  sideMoveCount: number,
  warnings: string[],
) {
  let adjusted = preliminary;
  const severe = counts.Blunder;
  const meaningful = counts.Blunder + counts.Mistake + counts.Miss;

  if (severe >= 3 && adjusted > 64) {
    adjusted = 64;
    warnings.push(`${sideLabel(side)} accuracy was capped because three or more blunders cannot produce a strong review score.`);
  } else if (severe >= 2 && adjusted > 72) {
    adjusted = 72;
    warnings.push(`${sideLabel(side)} accuracy was capped because repeated blunders dominate the game quality.`);
  } else if (severe >= 1 && sideMoveCount <= 18 && adjusted > 82) {
    adjusted = 82;
    warnings.push(`${sideLabel(side)} accuracy was capped because a short game with a blunder should not read as near-perfect.`);
  }

  if (meaningful >= 4 && adjusted > 76) {
    adjusted = 76;
    warnings.push(`${sideLabel(side)} accuracy was capped because the review found repeated high-impact losses.`);
  }

  return adjusted;
}

function buildMoveExplanation(move: CandidateReviewedMove, classification: MoveClassification) {
  const best = move.bestMoveSan ?? move.bestMoveUci ?? "the engine move";
  const lossPercent = Math.round(move.expectedScoreLoss * 100);
  const swing = Math.round(move.centipawnLoss);

  if (classification === "Brilliant") {
    return {
      explanation: `${move.san} is a Chess.com-inspired brilliant-style find: it stays near the engine line while accepting a material-looking sacrifice without damaging the position.`,
      lesson: "When a sacrifice appears, verify forcing lines before rejecting it.",
    };
  }
  if (classification === "Great") {
    return {
      explanation: `${move.san} was the engine's top resource in a pressured position and kept the evaluation almost unchanged.`,
      lesson: "In worse positions, search for active defensive resources before making passive moves.",
    };
  }
  if (classification === "Best") {
    return {
      explanation: `${move.san} matched, or was effectively indistinguishable from, Stockfish's top recommendation (${best}).`,
      lesson: "Keep the same candidate-move discipline: compare forcing moves before committing.",
    };
  }
  if (classification === "Excellent") {
    return {
      explanation: `${move.san} stayed very close to ${best}; the engine loss was tiny.`,
      lesson: "Small deviations are normal. Preserve this precision in sharper positions too.",
    };
  }
  if (classification === "Good") {
    return {
      explanation: `${move.san} was playable, but ${best} kept a cleaner evaluation. The review measured roughly ${swing} centipawns of loss.`,
      lesson: "When several moves seem fine, compare which one improves coordination or removes counterplay.",
    };
  }
  if (classification === "Inaccuracy") {
    return {
      explanation: `${move.san} gave away a noticeable amount of value. Stockfish preferred ${best}; the review measured about ${swing} centipawns of loss.`,
      lesson: "Before a quiet move, pause and compare at least two candidates instead of playing the first reasonable option.",
    };
  }
  if (classification === "Miss") {
    return {
      explanation: `${move.san} missed a chance to punish the opponent's previous error. ${best} converted more of the advantage.`,
      lesson: "After an opponent mistake, ask whether you can win material, force a threat, or simplify into a clearly better position.",
    };
  }
  if (classification === "Mistake") {
    return {
      explanation: `${move.san} caused a meaningful evaluation drop. ${best} preserved much more of the position, with a loss of about ${swing} centipawns.`,
      lesson: "Run a final blunder check: enemy checks, captures, threats, and loose pieces.",
    };
  }

  return {
    explanation: `${move.san} was a major turning point. The engine preferred ${best}; this lost about ${lossPercent}% expected score and roughly ${swing} centipawns.`,
    lesson: "Slow down in sharp positions. Verify king safety and hanging high-value pieces before moving.",
  };
}

function issueFromMove(move: ReviewedMove): CoachIssue {
  return {
    moveNumber: move.moveNumber,
    ply: move.ply,
    side: move.side,
    label: move.classification,
    playedMove: move.san,
    recommendedMove: move.bestMoveSan ?? move.bestMoveUci ?? "—",
    swingCentipawns: Math.round(move.swingCentipawns),
    centipawnLoss: Math.round(move.centipawnLoss),
    expectedScoreLoss: move.expectedScoreLoss,
    explanation: move.explanation,
    lesson: move.lesson,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
  };
}

function topIssues(moves: ReviewedMove[], playerColor: PlayerColor) {
  const priorities = new Set<MoveClassification>(["Blunder", "Mistake", "Miss", "Inaccuracy"]);
  return moves
    .filter((move) => move.side === playerColor && priorities.has(move.classification))
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || b.expectedScoreLoss - a.expectedScoreLoss)
    .slice(0, 5)
    .map(issueFromMove);
}

function moveQualityFromCounts(counts: MoveCategoryCounts) {
  return {
    solid: counts.Brilliant + counts.Great + counts.Best + counts.Excellent + counts.Good,
    missedChances: counts.Miss,
    mistakes: counts.Inaccuracy + counts.Mistake,
    blunders: counts.Blunder,
  };
}

function openingDropForSide(moves: ReviewedMove[], side: PlayerColor) {
  return moves.some((move) => move.side === side && move.moveNumber <= 6 && (move.expectedScoreLoss >= 0.075 || move.centipawnLoss >= 140));
}

function buildTrainingPriority(
  counts: MoveCategoryCounts,
  moves: ReviewedMove[],
  side: PlayerColor,
) {
  if (counts.Blunder >= 2) return "Tactical blunder checks and piece safety";
  if (counts.Blunder >= 1 || counts.Mistake >= 2) return "Checks-captures-threats scan before every move";
  if (counts.Miss >= 1) return "Converting advantages after the opponent slips";
  if (openingDropForSide(moves, side)) return "Opening development and early king safety";
  if (counts.Inaccuracy >= 3) return "Candidate move comparison in quiet positions";
  return "Maintain the same move quality while stretching into longer games";
}

function buildWhatWentWell(
  counts: MoveCategoryCounts,
  accuracy: number,
  moves: ReviewedMove[],
  side: PlayerColor,
) {
  const points: string[] = [];
  const totalSideMoves = moves.filter((move) => move.side === side).length;
  if (accuracy >= 82 && counts.Blunder === 0 && counts.Mistake <= 1) points.push("Your overall move quality stayed stable; the review found no large repeated collapses.");
  if (counts.Best + counts.Excellent + counts.Great + counts.Brilliant >= Math.max(2, Math.ceil(totalSideMoves * 0.45))) {
    points.push("A strong share of your moves stayed close to Stockfish's preferred line.");
  }
  if (counts.Blunder === 0) points.push("You avoided outright blunders, which keeps games competitive even when smaller inaccuracies appear.");
  if (points.length === 0) points.push("The review surfaced concrete turning points, so the next practice step is specific rather than generic.");
  return points.slice(0, 3);
}

function buildWhatToImprove(
  counts: MoveCategoryCounts,
  moves: ReviewedMove[],
  side: PlayerColor,
) {
  const points: string[] = [];
  if (counts.Blunder > 0) points.push("Piece safety needs a final pre-move scan: checks, captures, direct threats, and loose major pieces.");
  if (counts.Mistake > 0) points.push("Several moves caused meaningful engine swings. Compare two candidate moves before committing in tactical positions.");
  if (counts.Miss > 0) points.push("You missed at least one conversion window after the opponent erred. Practice turning advantages into material or simplified endings.");
  if (openingDropForSide(moves, side)) points.push("The evaluation slipped early. Prioritize development, central control, and castling before side attacks.");
  if (counts.Inaccuracy >= 2 && points.length < 3) points.push("Quiet positions still matter: choose moves that improve coordination and reduce counterplay.");
  if (points.length === 0) points.push("Keep reviewing key moments so strong habits become repeatable under time pressure.");
  return points.slice(0, 3);
}

function buildPatterns(counts: MoveCategoryCounts, moves: ReviewedMove[], side: PlayerColor) {
  const patterns: string[] = [];
  if (counts.Blunder > 0) patterns.push("Blunders were the highest-leverage problem; one severe drop can outweigh many decent moves.");
  if (counts.Miss > 0) patterns.push("The review found missed chances, which often means the opponent offered a tactical or conversion opportunity.");
  if (openingDropForSide(moves, side)) patterns.push("Early evaluation loss suggests opening fundamentals mattered more than late-game technique here.");
  if (counts.Inaccuracy >= 3) patterns.push("Repeated small leaks point to candidate-move comparison rather than a single catastrophic tactic.");
  if (patterns.length === 0) patterns.push("The game was mostly decided by a small number of concrete engine swings, not constant instability.");
  return patterns.slice(0, 3);
}

function buildSummary({
  playerColor,
  accuracy,
  opponentAccuracy,
  counts,
  issues,
}: {
  playerColor: PlayerColor;
  accuracy: number;
  opponentAccuracy: number;
  counts: MoveCategoryCounts;
  issues: CoachIssue[];
}) {
  const identity = playerColor === "w" ? "White" : "Black";
  const meaningful = counts.Blunder + counts.Mistake + counts.Miss;
  const tone =
    meaningful >= 3 || accuracy < 58
      ? "fragile"
      : meaningful >= 1 || accuracy < 72
        ? "uneven"
        : accuracy >= 86
          ? "precise"
          : "solid";
  const headline = `${identity} played a ${tone} game: ${accuracy}% accuracy versus ${opponentAccuracy}% for the opponent.`;
  if (issues.length === 0) {
    return `${headline} The engine review did not find a major player-side collapse.`;
  }
  const biggest = issues[0];
  const issueContext = counts.Blunder > 0 ? "The largest damage came from" : "The biggest teaching moment was";
  return `${headline} ${issueContext} move ${biggest.moveNumber}: ${biggest.playedMove}; ${biggest.recommendedMove} held more of the position.`;
}

function graphPoint(ply: number, san: string, evaluation: EngineEvaluation): ReviewGraphPoint {
  return {
    ply,
    moveLabel: san,
    whiteCentipawns: Math.round(evaluation.whiteCentipawns),
    whiteExpectedScore: expectedWhiteScore(evaluation.whiteCentipawns),
  };
}

export async function analyzeGameWithStockfish({
  pgn,
  playerColor = "w",
  resultCode,
  resultLabel,
  analysisDepth = 11,
  onProgress,
}: EngineReviewRequest): Promise<CoachReview> {
  const finished = new Chess();
  try {
    finished.loadPgn(pgn);
  } catch {
    throw new Error("The PGN could not be parsed for engine review.");
  }

  const history = finished.history({ verbose: true }) as Move[];
  if (history.length === 0) {
    throw new Error("There are no moves to review yet.");
  }

  const replay = new Chess();
  const positionFens = [replay.fen()];
  history.forEach((move) => {
    const applied = applyMovePayload(replay, move);
    if (!applied) throw new Error("A stored move could not be replayed for engine review.");
    positionFens.push(replay.fen());
  });

  const engine = new StockfishClient();
  const analyses: PositionAnalysis[] = [];
  try {
    await engine.init();
    for (let index = 0; index < positionFens.length; index += 1) {
      const fen = positionFens[index];
      const result = await engine.analyzePosition(fen, {
        depth: analysisDepth,
        timeoutMs: 24_000,
      });
      analyses.push({
        fen,
        bestMove: result.bestMove,
        evaluation: result.evaluation,
        principalVariation: result.principalVariation,
      });
      onProgress?.({
        completed: index + 1,
        total: positionFens.length,
        label: `Evaluated ${index + 1}/${positionFens.length} positions`,
      });
    }
  } finally {
    engine.dispose();
  }

  const rawMoves: CandidateReviewedMove[] = history.map((move, index) => {
    const ply = index + 1;
    const side = index % 2 === 0 ? "w" : "b";
    const before = analyses[index];
    const after = analyses[index + 1];
    const beforeExpectedWhite = expectedWhiteScore(before.evaluation.whiteCentipawns);
    const afterExpectedWhite = expectedWhiteScore(after.evaluation.whiteCentipawns);
    const expectedScoreBefore = scoreForSide(beforeExpectedWhite, side);
    const expectedScoreAfter = scoreForSide(afterExpectedWhite, side);
    const expectedScoreLoss = round(Math.max(0, expectedScoreBefore - expectedScoreAfter));
    const beforeEval = evalForSide(before.evaluation, side);
    const afterEval = evalForSide(after.evaluation, side);
    const centipawnLoss = Math.max(0, Math.round(beforeEval - afterEval));
    const swingCentipawns = centipawnLoss;
    const mateSwing = mateSwingForSide(before.evaluation, after.evaluation, side);
    const uci = moveToUci(move);
    const bestMoveSan = sanForUci(before.fen, before.bestMove);
    const rawClassification = chooseBaseClassification({
      actualUci: uci,
      bestMoveUci: before.bestMove,
      expectedScoreLoss,
      centipawnLoss,
      mateSwing,
      move,
      expectedAfter: expectedScoreAfter,
      expectedBefore: expectedScoreBefore,
    });

    return {
      moveNumber: moveNumberFromPly(ply),
      ply,
      side,
      san: move.san,
      uci,
      fenBefore: before.fen,
      fenAfter: after.fen,
      bestMoveUci: before.bestMove,
      bestMoveSan,
      evaluationBefore: before.evaluation,
      evaluationAfter: after.evaluation,
      expectedScoreBefore,
      expectedScoreAfter,
      expectedScoreLoss,
      swingCentipawns,
      centipawnLoss,
      mateSwing,
      rawClassification,
    };
  });

  const reviewedMoves: ReviewedMove[] = rawMoves.map((move, index) => {
    const classification = maybeReclassifyMiss(move, rawMoves[index - 1]);
    const copy = buildMoveExplanation(move, classification);
    return {
      ...move,
      classification,
      explanation: copy.explanation,
      lesson: copy.lesson,
    };
  });

  const whiteCounts = categoryCounts(reviewedMoves, "w");
  const blackCounts = categoryCounts(reviewedMoves, "b");
  const sanityWarnings: string[] = [];
  const whiteMoveCount = reviewedMoves.filter((move) => move.side === "w").length;
  const blackMoveCount = reviewedMoves.filter((move) => move.side === "b").length;
  const whiteAccuracy = applyAccuracySanity(accuracyForSide(reviewedMoves, "w"), whiteCounts, "w", whiteMoveCount, sanityWarnings);
  const blackAccuracy = applyAccuracySanity(accuracyForSide(reviewedMoves, "b"), blackCounts, "b", blackMoveCount, sanityWarnings);
  const accuracy = playerColor === "w" ? whiteAccuracy : blackAccuracy;
  const opponentAccuracy = playerColor === "w" ? blackAccuracy : whiteAccuracy;
  const playerCounts = playerColor === "w" ? whiteCounts : blackCounts;
  const issues = topIssues(reviewedMoves, playerColor);
  const evaluationGraph = [
    graphPoint(0, "Start", analyses[0].evaluation),
    ...reviewedMoves.map((move) => graphPoint(move.ply, move.san, move.evaluationAfter)),
  ];

  return {
    result: winnerResultLabel(finished, resultLabel, resultCode),
    resultCode,
    playerColor,
    accuracy,
    opponentAccuracy,
    whiteAccuracy,
    blackAccuracy,
    summary: buildSummary({
      playerColor,
      accuracy,
      opponentAccuracy,
      counts: playerCounts,
      issues,
    }),
    whatWentWell: buildWhatWentWell(playerCounts, accuracy, reviewedMoves, playerColor),
    whatToImprove: buildWhatToImprove(playerCounts, reviewedMoves, playerColor),
    patterns: buildPatterns(playerCounts, reviewedMoves, playerColor),
    trainingPriority: buildTrainingPriority(playerCounts, reviewedMoves, playerColor),
    moveQuality: moveQualityFromCounts(playerCounts),
    categoryCounts: {
      w: whiteCounts,
      b: blackCounts,
    },
    issues,
    reviewedMoves,
    evaluationGraph,
    sanityWarnings,
    provider: "template",
    generatedAt: new Date().toISOString(),
  };
}

export function reviewSupportsSanityExpectations(review: CoachReview) {
  const warnings: string[] = [];
  const sides: Array<[PlayerColor, MoveCategoryCounts, number]> = [
    ["w", review.categoryCounts.w, review.whiteAccuracy],
    ["b", review.categoryCounts.b, review.blackAccuracy],
  ];

  sides.forEach(([side, counts, accuracy]) => {
    if (counts.Blunder >= 2 && accuracy > 72) {
      warnings.push(`${sideLabel(side)} has multiple blunders but an implausibly high accuracy.`);
    }
    if (counts.Blunder + counts.Mistake + counts.Miss >= 4 && accuracy > 76) {
      warnings.push(`${sideLabel(side)} has repeated major misses but an implausibly high accuracy.`);
    }
  });

  return {
    ok: warnings.length === 0,
    warnings,
  };
}
