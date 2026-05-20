import type { Difficulty, EngineEvaluation } from "@/lib/types";
import {
  evaluationFromUciInfo,
  parseBestMove,
  parseUciInfo,
  type ParsedUciInfo,
} from "@/lib/stockfish/uci";

export type StockfishPreset = {
  label: string;
  description: string;
  skillLevel: number;
  limitStrength: boolean;
  approximateElo?: number;
  moveTimeMs: number;
  depth: number;
};

export const STOCKFISH_BOT_PRESETS: Record<Difficulty, StockfishPreset> = {
  easy: {
    label: "Beginner",
    description: "Lower-strength Stockfish settings for a plausible, forgiving opponent.",
    skillLevel: 2,
    limitStrength: true,
    approximateElo: 900,
    moveTimeMs: 220,
    depth: 7,
  },
  medium: {
    label: "Intermediate",
    description: "A steadier bot that punishes loose pieces and basic tactical mistakes.",
    skillLevel: 8,
    limitStrength: true,
    approximateElo: 1400,
    moveTimeMs: 450,
    depth: 10,
  },
  hard: {
    label: "Advanced",
    description: "Stronger Stockfish settings for a much more serious sparring game.",
    skillLevel: 16,
    limitStrength: false,
    moveTimeMs: 850,
    depth: 13,
  },
};

export type StockfishAnalysisOptions = {
  depth?: number;
  moveTimeMs?: number;
  timeoutMs?: number;
};

export type StockfishAnalysisResult = {
  bestMove: string | null;
  evaluation: EngineEvaluation;
  principalVariation: string[];
  depth?: number;
  rawInfoLine?: string;
};

type MessageListener = (line: string) => void;

export class StockfishUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockfishUnavailableError";
  }
}

function normalizeWorkerMessage(data: unknown) {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(String).join(" ");
  return String(data ?? "");
}

function boolToUci(value: boolean) {
  return value ? "true" : "false";
}

export class StockfishClient {
  private worker: Worker | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<MessageListener>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private preset: StockfishPreset | null = null;

  constructor(private readonly workerPath = "/stockfish/stockfish-18-lite-single.js") {}

  private assertBrowser() {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      throw new StockfishUnavailableError("Stockfish requires a browser with Web Worker support.");
    }
  }

  private emit(line: string) {
    this.listeners.forEach((listener) => listener(line));
  }

  private send(command: string) {
    if (!this.worker || this.disposed) {
      throw new StockfishUnavailableError("Stockfish worker is not available.");
    }
    this.worker.postMessage(command);
  }

  private waitFor(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    timeoutMessage: string,
  ) {
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.listeners.delete(onLine);
        reject(new StockfishUnavailableError(timeoutMessage));
      }, timeoutMs);

      const onLine = (line: string) => {
        if (!predicate(line)) return;
        window.clearTimeout(timer);
        this.listeners.delete(onLine);
        resolve(line);
      };

      this.listeners.add(onLine);
    });
  }

  async init() {
    if (this.disposed) {
      throw new StockfishUnavailableError("Stockfish client was disposed.");
    }
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.assertBrowser();
      try {
        this.worker = new Worker(this.workerPath);
      } catch (error) {
        throw new StockfishUnavailableError(
          error instanceof Error
            ? `Unable to create Stockfish worker: ${error.message}`
            : "Unable to create Stockfish worker.",
        );
      }

      this.worker.onmessage = (event: MessageEvent<unknown>) => {
        const line = normalizeWorkerMessage(event.data).trim();
        if (line) this.emit(line);
      };

      this.worker.onerror = (event) => {
        const message = event.message || "Stockfish worker crashed.";
        this.emit(`error ${message}`);
      };

      this.send("uci");
      await this.waitFor((line) => line === "uciok", 12_000, "Stockfish did not finish UCI initialization.");
      this.send("setoption name Hash value 16");
      this.send("setoption name Threads value 1");
      await this.ready();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async ready() {
    this.send("isready");
    await this.waitFor((line) => line === "readyok", 12_000, "Stockfish did not become ready.");
  }

  private enqueue<T>(task: () => Promise<T>) {
    const chained = this.queue.then(task, task);
    this.queue = chained.then(
      () => undefined,
      () => undefined,
    );
    return chained;
  }

  async configurePreset(preset: StockfishPreset) {
    return this.enqueue(async () => {
      await this.init();
      const signature = JSON.stringify(preset);
      if (this.preset && JSON.stringify(this.preset) === signature) return;

      this.send(`setoption name Skill Level value ${preset.skillLevel}`);
      this.send(`setoption name UCI_LimitStrength value ${boolToUci(preset.limitStrength)}`);
      if (preset.approximateElo) {
        // Stockfish ignores unsupported options; the UI intentionally labels these ratings as approximate.
        this.send(`setoption name UCI_Elo value ${preset.approximateElo}`);
      }
      await this.ready();
      this.preset = preset;
    });
  }

  async configureForDifficulty(difficulty: Difficulty) {
    return this.configurePreset(STOCKFISH_BOT_PRESETS[difficulty]);
  }

  async analyzePosition(fen: string, options: StockfishAnalysisOptions = {}) {
    return this.enqueue(async () => {
      await this.init();
      const depth = options.depth ?? 11;
      const moveTimeMs = options.moveTimeMs;
      const timeoutMs = options.timeoutMs ?? Math.max(15_000, (moveTimeMs ?? 0) * 12);

      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      await this.ready();

      let bestMove: string | null = null;
      let latestInfo: ParsedUciInfo | null = null;
      let latestInfoLine: string | undefined;

      const completion = new Promise<StockfishAnalysisResult>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          this.listeners.delete(onLine);
          try {
            this.send("stop");
          } catch {
            // The worker may already be gone.
          }
          reject(new StockfishUnavailableError("Stockfish analysis timed out."));
        }, timeoutMs);

        const onLine = (line: string) => {
          const info = parseUciInfo(line);
          if (info?.scoreType) {
            latestInfo = info;
            latestInfoLine = line;
          }

          const parsedBestMove = parseBestMove(line);
          if (!line.startsWith("bestmove")) return;
          bestMove = parsedBestMove;
          window.clearTimeout(timer);
          this.listeners.delete(onLine);
          resolve({
            bestMove,
            evaluation: evaluationFromUciInfo(latestInfo, fen),
            principalVariation: latestInfo?.pv ?? [],
            depth: latestInfo?.depth,
            rawInfoLine: latestInfoLine,
          });
        };

        this.listeners.add(onLine);
      });

      if (moveTimeMs) {
        this.send(`go movetime ${Math.max(50, Math.round(moveTimeMs))}`);
      } else {
        this.send(`go depth ${Math.max(1, Math.round(depth))}`);
      }

      return completion;
    });
  }

  async getBestMove(fen: string, difficulty: Difficulty) {
    await this.configureForDifficulty(difficulty);
    const preset = STOCKFISH_BOT_PRESETS[difficulty];
    return this.analyzePosition(fen, {
      depth: preset.depth,
      moveTimeMs: preset.moveTimeMs,
      timeoutMs: Math.max(12_000, preset.moveTimeMs * 15),
    });
  }

  dispose() {
    this.disposed = true;
    this.initialized = false;
    this.initPromise = null;
    this.listeners.clear();
    if (this.worker) {
      try {
        this.worker.postMessage("quit");
      } catch {
        // Ignore worker shutdown failures.
      }
      this.worker.terminate();
      this.worker = null;
    }
  }
}
