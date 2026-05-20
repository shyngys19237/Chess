# MateMind v2 — Chess.com-inspired Play, Review, Rooms, Profile, and Cosmetics

MateMind is a serious Next.js chess MVP built around a full product loop:

1. Choose a bot match, local 2-player game, or a private friend room link.
2. Play a legal chess game with a Stockfish-powered browser bot or another player.
3. Open a Chess.com-inspired Game Review built from engine facts, not fake heuristic scores.
4. Save games/reviews locally as a guest or to Supabase when authenticated.
5. Use profile avatars, a real leaderboard, virtual coins, bot stakes, and a cosmetic piece-skin shop.

The app is explicit about what is fully cloud-backed and what falls back to local browser state when Supabase is not configured.

---

## Headline upgrades in this version

### 1. Better engine-derived Game Review

The review system was rebuilt to address inflated accuracy and misleading summaries. It now combines:

- Stockfish best-move comparison;
- before/after engine evaluations;
- centipawn loss;
- expected-score loss;
- mate-swing penalties;
- missed-conversion checks;
- stricter sanity caps for blunder-heavy games.

This prevents obviously bad games from being described as “precise” or receiving unrealistically elite accuracy.

The report UI is now Chess.com-inspired:

- post-game result modal;
- summary report screen with coach bubble, evaluation graph, accuracies, and move-category counts;
- step-by-step review mode with board, move strip, best-move hints, evaluation meter, and move explanations.

Move labels are **Chess.com-inspired approximations**, not a proprietary clone:

- Brilliant
- Great
- Best
- Excellent
- Good
- Inaccuracy
- Mistake
- Blunder
- Miss

### 2. Stockfish bot and better live game flow

The old homemade evaluator/minimax bot is gone. Bot matches use a browser Stockfish WASM worker:

- `lib/stockfish/stockfish-client.ts`
- `lib/stockfish/uci.ts`
- `public/stockfish/stockfish-18-lite-single.js`
- `public/stockfish/stockfish-18-lite-single.wasm`

Bot presets:

- Beginner
- Intermediate
- Advanced

They are product labels with different strength/movetime settings, not calibrated official Elo ratings.

The live game now supports:

- locked pre-game settings;
- choose White / Black / Random;
- bot thinking state;
- move list;
- resign / rematch / undo / flip;
- safer illegal-move handling;
- separate full-screen review mode after the game.

### 3. Play with a friend by link

`/play` now includes a **Play with Friend** mode:

- create a private room link;
- copy invite URL;
- open room immediately;
- share `/room/[roomId]` with a friend.

The room route uses Supabase Realtime Broadcast when Supabase is configured, with a same-browser local fallback when it is not. This is an MVP room flow, not a tournament-grade online chess service.

### 4. Auth, profiles, and avatars

Supabase email/password auth supports:

- sign up;
- log in;
- sign out;
- session persistence;
- authenticated navbar state;
- username profile;
- guest fallback when env variables are missing.

Profiles add:

- avatar upload/change;
- username editing;
- virtual coin balance;
- active piece skin;
- owned skin count.

Avatar images are stored in the Supabase Storage `avatars` bucket.

### 5. Virtual coins, bot stakes, and skin shop

This is **virtual in-game currency only**, not real money.

Bot matches can be played:

- free, or
- with a chosen virtual coin stake.

Bot stake multipliers:

- Beginner: `x1.5`
- Intermediate: `x2`
- Advanced: `x3`

Settlement model:

- win: net profit based on the selected multiplier;
- draw: no coin change;
- loss: stake is lost.

Stakes are intentionally limited to bot games in this MVP. Friend-room coin wagering is not included to avoid trivial transfer abuse.

The `/shop` page lets users buy and equip cosmetic chess piece skins using coins.

### 6. Mobile usability

Mobile layouts were tightened for real play:

- larger board-first composition;
- responsive action buttons;
- stacked side panels;
- mobile-friendly review layout;
- better touch behavior on the board;
- no review overlay collisions.

---

## Routes

| Route | Purpose |
|---|---|
| `/` | Product home page |
| `/play` | Bot / local / friend-link setup and live play |
| `/room/[roomId]` | Private room route |
| `/history` | Saved games |
| `/games/[id]` | Game detail, final board, stored review |
| `/dashboard` | Saved-game metrics and virtual coin snapshot |
| `/leaderboard` | Real Supabase-backed leaderboard or honest empty state |
| `/shop` | Cosmetic piece-skin store |
| `/profile` | Profile, avatar, username, wallet, active skin |
| `/login` | Email/password login |
| `/signup` | Email/password signup |

