"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess, type Move, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Coins,
  Copy,
  Crown,
  Flag,
  FlipHorizontal2,
  Link2,
  LoaderCircle,
  RotateCcw,
  Swords,
  Undo2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { CoachReview as CoachReviewPanel } from "@/components/coach/coach-review";
import { useAuth } from "@/components/auth/auth-provider";
import { analyzeGameWithStockfish } from "@/lib/chess/review";
import { boardPaletteForSkin, customPiecesForSkin } from "@/lib/chess/piece-skins";
import { persistGame, persistReview, type PersistenceResult } from "@/lib/data/game-repository";
import { createId } from "@/lib/storage";
import { StockfishClient, STOCKFISH_BOT_PRESETS } from "@/lib/stockfish/stockfish-client";
import { uciToMove } from "@/lib/stockfish/uci";
import type {
  CoachReview,
  CoinMode,
  Difficulty,
  GameMode,
  GameRecord,
  GameResultCode,
  MoveCategoryCounts,
  PlayerColor,
} from "@/lib/types";

type ArenaMode = Exclude<GameMode, "room">;
type SetupMode = ArenaMode | "friend";
type BoardOrientation = "white" | "black";
type ArenaPhase = "setup" | "playing";
type DraftColor = PlayerColor | "random";
type EngineStatus = "idle" | "loading" | "ready" | "error";

type TerminalResult = {
  result: GameResultCode;
  label: string;
  cause: string;
};

const botProfiles: Record<
  Difficulty,
  { name: string; avatar: string; personality: string; accent: string; payoutMultiplier: number }
> = {
  easy: {
    name: "Milo",
    avatar: "♙",
    personality: "Beginner bot — forgiving, but still engine-guided instead of random.",
    accent: "Warm-up",
    payoutMultiplier: 1.5,
  },
  medium: {
    name: "Nora",
    avatar: "♘",
    personality: "Intermediate bot — punishes hanging pieces and basic tactical slips.",
    accent: "Balanced",
    payoutMultiplier: 2,
  },
  hard: {
    name: "Atlas",
    avatar: "♛",
    personality: "Advanced bot — deeper Stockfish settings for a serious demo match.",
    accent: "Pressure",
    payoutMultiplier: 3,
  },
};

function randomColor(): PlayerColor {
  return Math.random() < 0.5 ? "w" : "b";
}

function colorLabel(color: PlayerColor | "both" | DraftColor) {
  if (color === "w") return "White";
  if (color === "b") return "Black";
  if (color === "random") return "Random";
  return "Both";
}

function movePairs(history: string[]) {
  const rows: Array<{ moveNumber: number; white?: string; black?: string }> = [];
  history.forEach((move, index) => {
    const rowIndex = Math.floor(index / 2);
    if (!rows[rowIndex]) rows[rowIndex] = { moveNumber: rowIndex + 1 };
    if (index % 2 === 0) rows[rowIndex].white = move;
    else rows[rowIndex].black = move;
  });
  return rows;
}

function boardResultCode(game: Chess): GameResultCode {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isDraw() || game.isStalemate()) return "1/2-1/2";
  return "*";
}

function resultCode(game: Chess, terminal: TerminalResult | null) {
  return terminal?.result ?? boardResultCode(game);
}

function boardStatus(game: Chess, terminal: TerminalResult | null) {
  if (terminal) return terminal.label;
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isStalemate()) return "Draw by stalemate";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material";
  if (game.isDraw()) return "Draw";
  if (game.isCheck()) return `${game.turn() === "w" ? "White" : "Black"} to move — check`;
  return `${game.turn() === "w" ? "White" : "Black"} to move`;
}

function createResignationResult(mode: ArenaMode, playerColor: PlayerColor, turn: PlayerColor): TerminalResult {
  if (mode === "ai") {
    const code: GameResultCode = playerColor === "w" ? "0-1" : "1-0";
    return {
      result: code,
      label: "You resigned",
      cause: "resignation",
    };
  }

  const winner = turn === "w" ? "Black" : "White";
  const code: GameResultCode = turn === "w" ? "0-1" : "1-0";
  return {
    result: code,
    label: `${winner} wins by resignation`,
    cause: "resignation",
  };
}

