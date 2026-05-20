"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Gauge,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { boardPaletteForSkin, customPiecesForSkin } from "@/lib/chess/piece-skins";
import { uciToMove } from "@/lib/stockfish/uci";
import type {
  CoachIssue,
  CoachReview as CoachReviewType,
  MoveCategoryCounts,
  MoveClassification,
  ReviewedMove,
  ReviewGraphPoint,
} from "@/lib/types";

const labelClass: Record<MoveClassification, string> = {
  Brilliant: "review-chip review-chip-brilliant",
  Great: "review-chip review-chip-great",
  Best: "review-chip review-chip-best",
  Excellent: "review-chip review-chip-excellent",
  Good: "review-chip review-chip-good",
  Inaccuracy: "review-chip review-chip-warning",
  Mistake: "review-chip review-chip-mistake",
  Blunder: "review-chip review-chip-danger",
  Miss: "review-chip review-chip-miss",
};

const labelSymbol: Record<MoveClassification, string> = {
  Brilliant: "!!",
  Great: "!",
  Best: "★",
  Excellent: "✓",
  Good: "○",
  Inaccuracy: "?!",
  Mistake: "?",
  Blunder: "×",
  Miss: "⊘",
};

function accuracyTone(value: number) {
  if (value >= 90) return "Elite";
  if (value >= 80) return "Strong";
  if (value >= 68) return "Solid";
  if (value >= 52) return "Swingy";
  return "Needs repair";
}


