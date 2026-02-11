# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StudyRoom (studyroom) — a real-time online study room app where users create password-protected rooms, study together with live presence, voice chat (WebRTC), BGM (YouTube), and earn points for study time. The UI is entirely in Japanese.

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
- **Supabase** — Auth (OTP), PostgreSQL (with RLS), Realtime Presence, Broadcast (WebRTC signaling)
- **Tailwind CSS 4** (CSS-first config via `@tailwindcss/postcss`)
- **Resend** — OTP email delivery
- **bcryptjs** — Room password hashing
- **nanoid** — 6-char room code generation

## Architecture

### Path Alias
`@/*` maps to `./src/*`

### Directory Layout
- `src/app/` — Next.js App Router pages and API routes
- `src/hooks/` — All business logic lives in custom hooks (no state management library)
- `src/lib/supabase/` — Supabase client factories (browser `client.ts`, server `server.ts`, `middleware.ts`)
- `src/lib/constants.ts` — Shared constants (point rates, sync intervals)
- `src/components/` — React components (e.g., isometric SVG room visualization)
- `src/types/index.ts` — Shared TypeScript interfaces (User, Room, RoomMember, StudySession)
- `src/middleware.ts` — Route protection (redirects unauthenticated users away from `/dashboard`, `/room/*`)

### Authentication Flow
Passwordless OTP via Supabase Admin API + Resend email:
1. Client → `POST /api/auth/send-otp` → Supabase `generateLink(magiclink)` → extract OTP → Resend sends email
2. Client verifies OTP via `supabase.auth.verifyOtp()`
3. User data stored in both `auth.users` metadata and a `users` table (auto-created by DB trigger)

### Key Hooks Pattern
All real-time and complex logic is encapsulated in hooks:
- `use-auth` — Auth state, OTP send/verify, display name management
- `use-study-timer` — Page Visibility API-based timer with 2s debounce; tracks studying/away state; 1 point per 10 minutes
- `use-room` — Supabase Realtime Presence (syncs every 30s + immediate on status change); uses refs to prevent stale closures
- `use-voice-chat` — WebRTC P2P audio via Supabase Broadcast for signaling (offer/answer/ICE)
- `use-bgm` — YouTube IFrame API player with localStorage persistence
- `use-room-presence` — Dashboard-level presence counts using observer pattern (`_obs_*` prefix keys)

### API Routes
- `POST /api/auth/send-otp` — Generate and email OTP (uses Supabase service role + Resend)
- `POST /api/rooms` — Create room (auth required, generates code, hashes password)
- `POST /api/join` — Verify room code + password

### Database
Supabase PostgreSQL with RLS. Tables: `users`, `rooms`, `study_sessions`, `daily_stats`. A trigger `on_auth_user_created` auto-creates user rows.

### Supabase Client Usage
- **Browser**: `createBrowserClient()` from `@supabase/ssr` — used in hooks and client components
- **Server**: `createServerClient()` with cookie handling — used in API routes and middleware
- **Admin operations** (bypassing RLS): Use `SUPABASE_SERVICE_ROLE_KEY` via `createClient()` from `@supabase/supabase-js`

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only, bypasses RLS)

Resend API key is currently hardcoded in the send-otp route (from address: `studyroom@and-and-and.com`).

## Styling Conventions

- Dark theme with CSS custom properties defined in `globals.css` (midnight/charcoal backgrounds, sage green accent)
- Glassmorphism pattern: backdrop blur + semi-transparent borders (`.glass-card`)
- Fonts: Bricolage Grotesque (display), Noto Sans JP (body), JetBrains Mono (timers/codes)
- Animations defined as CSS keyframes in `globals.css` with stagger utility classes
- The isometric room is a pure SVG component with painter's algorithm depth sorting

## Important Patterns

- **Stale closure prevention**: Hooks use `useRef` + `useEffect` sync pattern for values accessed inside intervals/event listeners (see `use-room.ts`, `use-study-timer.ts`)
- **Supabase Presence observer pattern**: Dashboard tracks room counts without appearing as a member by using `_obs_` prefixed presence keys
- **YouTube IFrame workaround**: Container div is reconstructed before each player creation because the IFrame API replaces the target element
- **OTP length is dynamic**: Server returns `otpLength` and client renders that many input boxes
