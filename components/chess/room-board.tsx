"use client";

import Link from "next/link";
import { Chess, type Move, type Square } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Link2,
  Radio,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { createId } from "@/lib/storage";
import { useAuth } from "@/components/auth/auth-provider";
import { boardPaletteForSkin, customPiecesForSkin } from "@/lib/chess/piece-skins";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type RoomSide = "w" | "b";

type SyncPayload = {
  clientId: string;
  pgn?: string;
  from?: string;
  to?: string;
  promotion?: string;
};

function roomStorageKey(roomId: string) {
  return `matemind-room-${roomId}`;
}

function gameStatus(game: Chess) {
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
  if (game.isDraw()) return "Draw";
  if (game.isCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
  return `${game.turn() === "w" ? "White" : "Black"} to move`;
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

export function RoomBoard({ roomId }: { roomId: string }) {
  const { activeSkin } = useAuth();
  const palette = boardPaletteForSkin(activeSkin);
  const gameRef = useRef<Chess | null>(null);
  if (!gameRef.current) gameRef.current = new Chess();
  const game = gameRef.current;
  const clientId = useRef(createId("client"));
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [fen, setFen] = useState(game.fen());
  const [side, setSide] = useState<RoomSide>("w");
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [channelStatus, setChannelStatus] = useState<"offline" | "connecting" | "live">(
    isSupabaseConfigured() ? "connecting" : "offline",
  );
  const [copied, setCopied] = useState(false);

  const history = game.history();
  const verboseHistory = game.history({ verbose: true }) as Move[];
  const lastMove = verboseHistory.at(-1);
  const legalTargets = useMemo(() => {
    if (!selectedSquare) return [] as Square[];
    return (game.moves({ square: selectedSquare, verbose: true }) as Move[]).map(
      (move) => move.to as Square,
    );
  }, [fen, selectedSquare]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selectedSquare) {
      styles[selectedSquare] = { background: "rgba(56, 189, 248, 0.35)" };
    }
    legalTargets.forEach((square) => {
      styles[square] = {
        background:
          "radial-gradient(circle, rgba(52, 211, 153, 0.65) 0%, rgba(52, 211, 153, 0.65) 18%, transparent 20%)",
      };
    });
    if (lastMove) {
      styles[lastMove.from] = {
        ...(styles[lastMove.from] ?? {}),
        boxShadow: "inset 0 0 0 9999px rgba(251, 191, 36, 0.18)",
      };
      styles[lastMove.to] = {
        ...(styles[lastMove.to] ?? {}),
        boxShadow: "inset 0 0 0 9999px rgba(251, 191, 36, 0.22)",
      };
    }
    return styles;
  }, [selectedSquare, legalTargets, lastMove]);

  function syncBoard() {
    setFen(game.fen());
    if (typeof window !== "undefined") {
      window.localStorage.setItem(roomStorageKey(roomId), game.pgn());
    }
  }

  function broadcast(event: "move" | "sync-request" | "sync-state" | "reset", payload: SyncPayload) {
    channelRef.current?.send({
      type: "broadcast",
      event,
      payload,
    });
  }

  function tryLoadPgn(pgn?: string) {
    if (!pgn || pgn === game.pgn()) return;
    try {
      const loaded = new Chess();
      loaded.loadPgn(pgn);
      gameRef.current = loaded;
      setFen(loaded.fen());
    } catch {
      // Ignore invalid sync payloads.
    }
  }

  function canMove() {
    return !game.isGameOver() && game.turn() === side;
  }

  function makeMove(source: string, target: string | null, shouldBroadcast = true) {
    if (!target || source === target || !canMove()) return false;
    let move: Move | null = null;
    try {
      move = game.move({ from: source, to: target, promotion: "q" });
    } catch {
      move = null;
    }
    if (!move) return false;
    setSelectedSquare(null);
    syncBoard();
    if (shouldBroadcast) {
      broadcast("move", {
        clientId: clientId.current,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        pgn: game.pgn(),
      });
    }
    return true;
  }

  function applyRemoteMove(payload: SyncPayload) {
    if (payload.clientId === clientId.current) return;
    if (payload.pgn) {
      tryLoadPgn(payload.pgn);
      return;
    }
    if (!payload.from || !payload.to) return;
    let move: Move | null = null;
    try {
      move = game.move({ from: payload.from, to: payload.to, promotion: payload.promotion ?? "q" });
    } catch {
      move = null;
    }
    if (move) syncBoard();
  }

  function handleSquareClick(square: string) {
    const typedSquare = square as Square;
    if (!canMove()) return;

    if (selectedSquare && makeMove(selectedSquare, typedSquare)) {
      return;
    }

    const piece = game.get(typedSquare);
    if (piece && piece.color === side && piece.color === game.turn()) {
      setSelectedSquare(typedSquare);
    } else {
      setSelectedSquare(null);
    }
  }

  function resetRoom() {
    game.reset();
    setSelectedSquare(null);
    syncBoard();
    broadcast("reset", { clientId: clientId.current, pgn: "" });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(roomStorageKey(roomId));
    if (saved) {
      tryLoadPgn(saved);
    }
  }, [roomId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setChannelStatus("offline");
      return;
    }

    setChannelStatus("connecting");
    const channel = supabase.channel(`matemind-room:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "move" }, ({ payload }) => applyRemoteMove(payload as SyncPayload))
      .on("broadcast", { event: "sync-request" }, ({ payload }) => {
        const sync = payload as SyncPayload;
        if (sync.clientId !== clientId.current && game.history().length > 0) {
          broadcast("sync-state", { clientId: clientId.current, pgn: game.pgn() });
        }
      })
      .on("broadcast", { event: "sync-state" }, ({ payload }) => {
        const sync = payload as SyncPayload;
        if (sync.clientId !== clientId.current) {
          tryLoadPgn(sync.pgn);
        }
      })
      .on("broadcast", { event: "reset" }, ({ payload }) => {
        const sync = payload as SyncPayload;
        if (sync.clientId !== clientId.current) {
          game.reset();
          syncBoard();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannelStatus("live");
          broadcast("sync-request", { clientId: clientId.current });
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const options: ChessboardOptions = {
    id: `room-board-${roomId}`,
    position: fen,
    boardOrientation: side === "w" ? "white" : "black",
    allowDragging: true,
    showNotation: true,
    animationDurationInMs: 180,
    boardStyle: { borderRadius: "0.45rem", overflow: "hidden", touchAction: "none" },
    darkSquareStyle: { backgroundColor: palette.dark },
    lightSquareStyle: { backgroundColor: palette.light },
    pieces: customPiecesForSkin(activeSkin),
    squareStyles,
    canDragPiece: ({ piece }) => canMove() && piece.pieceType[0] === side,
    onPieceDrop: ({ sourceSquare, targetSquare }) => makeMove(sourceSquare, targetSquare),
    onSquareClick: ({ square }) => handleSquareClick(square),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(360px,670px)_1fr]">
      <section className="panel-strong p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="kicker">
              <UsersRound size={14} />
              Room {roomId}
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Private multiplayer room</h1>
            <p className="muted-text mt-3 leading-7">
              Open this page in two browsers, choose opposite colors, and Supabase Realtime will sync moves when environment keys are configured.
            </p>
          </div>
          <span className={channelStatus === "live" ? "badge badge-success" : channelStatus === "connecting" ? "badge badge-warning" : "badge"}>
            <Radio size={14} /> {channelStatus === "live" ? "Realtime live" : channelStatus === "connecting" ? "Connecting" : "Local fallback"}
          </span>
        </div>

        <div className="board-frame mx-auto max-w-[640px]">
          <Chessboard options={options} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={copyInvite} className="button-primary">
            <Copy size={18} /> {copied ? "Copied" : "Copy invite link"}
          </button>
          <button type="button" onClick={resetRoom} className="button-secondary">
            <RotateCcw size={18} /> Reset room
          </button>
          <Link href="/play" className="button-secondary">
            <ArrowLeft size={18} /> Back to Play
          </Link>
        </div>
      </section>

      <aside className="grid gap-6">
        <section className="panel p-5">
          <span className="kicker"><Link2 size={14} /> Room controls</span>
          <h2 className="mt-4 text-2xl font-black tracking-tight">Choose your side</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" className={side === "w" ? "button-primary" : "button-secondary"} onClick={() => setSide("w")}>Play White</button>
            <button type="button" className={side === "b" ? "button-primary" : "button-secondary"} onClick={() => setSide("b")}>Play Black</button>
          </div>
          <div className="panel-muted mt-4 p-4">
            <div className="text-sm font-black">Current state</div>
            <p className="muted-text mt-2 leading-7">{gameStatus(game)}</p>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="kicker">Moves</span>
              <h2 className="mt-4 text-2xl font-black tracking-tight">Room notation</h2>
            </div>
            <span className="badge">{history.length} plies</span>
          </div>
          {history.length === 0 ? (
            <p className="muted-text mt-4 leading-7">White can start the room with the first move.</p>
          ) : (
            <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-white/10">
              <table className="table-shell text-sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>White</th>
                    <th>Black</th>
                  </tr>
                </thead>
                <tbody>
                  {movePairs(history).map((row) => (
                    <tr key={row.moveNumber}>
                      <td>{row.moveNumber}</td>
                      <td className="font-bold">{row.white ?? "—"}</td>
                      <td className="font-bold">{row.black ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
