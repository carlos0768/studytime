# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StudyMatch — a competitive study endurance platform. Two players start simultaneously. First to leave (tab hidden, giveup, disconnect) loses. Elo-rated. The UI is entirely in Japanese.

Core concept: "Sauna endurance battle" — the site is a "match venue," not something you look at during a match.

## Development Commands

```bash
npm run dev          # Start dev server with Turbopack (port 3000)
npm run build        # Production build
npm run start        # Run production build
npm run lint         # ESLint check
```

No test framework is configured.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** with TypeScript (strict mode)
- **Supabase** — Auth (OTP), PostgreSQL (with RLS), Realtime Presence & Broadcast (matchmaking signaling, heartbeat)
- **Tailwind CSS 4** (CSS-first config via `@tailwindcss/postcss`)
- **Resend** — OTP email delivery
- **Three.js** (react-three-fiber) — Isometric 3D lobby room

## Architecture

### Path Alias
`@/*` maps to `./src/*`

### Directory Layout
- `src/app/` — Next.js App Router pages and API routes
- `src/hooks/` — All business logic lives in custom hooks (no state management library)
- `src/lib/supabase/` — Supabase client factories (browser `client.ts`, server `server.ts`, `middleware.ts`)
- `src/lib/constants.ts` — Match/Elo constants (heartbeat intervals, duration multipliers)
- `src/lib/elo.ts` — Elo rating calculation with duration multiplier
- `src/components/` — React components (isometric 3D room for lobby)
- `src/types/index.ts` — Shared TypeScript interfaces (User, Match, MatchChallenge, LobbyMember, MatchResult)
- `src/middleware.ts` — Route protection (redirects unauthenticated users away from `/lobby`, `/match/*`, `/result/*`, `/stats`)

### Authentication Flow
Passwordless OTP via Supabase Admin API + Resend email:
1. Client → `POST /api/auth/send-otp` → Supabase `generateLink(magiclink)` → extract OTP → Resend sends email
2. Client verifies OTP via `supabase.auth.verifyOtp()`
3. User data stored in both `auth.users` metadata and a `users` table (auto-created by DB trigger)

### Key Hooks
- `use-auth` — Auth state, OTP send/verify, display name management
- `use-lobby` — Supabase Realtime Presence for lobby (syncs every 10s)
- `use-matchmaking` — Supabase Broadcast for challenge/accept/decline/match_start flow
- `use-match` — Match state, heartbeat (5s), opponent disconnect detection (15s timeout), tab visibility → instant loss, sendBeacon for page close
- `use-voice-chat` — WebRTC P2P audio via Supabase Broadcast for signaling

### Pages
- `/` — Landing page (StudyMatch branding)
- `/login`, `/signup` — OTP authentication
- `/lobby` — Isometric 3D room, player list, challenge UI, voice chat
- `/match/[id]` — Pure black screen, "対戦中" text, giveup button only. No timer, no info.
- `/result/[id]` — Win/loss, duration, Elo change, voice chat for post-game
- `/stats` — Elo rating, match history, win rate, total study time

### API Routes
- `POST /api/auth/send-otp` — Generate and email OTP
- `POST /api/matches/start` — Create match record with both players' Elo
- `POST /api/matches/end` — Finalize match (calculate Elo, update stats)
- `GET /api/matches/history` — Match history for current user
- `GET /api/stats` — Current user profile/stats

### Elo Rating System
- Default rating: 1500, K-factor: 32
- Duration multiplier: 0.05 at ≤5min, linear ramp to 1.0 at ≥60min
- Short matches barely affect rating, long matches get full Elo change

### Match Rules
1. Lobby → challenge/accept → simultaneous start
2. Tab hidden = instant loss (no debounce)
3. Giveup button = loss
4. Heartbeat every 5s, opponent timeout at 15s = disconnect loss
5. sendBeacon for page close detection

### Database
Supabase PostgreSQL with RLS. Tables: `users` (with elo_rating, total_wins, total_losses, total_matches, total_study_seconds), `matches`. A trigger `on_auth_user_created` auto-creates user rows.

### Supabase Client Usage
- **Browser**: `createBrowserClient()` from `@supabase/ssr` — used in hooks and client components
- **Server**: `createServerClient()` with cookie handling — used in API routes and middleware
- **Admin operations** (bypassing RLS): Use `SUPABASE_SERVICE_ROLE_KEY` via `createClient()` from `@supabase/supabase-js`

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only, bypasses RLS)
- `RESEND_API_KEY` — Resend API key for OTP emails

## Styling Conventions

- Dark theme with CSS custom properties defined in `globals.css` (midnight/charcoal backgrounds, sage green accent)
- Glassmorphism pattern: backdrop blur + semi-transparent borders (`.glass-card`)
- Fonts: Bricolage Grotesque (display), Noto Sans JP (body), JetBrains Mono (ratings/codes)
- Animations defined as CSS keyframes in `globals.css` with stagger utility classes
- Match page is intentionally pure black — no decoration

## Important Patterns

- **Stale closure prevention**: Hooks use `useRef` + `useEffect` sync pattern for values accessed inside intervals/event listeners
- **Tab visibility = instant loss**: Page Visibility API with no debounce during matches
- **sendBeacon fallback**: For page close during match to ensure loss is recorded
- **Heartbeat via Broadcast**: 5s interval, 15s timeout for opponent disconnect detection
- **OTP length is dynamic**: Server returns `otpLength` and client renders that many input boxes

#ルール
・エラー報告を受け取ったらdoc/error.mdに全て書き込むようにしてください。そして、修正が終わったらそのエラーを解決済みにし、起こった原因と解決法を書き込むようにしてください