---

## Core implementation files

```text
app/
  api/analyze-game/route.ts
  dashboard/page.tsx
  games/[id]/page.tsx
  history/page.tsx
  leaderboard/page.tsx
  login/page.tsx
  page.tsx
  play/page.tsx
  profile/page.tsx
  room/[roomId]/page.tsx
  shop/page.tsx
  signup/page.tsx
components/
  auth/auth-form.tsx
  auth/auth-provider.tsx
  chess/chess-arena.tsx
  chess/room-board.tsx
  coach/coach-review.tsx
  navbar.tsx
  profile/profile-panel.tsx
  shop/shop-panel.tsx
  site-footer.tsx
lib/
  chess/piece-skins.tsx
  chess/review.ts
  data/economy.ts
  data/game-repository.ts
  stockfish/stockfish-client.ts
  stockfish/uci.ts
  storage.ts
  supabase/client.ts
  types.ts
public/
  stockfish/stockfish-18-lite-single.js
  stockfish/stockfish-18-lite-single.wasm
supabase-schema.sql
.env.example
```

---

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 3. Production build

```bash
npm run build
npm run start
```

### 4. Lint

```bash
npm run lint
```

---

## Environment variables

Copy:

```bash
cp .env.example .env.local
```

### Supabase auth + persistence

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Legacy fallback is also accepted:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Optional LLM prose polish

Stockfish decides evaluations, classifications, accuracy, and best moves. These keys only polish structured coach prose.

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

### Optional app URL

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional local-phone development origin whitelist

When opening `next dev` from a phone over your LAN, add your device-host IP/origin here as a comma-separated list:

```bash
NEXT_PUBLIC_DEV_ORIGINS=192.168.5.80
```

Then restart the dev server.

---

## Supabase setup

1. Create a Supabase project.
2. Fill `.env.local`.
3. Run `supabase-schema.sql` in the Supabase SQL editor.
4. Enable Email/Password auth.
5. Start the app and create an account.
6. Upload an avatar from the signup/profile flow.
7. Finish a game and open Game Review.
8. Visit Dashboard, History, Leaderboard, Shop, and Profile.

### Tables / view / RPC

The schema provisions:

- `profiles`
- `games`
- `game_reviews`
- `store_skins`
- `owned_skins`
- `wallet_transactions`
- `multiplayer_rooms`
- `leaderboard` view
- `purchase_skin(...)` RPC
- profile/game/review triggers
- public `avatars` storage bucket plus RLS policies

### Privacy model

- `games` are readable only by their owner.
- `game_reviews` are readable only by their owner.
- wallet transactions are readable only by their owner.
- leaderboard exposes aggregate profile data only.
- avatar files are public assets by design so they can render in the UI.

---

## Game Review mechanics

The browser review pipeline:

1. Replays the PGN with `chess.js`.
2. Evaluates pre-move positions with Stockfish.
3. Captures the Stockfish best move.
4. Evaluates the post-move position.
5. Measures expected-score loss, centipawn loss, and mate-impact flags.
6. Classifies each move.
7. Computes player accuracies with stronger sanity caps.
8. Builds the graph, category counts, key moments, and coaching summaries.
9. Optionally sends already-structured review facts to the text-polish API.

This is designed to be credible and much harder to game than the previous version, but still remains an approximation rather than a byte-for-byte reproduction of Chess.com’s private review formula.

---

## QA scenarios covered

Build/lint/smoke checks run successfully:

- `npm run build`
- `npm run lint`
- production route smoke checks for:
  - `/`
  - `/play`
  - `/login`
  - `/signup`
  - `/profile`
  - `/shop`
  - `/leaderboard`
  - `/dashboard`
  - `/history`
  - `/room/demo-room`

Manual scenarios to verify in browser after setup:

- start as White and confirm the bot responds;
- start as Black and confirm the bot moves first;
- make an intentionally terrible game and confirm accuracy/review do not claim elite play;
- finish a game and open the result modal + full review;
- review UI works on desktop and phone widths;
- create/copy/open a friend room link;
- sign up, change avatar, update username;
- stake virtual coins in a bot match and see wallet settlement;
- buy/equip a cosmetic skin;
- verify cloud history/leaderboard after Supabase setup.
