import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Crown,
  ShieldCheck,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";

const featureCards = [
  {
    icon: Crown,
    title: "Bots, private room links, and locked setup",
    body: "Pick a Stockfish bot, local match, or shareable friend room link before the first move. Color, coins, and mode stay locked once play begins.",
  },
  {
    icon: BrainCircuit,
    title: "Stockfish-derived Game Review",
    body: "Move quality, best moves, evaluation graph, and accuracy are computed from engine evaluations, then optionally rewritten into coach text.",
  },
  {
    icon: ShieldCheck,
    title: "Profiles, avatars, coins, and honest guest mode",
    body: "Supabase auth powers username/avatar profiles, saves, leaderboard data, and cosmetics. Without keys, local browser storage is clearly labeled.",
  },
  {
    icon: BarChart3,
    title: "Progress, virtual stakes, and cosmetic skins",
    body: "Dashboard, history, leaderboard, and shop all use real saved state. Bot wagers use virtual coins only, and rewards fund piece-skin purchases.",
  },
];

const reviewFacts = [
  "Both players receive an accuracy score.",
  "Key moments include the played move, best move, and engine swing.",
  "Move-by-move replay can reopen reviewed positions on a board.",
  "Chess.com-inspired labels are approximations, not a proprietary clone.",
];

export default function HomePage() {
  return (
    <div className="page-shell py-8 sm:py-12">
      <section className="home-hero panel-strong p-6 sm:p-10">
        <div className="home-hero-grid">
          <div>
            <span className="kicker"><Swords size={14} /> MateMind — Play + Review</span>
            <h1 className="gradient-text mt-5 text-5xl font-black tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              A serious chess MVP, not a toy bot.
            </h1>
            <p className="muted-text mt-5 max-w-[760px] text-lg leading-8">
              Play against Stockfish-powered bot presets, open a private friend room by link, then launch a richer Game Review that explains large swings, accuracy, missed chances, and your next training priority.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/play" className="button-primary">
                <Crown size={18} /> Play bots
              </Link>
              <Link href="/shop" className="button-secondary">
                <Trophy size={18} /> Open skin shop
              </Link>
            </div>
          </div>

          <article className="hero-review-card">
            <div className="hero-review-head">
              <span className="side-kicker"><BrainCircuit size={14} /> Game Review</span>
              <span className="badge badge-success">Engine facts first</span>
            </div>
            <div className="hero-score-strip">
              <div><span>You</span><strong>78</strong></div>
              <div><span>Opponent</span><strong>61</strong></div>
              <div><span>Priority</span><strong>Tactics</strong></div>
            </div>
            <div className="hero-moment-card">
              <span className="badge badge-danger">Blunder</span>
              <h2>Move 19… Qxe4?</h2>
              <p>
                The review surface is built to show engine-backed comparisons: what was played, the recommended continuation, and why the swing mattered.
              </p>
              <div className="hero-best-row"><span>Best line</span><strong>19… Re8</strong></div>
            </div>
          </article>
        </div>
      </section>

      <section className="feature-card-grid mt-6">
        {featureCards.map(({ icon: Icon, title, body }) => (
          <article key={title} className="panel feature-product-card">
            <Icon size={22} />
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="panel p-6 sm:p-8">
          <span className="side-kicker"><BrainCircuit size={14} /> What the review actually contains</span>
          <h2 className="mt-4 text-3xl font-black tracking-tight">Post-game analysis that can be audited</h2>
          <div className="home-fact-list mt-5">
            {reviewFacts.map((fact) => (
              <div key={fact}><ArrowRight size={16} /><span>{fact}</span></div>
            ))}
          </div>
          <Link href="/play" className="button-secondary mt-6">Start a game and review it</Link>
        </article>

        <article className="panel p-6 sm:p-8">
          <span className="side-kicker"><UsersRound size={14} /> Product loop</span>
          <h2 className="mt-4 text-3xl font-black tracking-tight">Play → review → save → customize</h2>
          <div className="home-loop-grid mt-5">
            <div><strong>1</strong><span>Pick a bot and color.</span></div>
            <div><strong>2</strong><span>Play a full legal chess game.</span></div>
            <div><strong>3</strong><span>Open Game Review after the result.</span></div>
            <div><strong>4</strong><span>Spend virtual coins on cosmetic skins.</span></div>
          </div>
          <div className="home-leader-note mt-5">
            <Trophy size={18} />
            <p>The leaderboard, profile avatars, and friend-room sync are Supabase-backed when configured; otherwise MateMind stays explicit about local fallback behavior.</p>
          </div>
        </article>
      </section>
    </div>
  );
}