function userOutcomeTitle(code: GameResultCode, mode: ArenaMode, playerColor: PlayerColor) {
  if (code === "1/2-1/2") return "Draw";
  if (mode === "local") return code === "1-0" ? "White won" : code === "0-1" ? "Black won" : "Game ended";
  const playerWon = (playerColor === "w" && code === "1-0") || (playerColor === "b" && code === "0-1");
  return playerWon ? "You won" : "You lost";
}

function quickCounts(review: CoachReview | null, playerColor: PlayerColor): MoveCategoryCounts | null {
  if (!review) return null;
  return playerColor === "w" ? review.categoryCounts.w : review.categoryCounts.b;
}

function persistenceCopy(result: PersistenceResult | null) {
  if (!result) return null;
  if (result.destination === "supabase") return "Saved to your Supabase profile.";
  if (result.error) return `Saved locally. Cloud sync skipped: ${result.error}`;
  return "Saved locally in guest mode.";
}

function coinOutcomeText(
  code: GameResultCode,
  playerColor: PlayerColor,
  stake: number,
  multiplier: number,
) {
  if (!stake) return null;
  if (code === "1/2-1/2") return "Draw: stake returned, no profit.";
  const playerWon = (playerColor === "w" && code === "1-0") || (playerColor === "b" && code === "0-1");
  if (playerWon) return `Win payout: +${Math.round(stake * (multiplier - 1))} net coins.`;
  return `Loss: -${stake} coins.`;
}

function coinModeLabel(mode: CoinMode) {
  return mode === "stake" ? "Coin stake" : "No stake";
}