function graphPolyline(points: ReviewGraphPoint[], width: number, height: number, padding: number) {
  const maxCp = 900;
  if (points.length <= 1) return "";
  return points
    .map((point, index) => {
      const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
      const cp = Math.max(-maxCp, Math.min(maxCp, point.whiteCentipawns));
      const normalized = (cp + maxCp) / (maxCp * 2);
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function EvaluationGraph({ points }: { points: ReviewGraphPoint[] }) {
  const width = 760;
  const height = 190;
  const padding = 20;
  const line = useMemo(() => graphPolyline(points, width, height, padding), [points]);
  const zeroY = height / 2;

  return (
    <section className="review-chart-card chess-review-chart">
      <div className="review-section-head">
        <div>
          <span className="side-kicker"><BarChart3 size={15} /> Evaluation graph</span>
          <h3>Engine swing through the game</h3>
        </div>
        <p>Positive = White better. Negative = Black better.</p>
      </div>
      <div className="review-chart-frame compact-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stockfish evaluation graph">
          <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} className="graph-zero-line" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="graph-axis-line" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="graph-axis-line" />
          {line ? <polyline points={line} className="graph-eval-line" /> : null}
        </svg>
      </div>
    </section>
  );
}

function categoryValue(counts: MoveCategoryCounts, label: MoveClassification) {
  return counts[label] ?? 0;
}

function CompactCountsTable({ review }: { review: CoachReviewType }) {
  const compactLabels: MoveClassification[] = ["Brilliant", "Great", "Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder", "Miss"];
  return (
    <section className="chesscom-counts-panel">
      <div className="chesscom-counts-head"><span>White</span><strong>Move quality</strong><span>Black</span></div>
      <div className="chesscom-count-rows">
        {compactLabels.map((label) => (
          <div key={label} className="chesscom-count-row">
            <strong>{categoryValue(review.categoryCounts.w, label)}</strong>
            <span className={labelClass[label]}>{labelSymbol[label]} {label}</span>
            <strong>{categoryValue(review.categoryCounts.b, label)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function selectedMoveCopy(move: ReviewedMove | null) {
  if (!move) return "Select a reviewed move";
  return `${move.san} — ${move.classification.toLowerCase()} move`;
}

function evalLabel(move: ReviewedMove | null) {
  if (!move) return "0.00";
  const evaluation = move.evaluationAfter;
  if (typeof evaluation.whiteMate === "number") {
    return evaluation.whiteMate > 0 ? `M${Math.abs(evaluation.whiteMate)}` : `-M${Math.abs(evaluation.whiteMate)}`;
  }
  const cp = evaluation.whiteCentipawns / 100;
  return `${cp >= 0 ? "+" : ""}${cp.toFixed(2)}`;
}

function evalMeterPercent(move: ReviewedMove | null) {
  if (!move) return 50;
  const cp = Math.max(-900, Math.min(900, move.evaluationAfter.whiteCentipawns));
  return Math.round(((cp + 900) / 1800) * 100);
}

function boardStylesForReviewedMove(move: ReviewedMove | null, showBest: boolean) {
  const styles: Record<string, React.CSSProperties> = {};
  if (!move) return styles;
  const movePayload = uciToMove(move.uci);
  if (movePayload) {
    styles[movePayload.from] = { boxShadow: "inset 0 0 0 999px rgba(213, 161, 85, 0.28)" };
    styles[movePayload.to] = { boxShadow: "inset 0 0 0 999px rgba(213, 161, 85, 0.42)" };
  }
  if (showBest) {
    const best = uciToMove(move.bestMoveUci);
    if (best) {
      styles[best.from] = {
        ...(styles[best.from] ?? {}),
        outline: "4px solid rgba(132, 190, 74, 0.88)",
        outlineOffset: "-4px",
      };
      styles[best.to] = {
        ...(styles[best.to] ?? {}),
        outline: "4px solid rgba(132, 190, 74, 0.88)",
        outlineOffset: "-4px",
      };
    }
  }
  return styles;
}

function firstTeachingPly(review: CoachReviewType) {
  return review.issues[0]?.ply ?? review.reviewedMoves[0]?.ply ?? 1;
}

function CoachBubble({ review, selectedMove }: { review: CoachReviewType; selectedMove: ReviewedMove | null }) {
  const text = selectedMove ? selectedMoveCopy(selectedMove) : review.summary;
  return (
    <div className="chesscom-coach-row">
      <div className="chesscom-coach-avatar">♟</div>
      <div className="chesscom-speech-bubble">
        <strong>{selectedMove ? text : review.summary}</strong>
        {selectedMove ? <span>{selectedMove.explanation}</span> : null}
      </div>
    </div>
  );
}

function issueToMove(issue: CoachIssue, moves: ReviewedMove[]) {
  return moves.find((move) => move.ply === issue.ply) ?? null;
}

export function CoachReview({ review }: { review: CoachReviewType }) {
  const { activeSkin } = useAuth();
  const [screen, setScreen] = useState<"summary" | "lesson">("summary");
  const [selectedPly, setSelectedPly] = useState(firstTeachingPly(review));
  const [showBest, setShowBest] = useState(true);
  const selectedIndex = Math.max(0, review.reviewedMoves.findIndex((move) => move.ply === selectedPly));
  const selectedMove = review.reviewedMoves[selectedIndex] ?? null;
  const selectedFen = selectedMove?.fenAfter ?? review.reviewedMoves.at(-1)?.fenAfter ?? "start";
  const palette = boardPaletteForSkin(activeSkin);
  const boardSquareStyles = boardStylesForReviewedMove(selectedMove, showBest);
  const wentWell = review.whatWentWell?.length ? review.whatWentWell : ["The engine review completed successfully."];
  const toImprove = review.whatToImprove?.length ? review.whatToImprove : ["Compare the largest engine swing with the recommended move."];
  const mainIssue = review.issues[0] ? issueToMove(review.issues[0], review.reviewedMoves) : review.reviewedMoves[0] ?? null;

  function moveSelection(delta: number) {
    const nextIndex = Math.max(0, Math.min(review.reviewedMoves.length - 1, selectedIndex + delta));
    setSelectedPly(review.reviewedMoves[nextIndex]?.ply ?? selectedPly);
  }

  function resetLesson() {
    setSelectedPly(firstTeachingPly(review));
    setShowBest(true);
  }

  if (screen === "summary") {
    return (
      <section id="coach" className="chesscom-review-shell">
        <header className="chesscom-review-topbar">
          <div>
            <span className="setup-kicker"><BrainCircuit size={14} /> Game Review</span>
            <h2>Отчёт о партии</h2>
          </div>
          <div className="coach-provider-badge">
            {review.provider === "template" ? "Engine facts + deterministic coach" : `Text polish: ${review.provider}`}
          </div>
        </header>

        <CoachBubble review={review} selectedMove={null} />
        <EvaluationGraph points={review.evaluationGraph} />

        <section className="chesscom-player-strip">
          <article>
            <span>White</span>
            <strong>{review.whiteAccuracy}</strong>
            <small>{accuracyTone(review.whiteAccuracy)}</small>
          </article>
          <article className="focus">
            <span>Training priority</span>
            <strong>{review.trainingPriority}</strong>
            <small>{review.result}</small>
          </article>
          <article>
            <span>Black</span>
            <strong>{review.blackAccuracy}</strong>
            <small>{accuracyTone(review.blackAccuracy)}</small>
          </article>
        </section>

        <CompactCountsTable review={review} />

        <div className="chesscom-summary-columns">
          <article className="report-guidance-card">
            <div className="report-guidance-head"><Sparkles size={18} /> Что получилось</div>
            <ul>
              {wentWell.map((point) => (
                <li key={point}><CheckCircle2 size={16} /> <span>{point}</span></li>
              ))}
            </ul>
          </article>

          <article className="report-guidance-card emphasis">
            <div className="report-guidance-head"><Target size={18} /> Что улучшить</div>
            <ul>
              {toImprove.map((point) => (
                <li key={point}><ShieldAlert size={16} /> <span>{point}</span></li>
              ))}
            </ul>
          </article>
        </div>

        <button type="button" className="chesscom-review-cta" onClick={() => {
          if (mainIssue) setSelectedPly(mainIssue.ply);
          setScreen("lesson");
        }}>
          <BookOpen size={20} /> Смотреть отчёт
        </button>
      </section>
    );
  }

  return (
    <section id="coach" className="chesscom-lesson-shell">
      <header className="chesscom-lesson-topbar">
        <button type="button" className="lesson-back-button" onClick={() => setScreen("summary")}><ArrowLeft size={20} /></button>
        <h2>Отчёт о партии</h2>
        <span className="lesson-eval-label">{evalLabel(selectedMove)}</span>
      </header>

      <div className="lesson-eval-meter" aria-label="Evaluation meter">
        <span>{evalLabel(selectedMove)}</span>
        <div><i style={{ width: `${evalMeterPercent(selectedMove)}%` }} /></div>
      </div>

      <CoachBubble review={review} selectedMove={selectedMove} />

      <div className="lesson-board-shell">
        <Chessboard
          options={{
            id: `review-board-${selectedPly}`,
            position: selectedFen,
            allowDragging: false,
            showNotation: true,
            boardStyle: { borderRadius: "0.42rem", overflow: "hidden" },
            darkSquareStyle: { backgroundColor: palette.dark },
            lightSquareStyle: { backgroundColor: palette.light },
            squareStyles: boardSquareStyles,
            pieces: customPiecesForSkin(activeSkin),
          }}
        />
      </div>

      <div className="lesson-move-strip">
        <button type="button" onClick={() => moveSelection(-1)} disabled={selectedIndex <= 0}><ArrowLeft size={24} /></button>
        <div className="lesson-move-carousel">
          {review.reviewedMoves.slice(Math.max(0, selectedIndex - 2), selectedIndex + 3).map((move) => (
            <button
              type="button"
              key={`${move.ply}-${move.uci}`}
              className={selectedPly === move.ply ? "active" : ""}
              onClick={() => setSelectedPly(move.ply)}
            >
              <small>{move.moveNumber}{move.side === "b" ? "…" : "."}</small>
              <strong>{move.san}</strong>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => moveSelection(1)} disabled={selectedIndex >= review.reviewedMoves.length - 1}><ArrowRight size={24} /></button>
      </div>

      <div className="lesson-details-card">
        {selectedMove ? (
          <>
            <span className={labelClass[selectedMove.classification]}>{labelSymbol[selectedMove.classification]} {selectedMove.classification}</span>
            <div className="lesson-detail-grid">
              <div><span>Played</span><strong>{selectedMove.san}</strong></div>
              <div><span>Best</span><strong>{selectedMove.bestMoveSan ?? selectedMove.bestMoveUci ?? "—"}</strong></div>
              <div><span>CP loss</span><strong>{Math.round(selectedMove.centipawnLoss)}</strong></div>
              <div><span>Expected loss</span><strong>{Math.round(selectedMove.expectedScoreLoss * 100)}%</strong></div>
            </div>
            <p>{selectedMove.lesson}</p>
          </>
        ) : null}
      </div>

      <div className="lesson-action-bar">
        <button type="button" onClick={() => setShowBest((value) => !value)}><BadgeCheck size={18} /> {showBest ? "Скрыть лучший" : "Лучший"}</button>
        <button type="button" onClick={resetLesson}><RotateCcw size={18} /> Снова</button>
        <button type="button" className="primary" onClick={() => moveSelection(1)} disabled={selectedIndex >= review.reviewedMoves.length - 1}>
          Далее <ArrowRight size={18} />
        </button>
      </div>

      <div className="report-pattern-card lesson-pattern-card">
        <div className="report-guidance-head"><TrendingUp size={18} /> Strategic summary</div>
        <div className="report-pattern-list">
          {review.patterns.map((pattern) => (
            <div key={pattern} className="pattern-pill"><Gauge size={14} /> {pattern}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
