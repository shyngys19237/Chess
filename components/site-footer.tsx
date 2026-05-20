import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="page-shell site-footer py-8">
      <div className="footer-inner">
        <div>
          <strong>MateMind</strong>
          <p>Stockfish-powered play, engine-derived Game Review, and honest cloud/guest persistence.</p>
        </div>
        <div className="footer-links">
          <Link href="/play">Play</Link>
          <Link href="/history">History</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/leaderboard">Leaderboard</Link>
        </div>
      </div>
    </footer>
  );
}