export function ChessArena() {
  const router = useRouter();
  const { coins, activeSkin, refreshProfile } = useAuth();
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const game = gameRef.current;

  const botEngineRef = useRef<StockfishClient | null>(null);
  const savedGameIdRef = useRef<string | null>(null);
  const autoReviewTriggeredRef = useRef(false);

  const [fen, setFen] = useState(game.fen());
  const [phase, setPhase] = useState<ArenaPhase>("setup");
  const [mode, setMode] = useState<ArenaMode>("ai");
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [coinMode, setCoinMode] = useState<CoinMode>("free");
  const [stakeCoins, setStakeCoins] = useState(50);

  const [draftSetupMode, setDraftSetupMode] = useState<SetupMode>("ai");
  const [draftColor, setDraftColor] = useState<DraftColor>("w");
  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty>("medium");
  const [draftCoinMode, setDraftCoinMode] = useState<CoinMode>("free");
  const [draftStakeCoins, setDraftStakeCoins] = useState(50);

  const [orientation, setOrientation] = useState<BoardOrientation>("white");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
  const [botError, setBotError] = useState<string | null>(null);
  const [terminalResult, setTerminalResult] = useState<TerminalResult | null>(null);
  const [showResultPanel, setShowResultPanel] = useState(false);
  const [showReviewMode, setShowReviewMode] = useState(false);

  const [review, setReview] = useState<CoachReview | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PersistenceResult | null>(null);

  const [roomInvite, setRoomInvite] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [stakeError, setStakeError] = useState<string | null>(null);

  const historyVerbose = game.history({ verbose: true }) as Move[];
  const historySan = game.history();
  const finalStatus = boardStatus(game, terminalResult);
  const currentResult = resultCode(game, terminalResult);
  const isFinished = terminalResult !== null || game.isGameOver();
  const activeBot = botProfiles[difficulty];
  const activePreset = STOCKFISH_BOT_PRESETS[difficulty];
  const draftBot = botProfiles[draftDifficulty];
  const draftPreset = STOCKFISH_BOT_PRESETS[draftDifficulty];
  const resultCounts = quickCounts(review, playerColor);
  const palette = boardPaletteForSkin(activeSkin);
  const netCoinPreview = Math.round(draftStakeCoins * (draftBot.payoutMultiplier - 1));

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [] as Square[];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map(
      (move) => move.to as Square,
    );
  }, [fen, selectedSquare, game]);

  const lastMove = historyVerbose.at(-1);
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selectedSquare) {
      styles[selectedSquare] = { background: "rgba(255, 215, 64, 0.45)" };
    }
    legalTargets.forEach((square) => {
      styles[square] = {
        background:
          "radial-gradient(circle, rgba(40, 60, 28, 0.62) 0%, rgba(40, 60, 28, 0.62) 18%, transparent 21%)",
      };
    });
    if (lastMove) {
      styles[lastMove.from] = {
        ...(styles[lastMove.from] ?? {}),
        boxShadow: "inset 0 0 0 9999px rgba(255, 215, 64, 0.22)",
      };
      styles[lastMove.to] = {
        ...(styles[lastMove.to] ?? {}),
        boxShadow: "inset 0 0 0 9999px rgba(255, 215, 64, 0.32)",
      };
    }
    return styles;
  }, [lastMove, legalTargets, selectedSquare]);

  useEffect(() => {
    return () => {
      botEngineRef.current?.dispose();
      botEngineRef.current = null;
    };
  }, []);

  function syncBoard() {
    setFen(game.fen());
  }

  async function saveCurrentGame(force = false, terminalOverride: TerminalResult | null = terminalResult) {
    const effectiveFinished = terminalOverride !== null || game.isGameOver();
    if (!force && !effectiveFinished) return null;
    const id = savedGameIdRef.current ?? createId("game");
    savedGameIdRef.current = id;
    const effectiveResult = resultCode(game, terminalOverride);
    const record: GameRecord = {
      id,
      mode,
      playerColor: mode === "local" ? "both" : playerColor,
      result: effectiveResult,
      resultCause: terminalOverride?.cause ?? (game.isCheckmate() ? "checkmate" : game.isDraw() ? "draw" : undefined),
      pgn: game.pgn(),
      fen: game.fen(),
      movesCount: game.history().length,
      createdAt: new Date().toISOString(),
      opponent: mode === "ai" ? `${activeBot.name} · ${activePreset.label}` : "Local 2-player",
      difficulty: mode === "ai" ? difficulty : undefined,
      coinMode: mode === "ai" ? coinMode : "free",
      stakeCoins: mode === "ai" && coinMode === "stake" ? stakeCoins : 0,
      payoutMultiplier: mode === "ai" && coinMode === "stake" ? activeBot.payoutMultiplier : 1,
    };
    const persistence = await persistGame(record);
    setSaveState(persistence);
    await refreshProfile();
    return id;
  }

  function maybeStartAutoReview(terminalOverride: TerminalResult | null = terminalResult) {
    if (autoReviewTriggeredRef.current || game.history().length < 4) return;
    autoReviewTriggeredRef.current = true;
    void analyzeGame({ automatic: true, terminalOverride });
  }

  function afterMove() {
    setSelectedSquare(null);
    setAnalysisError(null);
    syncBoard();
    if (game.isGameOver()) {
      setShowResultPanel(true);
      void saveCurrentGame(true);
      maybeStartAutoReview();
    }
  }

  function canHumanMove() {
    if (phase !== "playing" || isFinished || isAiThinking) return false;
    if (mode === "local") return true;
    return game.turn() === playerColor;
  }

  function tryLegalMove(sourceSquare: string, targetSquare: string | null) {
    if (!targetSquare || sourceSquare === targetSquare || !canHumanMove()) return null;
    try {
      return game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
    } catch {
      return null;
    }
  }

  function makeMove(sourceSquare: string, targetSquare: string | null) {
    const move = tryLegalMove(sourceSquare, targetSquare);
    if (!move) return false;
    setReview(null);
    setShowReviewMode(false);
    afterMove();
    return true;
  }

  function handleSquareClick(square: string) {
    const typedSquare = square as Square;
    if (!canHumanMove()) return;

    if (selectedSquare) {
      const moved = makeMove(selectedSquare, typedSquare);
      if (moved) return;
    }

    const piece = game.get(typedSquare);
    if (piece && piece.color === game.turn()) {
      setSelectedSquare(typedSquare);
    } else {
      setSelectedSquare(null);
    }
  }

  function resetGame(activeMode = mode, activeColor = playerColor, activeDifficulty = difficulty) {
    game.reset();
    savedGameIdRef.current = null;
    autoReviewTriggeredRef.current = false;
    setMode(activeMode);
    setPlayerColor(activeColor);
    setDifficulty(activeDifficulty);
    setOrientation(activeColor === "b" && activeMode === "ai" ? "black" : "white");
    setSelectedSquare(null);
    setReview(null);
    setShowReviewMode(false);
    setAnalysisError(null);
    setReviewProgress(null);
    setTerminalResult(null);
    setShowResultPanel(false);
    setSaveState(null);
    setIsAiThinking(false);
    syncBoard();
  }

  function startConfiguredGame() {
    if (draftSetupMode === "friend") return;
    if (draftSetupMode === "ai" && draftCoinMode === "stake") {
      const normalizedStake = Math.max(1, Math.round(draftStakeCoins));
      if (normalizedStake > coins) {
        setStakeError(`You have ${coins} coins, but the stake is ${normalizedStake}.`);
        return;
      }
      setStakeCoins(normalizedStake);
    } else {
      setStakeCoins(0);
    }
    setStakeError(null);
    const lockedColor = draftSetupMode === "ai" ? (draftColor === "random" ? randomColor() : draftColor) : "w";
    setCoinMode(draftSetupMode === "ai" ? draftCoinMode : "free");
    resetGame(draftSetupMode, lockedColor, draftDifficulty);
    setPhase("playing");
  }

  function restartGame() {
    resetGame();
  }

  function backToSetup() {
    setDraftSetupMode(mode);
    setDraftColor(playerColor);
    setDraftDifficulty(difficulty);
    setDraftCoinMode(coinMode);
    setDraftStakeCoins(stakeCoins || 50);
    resetGame(mode, playerColor, difficulty);
    setPhase("setup");
  }

  function undoMove() {
    if (phase !== "playing" || historySan.length === 0 || isAiThinking || isFinished) return;
    game.undo();
    if (mode === "ai" && game.history().length > 0 && game.turn() !== playerColor) {
      game.undo();
    }
    savedGameIdRef.current = null;
    autoReviewTriggeredRef.current = false;
    setSelectedSquare(null);
    setReview(null);
    setShowReviewMode(false);
    setAnalysisError(null);
    setSaveState(null);
    syncBoard();
  }

  function resignGame() {
    if (phase !== "playing" || isFinished) return;
    const terminal = createResignationResult(mode, playerColor, game.turn() as PlayerColor);
    setTerminalResult(terminal);
    setShowResultPanel(true);
    void saveCurrentGame(true, terminal);
    maybeStartAutoReview(terminal);
  }

  async function ensureBotEngine() {
    if (botEngineRef.current) return botEngineRef.current;
    setEngineStatus("loading");
    setBotError(null);
    const client = new StockfishClient();
    try {
      await client.init();
      botEngineRef.current = client;
      setEngineStatus("ready");
      return client;
    } catch (error) {
      client.dispose();
      botEngineRef.current = null;
      setEngineStatus("error");
      const message = error instanceof Error ? error.message : "Stockfish failed to load.";
      setBotError(`${message} Bot moves are paused so the app does not fake engine strength.`);
      throw error;
    }
  }

  async function analyzeGame({
    automatic = false,
    terminalOverride = terminalResult,
  }: { automatic?: boolean; terminalOverride?: TerminalResult | null } = {}) {
    if (game.history().length < 2) {
      setAnalysisError("Play at least one full move before requesting a Stockfish review.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setReviewProgress(automatic ? "Preparing automatic post-game review…" : "Preparing Stockfish review…");

    try {
      const engineReview = await analyzeGameWithStockfish({
        pgn: game.pgn(),
        playerColor: mode === "local" ? "w" : playerColor,
        resultCode: resultCode(game, terminalOverride),
        resultLabel: boardStatus(game, terminalOverride),
        onProgress: (progress) => setReviewProgress(progress.label),
      });

      let finalReview = engineReview;
      try {
        const response = await fetch("/api/analyze-game", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ review: engineReview }),
        });
        const data = (await response.json()) as { review?: CoachReview };
        if (response.ok && data.review) finalReview = data.review;
      } catch {
        // Engine review is complete even if optional text polish fails.
      }

      setReview(finalReview);
      const gameId = await saveCurrentGame(true, terminalOverride);
      if (gameId) {
        const persistence = await persistReview(gameId, finalReview);
        setSaveState(persistence);
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Unable to generate the Stockfish review.");
    } finally {
      setIsAnalyzing(false);
      setReviewProgress(null);
    }
  }

  async function createRoomInvite(openImmediately = false) {
    const roomId = createId("room").replace("room_", "").slice(0, 12);
    const invite = `${window.location.origin}/room/${roomId}`;
    setRoomInvite(invite);
    try {
      await navigator.clipboard.writeText(invite);
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
    if (openImmediately) router.push(`/room/${roomId}`);
  }

  async function copyRoomInvite() {
    if (!roomInvite) return;
    try {
      await navigator.clipboard.writeText(roomInvite);
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function moveBot() {
      if (
        phase !== "playing" ||
        mode !== "ai" ||
        isFinished ||
        game.turn() === playerColor ||
        isAiThinking
      ) {
        return;
      }

      setIsAiThinking(true);
      setBotError(null);
      try {
        const engine = await ensureBotEngine();
        const result = await engine.getBestMove(game.fen(), difficulty);
        if (cancelled) return;
        const payload = uciToMove(result.bestMove);
        if (!payload) {
          throw new Error("Stockfish returned no legal move for this position.");
        }
        let move: Move | null = null;
        try {
          move = game.move({
            from: payload.from,
            to: payload.to,
            promotion: payload.promotion,
          });
        } catch {
          move = null;
        }
        if (!move) {
          throw new Error(`Stockfish returned an illegal move (${result.bestMove ?? "none"}).`);
        }
        setReview(null);
        setShowReviewMode(false);
        afterMove();
      } catch (error) {
        if (!cancelled) {
          setEngineStatus("error");
          setBotError(error instanceof Error ? error.message : "Stockfish bot move failed.");
        }
      } finally {
        if (!cancelled) setIsAiThinking(false);
      }
    }

    void moveBot();
    return () => {
      cancelled = true;
    };
  }, [difficulty, fen, isFinished, mode, phase, playerColor]);

  const chessboardOptions: ChessboardOptions = {
    id: "matemind-board",
    position: fen,
    boardOrientation: orientation,
    allowDragging: true,
    showNotation: true,
    animationDurationInMs: 180,
    boardStyle: {
      borderRadius: "0.45rem",
      overflow: "hidden",
      touchAction: "none",
    },
    darkSquareStyle: { backgroundColor: palette.dark },
    lightSquareStyle: { backgroundColor: palette.light },
    squareStyles,
    pieces: customPiecesForSkin(activeSkin),
    canDragPiece: ({ piece }) => canHumanMove() && piece.pieceType[0] === game.turn(),
    onPieceDrop: ({ sourceSquare, targetSquare }) => makeMove(sourceSquare, targetSquare),
    onSquareClick: ({ square }) => handleSquareClick(square),
  };

  if (phase === "setup") {
    return (
      <div className="play-setup-layout">
        <section className="setup-main-card">
          <div className="setup-header-block">
            <span className="setup-kicker"><Crown size={16} /> Play chess</span>
            <h1>Choose the match before the board opens.</h1>
            <p>Bot, friend link, color, and coin mode lock before a game starts. Stockfish powers bot matches; private links power friend rooms.</p>
          </div>

          <div className="setup-mode-tabs" role="tablist" aria-label="Game mode">
            <button type="button" className={draftSetupMode === "ai" ? "active" : ""} onClick={() => setDraftSetupMode("ai")}>
              <Crown size={18} /> Play vs bot
            </button>
            <button type="button" className={draftSetupMode === "local" ? "active" : ""} onClick={() => setDraftSetupMode("local")}>
              <UsersRound size={18} /> Local 2-player
            </button>
            <button type="button" className={draftSetupMode === "friend" ? "active" : ""} onClick={() => setDraftSetupMode("friend")}>
              <Link2 size={18} /> Friend link
            </button>
          </div>

          {draftSetupMode === "ai" ? (
            <>
              <div className="setup-section-title">Choose a bot</div>
              <div className="bot-choice-grid">
                {(Object.keys(botProfiles) as Difficulty[]).map((level) => {
                  const profile = botProfiles[level];
                  const preset = STOCKFISH_BOT_PRESETS[level];
                  const active = draftDifficulty === level;
                  return (
                    <button
                      type="button"
                      key={level}
                      className={`bot-card ${active ? "active" : ""}`}
                      onClick={() => setDraftDifficulty(level)}
                    >
                      <div className="bot-card-avatar">{profile.avatar}</div>
                      <div className="bot-card-content">
                        <div className="bot-card-title">
                          {profile.name}
                          <span>{preset.label}</span>
                        </div>
                        <div className="bot-card-level">{profile.accent} · approx. strength, not calibrated Elo</div>
                        <div className="bot-card-copy">{profile.personality}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="selected-bot-copy">
                <strong>{draftBot.name}</strong> · {draftPreset.description}
              </div>

              <div className="setup-two-column-grid">
                <div>
                  <div className="setup-section-title">Play as</div>
                  <div className="color-choice-row">
                    <button type="button" className={draftColor === "w" ? "active" : ""} onClick={() => setDraftColor("w")}>♔ White</button>
                    <button type="button" className={draftColor === "b" ? "active" : ""} onClick={() => setDraftColor("b")}>♚ Black</button>
                    <button type="button" className={draftColor === "random" ? "active" : ""} onClick={() => setDraftColor("random")}>◐ Random</button>
                  </div>
                </div>

                <div>
                  <div className="setup-section-title">Coin mode</div>
                  <div className="coin-mode-card">
                    <div className="coin-mode-toggle">
                      <button type="button" className={draftCoinMode === "free" ? "active" : ""} onClick={() => setDraftCoinMode("free")}>Free</button>
                      <button type="button" className={draftCoinMode === "stake" ? "active" : ""} onClick={() => setDraftCoinMode("stake")}>Stake coins</button>
                    </div>
                    {draftCoinMode === "stake" ? (
                      <div className="stake-editor">
                        <label>
                          Stake
                          <input className="input-shell" type="number" min={1} max={Math.max(1, coins)} value={draftStakeCoins} onChange={(event) => setDraftStakeCoins(Math.max(1, Number(event.target.value || 1)))} />
                        </label>
                        <div className="stake-preview-grid">
                          <div><span>Wallet</span><strong>{coins}</strong></div>
                          <div><span>Multiplier</span><strong>x{draftBot.payoutMultiplier}</strong></div>
                          <div><span>Profit if win</span><strong>+{netCoinPreview}</strong></div>
                        </div>
                        <div className="quick-stake-row">
                          {[10, 50, 100].map((amount) => (
                            <button type="button" key={amount} onClick={() => setDraftStakeCoins(Math.min(coins || amount, amount))}>{amount}</button>
                          ))}
                          <button type="button" onClick={() => setDraftStakeCoins(Math.max(1, coins))}>Max</button>
                        </div>
                      </div>
                    ) : (
                      <p>No coins are risked. The game still saves and receives a review.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : draftSetupMode === "local" ? (
            <div className="local-mode-card">
              <UsersRound size={22} />
              <div>
                <strong>Pass-and-play mode</strong>
                <p>Two people share one screen. After the game, MateMind can still run the Stockfish-derived Game Review.</p>
              </div>
            </div>
          ) : (
            <div className="friend-mode-card">
              <Link2 size={24} />
              <div>
                <strong>Play with a friend by link</strong>
                <p>Create a private room, copy the invite URL, and sync legal moves with Supabase Realtime when environment keys are configured. Without Supabase, the room remains a single-browser fallback.</p>
              </div>
              <div className="room-inline-actions friend-link-actions">
                <button type="button" onClick={() => void createRoomInvite(false)}><Copy size={16} /> Create + copy link</button>
                <button type="button" onClick={() => void createRoomInvite(true)}><ArrowRight size={16} /> Open fresh room</button>
              </div>
              {roomInvite ? (
                <div className="room-link-preview setup-preview-link">
                  <p>{roomInvite}</p>
                  <div>
                    <button type="button" onClick={() => void copyRoomInvite()}><Copy size={16} /> {copyState === "copied" ? "Copied" : "Copy"}</button>
                    <Link href={roomInvite}>Open room <ArrowRight size={16} /></Link>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {draftSetupMode !== "friend" ? (
            <button type="button" className="chess-play-cta" onClick={startConfiguredGame}>
              <Swords size={20} /> Play
            </button>
          ) : null}
          {stakeError ? <p className="analysis-error">{stakeError}</p> : null}
          {botError ? <p className="analysis-error">{botError}</p> : null}
        </section>

        <aside className="setup-sidebar-stack">
          <article className="setup-side-card">
            <h3>Selected setup</h3>
            <div className="setup-side-row"><span>Mode</span><strong>{draftSetupMode === "ai" ? "Bot match" : draftSetupMode === "local" ? "Local 2-player" : "Friend room"}</strong></div>
            <div className="setup-side-row"><span>Bot</span><strong>{draftSetupMode === "ai" ? `${draftBot.name} · ${draftPreset.label}` : "—"}</strong></div>
            <div className="setup-side-row"><span>Color</span><strong>{draftSetupMode === "ai" ? colorLabel(draftColor) : draftSetupMode === "local" ? "Both" : "Room assignment"}</strong></div>
            <div className="setup-side-row"><span>Coins</span><strong>{draftSetupMode === "ai" ? coinModeLabel(draftCoinMode) : "No stake"}</strong></div>
            <div className="setup-side-row"><span>Engine</span><strong>{engineStatus === "ready" ? "Stockfish ready" : engineStatus === "error" ? "Load error" : "Loads on start"}</strong></div>
          </article>

          <article className="setup-side-card">
            <h3>Economy rules</h3>
            <ul className="setup-check-list">
              <li>Bot stakes use virtual coins only, not real money.</li>
              <li>Win profit: Beginner x1.5, Intermediate x2, Advanced x3.</li>
              <li>Draw returns the stake; a loss deducts the stake.</li>
              <li>Coins buy cosmetic piece skins in the Shop.</li>
            </ul>
          </article>

          <article className="setup-side-card">
            <h3>What the review uses</h3>
            <ul className="setup-check-list">
              <li>Stockfish evaluation before and after every move.</li>
              <li>Best move, centipawn loss, expected-score loss, and mate swings.</li>
              <li>Accuracy is capped when repeated blunders make a high score implausible.</li>
            </ul>
          </article>
        </aside>
      </div>
    );
  }

  if (showReviewMode && review) {
    return (
      <div className="review-mode-page">
        <div className="review-mode-toolbar">
          <button type="button" className="button-secondary" onClick={() => setShowReviewMode(false)}><ArrowLeft size={18} /> Back to board</button>
          <button type="button" className="button-primary" onClick={restartGame}><RotateCcw size={18} /> Rematch</button>
        </div>
        <CoachReviewPanel review={review} />
      </div>
    );
  }

  return (
    <>
      <div className="chess-game-layout">
        <section className="board-stage">
          <div className="player-strip opponent-strip">
            <div className="player-chip">
              <span className="player-avatar">{mode === "ai" ? activeBot.avatar : "♚"}</span>
              <div>
                <strong>{mode === "ai" ? activeBot.name : "Player 2"}</strong>
                <span>{mode === "ai" ? `${activePreset.label} Stockfish bot` : "Local opponent"}</span>
              </div>
            </div>
            {isAiThinking ? (
              <div className="thinking-pill"><LoaderCircle size={14} className="animate-spin" /> Bot thinking</div>
            ) : (
              <div className="turn-pill">{finalStatus}</div>
            )}
          </div>

          <div className="board-frame chesscom-board mx-auto max-w-[760px]">
            <Chessboard options={chessboardOptions} />
          </div>

          <div className="player-strip self-strip">
            <div className="player-chip">
              <span className="player-avatar self">{mode === "local" ? "♔" : playerColor === "w" ? "♔" : "♚"}</span>
              <div>
                <strong>{mode === "local" ? "Player 1" : "You"}</strong>
                <span>{mode === "local" ? "Shared board" : `Playing ${colorLabel(playerColor)}`}</span>
              </div>
            </div>
            <div className="current-config-pill">{mode === "ai" ? `Vs ${activeBot.name}` : "Local match"}</div>
          </div>

          <div className="board-action-bar">
            <button type="button" onClick={backToSetup}><ArrowLeft size={18} /> Bots</button>
            <button type="button" onClick={restartGame}><RotateCcw size={18} /> Rematch</button>
            <button type="button" onClick={undoMove} disabled={historySan.length === 0 || isAiThinking || isFinished}><Undo2 size={18} /> Undo</button>
            <button type="button" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}><FlipHorizontal2 size={18} /> Flip</button>
            <button type="button" onClick={resignGame} disabled={isFinished}><Flag size={18} /> Resign</button>
          </div>
        </section>

        <aside className="game-side-panel">
          <div className="side-panel-header">
            <span className="side-kicker"><Swords size={15} /> Live match</span>
            <h2>{mode === "ai" ? `${activeBot.name} vs You` : "Local game in progress"}</h2>
            <p>{finalStatus}</p>
          </div>

          <div className="match-summary-card">
            <div><span>Mode</span><strong>{mode === "ai" ? "Bot match" : "Local 2-player"}</strong></div>
            <div><span>Color</span><strong>{mode === "ai" ? colorLabel(playerColor) : "Both"}</strong></div>
            <div><span>Moves</span><strong>{historySan.length}</strong></div>
          </div>

          {mode === "ai" ? (
            <div className="wallet-match-card">
              <Wallet size={18} />
              <div><span>{coinModeLabel(coinMode)}</span><strong>{coinMode === "stake" ? `${stakeCoins} stake · x${activeBot.payoutMultiplier}` : `${coins} coins in wallet`}</strong></div>
            </div>
          ) : null}

          {botError ? (
            <div className="engine-error-card">
              <strong>Stockfish unavailable</strong>
              <p>{botError}</p>
            </div>
          ) : null}

          <section className="move-panel">
            <div className="move-panel-title">
              <strong>Moves</strong>
              <span>{historySan.length} plies</span>
            </div>
            {historySan.length === 0 ? (
              <p className="empty-moves">Make the first move. SAN notation appears here automatically.</p>
            ) : (
              <div className="moves-scroll">
                <table className="chess-move-table">
                  <thead>
                    <tr><th>#</th><th>White</th><th>Black</th></tr>
                  </thead>
                  <tbody>
                    {movePairs(historySan).map((row) => (
                      <tr key={row.moveNumber}><td>{row.moveNumber}</td><td>{row.white ?? "—"}</td><td>{row.black ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <button type="button" className="coach-review-button" onClick={() => void analyzeGame()} disabled={isAnalyzing || historySan.length < 2}>
            {isAnalyzing ? <LoaderCircle className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
            {isAnalyzing ? "Reviewing…" : review ? "Re-run Game Review" : "Game Review"}
          </button>
          {review ? <button type="button" className="open-review-button" onClick={() => setShowReviewMode(true)}><ArrowRight size={18} /> Open full report</button> : null}

          {reviewProgress ? <p className="review-progress">{reviewProgress}</p> : null}
          {analysisError ? <p className="analysis-error">{analysisError}</p> : null}
          {persistenceCopy(saveState) ? <p className="save-state-copy">{persistenceCopy(saveState)}</p> : null}
        </aside>
      </div>

      {showResultPanel && isFinished ? (
        <div className="result-modal-backdrop" role="dialog" aria-modal="true" aria-label="Game result">
          <section className="result-modal-card chesscom-result-modal">
            <button type="button" className="result-modal-close" onClick={() => setShowResultPanel(false)} aria-label="Close result panel"><X size={18} /></button>
            <span className="setup-kicker"><Crown size={15} /> Match complete</span>
            <h2>{userOutcomeTitle(currentResult, mode, playerColor)}</h2>
            <p>{finalStatus}</p>

            <div className="result-coach-teaser">
              <div>♟</div>
              <strong>{review ? review.summary : isAnalyzing ? "Stockfish is preparing the post-game report." : "Open Game Review to see the most important turning points."}</strong>
            </div>

            <div className="result-score-row">
              <div><span>Result</span><strong>{currentResult}</strong></div>
              <div><span>Moves</span><strong>{historySan.length}</strong></div>
              <div><span>Review</span><strong>{review ? `${review.accuracy}%` : isAnalyzing ? "Running" : "Ready"}</strong></div>
            </div>

            {mode === "ai" && coinMode === "stake" ? (
              <div className="result-coin-banner"><Coins size={18} /> <span>{coinOutcomeText(currentResult, playerColor, stakeCoins, activeBot.payoutMultiplier)}</span></div>
            ) : null}

            <div className="result-count-grid">
              {resultCounts ? (
                ["Brilliant", "Great", "Best", "Mistake", "Blunder", "Miss"].map((label) => (
                  <div key={label}><span>{label}</span><strong>{resultCounts[label as keyof MoveCategoryCounts]}</strong></div>
                ))
              ) : (
                <div className="result-review-pending">
                  <LoaderCircle size={18} className={isAnalyzing ? "animate-spin" : ""} />
                  <span>{isAnalyzing ? "Stockfish is building the post-game counts." : "Run Game Review to populate move-category counts."}</span>
                </div>
              )}
            </div>

            <div className="result-modal-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  if (!review) void analyzeGame();
                  if (review) setShowReviewMode(true);
                }}
                disabled={isAnalyzing}
              >
                <BrainCircuit size={18} /> {review ? "Отчёт о партии" : isAnalyzing ? "Reviewing…" : "Review game"}
              </button>
              <button type="button" className="button-secondary" onClick={restartGame}>
                <RotateCcw size={18} /> Rematch
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
