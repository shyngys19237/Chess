export type GameMode = "ai" | "local" | "room";
export type PlayerColor = "w" | "b";
export type Difficulty = "easy" | "medium" | "hard";
export type CoinMode = "free" | "stake";
export type PieceSkinId = "classic" | "emerald" | "midnight" | "gold" | "pixel" | "marble";

export const PIECE_SKIN_IDS: PieceSkinId[] = [
  "classic",
  "emerald",
  "midnight",
  "gold",
  "pixel",
  "marble",
];

export const MOVE_CLASSIFICATIONS = [
  "Brilliant",
  "Great",
  "Best",
  "Excellent",
  "Good",
  "Inaccuracy",
  "Mistake",
  "Blunder",
  "Miss",
] as const;

export type MoveClassification = (typeof MOVE_CLASSIFICATIONS)[number];

export type GameResultCode = "1-0" | "0-1" | "1/2-1/2" | "*";

export type GameRecord = {
  id: string;
  mode: GameMode;
  playerColor: PlayerColor | "both";
  result: GameResultCode;
  resultCause?: string;
  pgn: string;
  fen: string;
  movesCount: number;
  createdAt: string;
  roomId?: string;
  opponent?: string;
  difficulty?: Difficulty;
  coinMode?: CoinMode;
  stakeCoins?: number;
  payoutMultiplier?: number;
  coinDelta?: number;
  wagerSettled?: boolean;
};

export type EngineEvaluation = {
  /** Evaluation in centipawns from White's perspective. Positive = White is better. */
  whiteCentipawns: number;
  /** Mate distance from White's perspective. Positive = White mating, negative = Black mating. */
  whiteMate?: number;
  depth?: number;
  pv?: string[];
};

export type ReviewGraphPoint = {
  ply: number;
  moveLabel: string;
  whiteCentipawns: number;
  whiteExpectedScore: number;
};

export type ReviewedMove = {
  moveNumber: number;
  ply: number;
  side: PlayerColor;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  evaluationBefore: EngineEvaluation;
  evaluationAfter: EngineEvaluation;
  expectedScoreBefore: number;
  expectedScoreAfter: number;
  expectedScoreLoss: number;
  swingCentipawns: number;
  centipawnLoss: number;
  mateSwing: number;
  classification: MoveClassification;
  explanation: string;
  lesson: string;
};

export type MoveCategoryCounts = Record<MoveClassification, number>;

export type CoachIssue = {
  moveNumber: number;
  ply: number;
  side: PlayerColor;
  label: MoveClassification;
  playedMove: string;
  recommendedMove: string;
  swingCentipawns: number;
  centipawnLoss: number;
  expectedScoreLoss: number;
  explanation: string;
  lesson: string;
  fenBefore: string;
  fenAfter: string;
};

export type MoveQualitySummary = {
  solid: number;
  missedChances: number;
  mistakes: number;
  blunders: number;
};

export type CoachReview = {
  result: string;
  resultCode?: GameResultCode;
  playerColor?: PlayerColor;
  accuracy: number;
  opponentAccuracy?: number;
  whiteAccuracy: number;
  blackAccuracy: number;
  summary: string;
  whatWentWell: string[];
  whatToImprove: string[];
  patterns: string[];
  trainingPriority: string;
  moveQuality: MoveQualitySummary;
  categoryCounts: {
    w: MoveCategoryCounts;
    b: MoveCategoryCounts;
  };
  issues: CoachIssue[];
  reviewedMoves: ReviewedMove[];
  evaluationGraph: ReviewGraphPoint[];
  sanityWarnings: string[];
  provider: "template" | "anthropic" | "openai";
  generatedAt: string;
};

export type LeaderboardEntry = {
  rank: number;
  id: string;
  username: string;
  city: string;
  avatar_url?: string | null;
  xp: number;
  coins: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  reviews_completed: number;
};

export type StoreSkin = {
  id: PieceSkinId;
  name: string;
  description: string;
  price: number;
  rarity: "Starter" | "Common" | "Rare" | "Epic";
};

export type WalletSnapshot = {
  coins: number;
  activeSkin: PieceSkinId;
  ownedSkins: PieceSkinId[];
};
