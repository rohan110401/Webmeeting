# Webmeeting

Private, end-to-end encrypted video sessions for two people, with **private notes** that only their author can see.

- Video and audio calls, camera and mic controls, screen sharing, and reconnection
- A notes panel beside the call that autosaves (resizable on desktop, a bottom sheet on mobile)
- A history of sessions, each with your own notes
- Email and password sign-in; accounts by invitation only
- Access enforced in the database: someone else's session or note behaves as if it doesn't exist

Built on React and Vite, Supabase (Auth, Postgres with RLS, Edge Functions) and LiveKit.

## Quick start

```bash
npm install
cp .env.example .env.local   # add the Supabase publishable key
npm run dev                  # http://localhost:5180
```

Full setup is in [docs/RUNBOOK.md](docs/RUNBOOK.md): database, auth settings, pairing two people, LiveKit secrets and deployment. The design and security model are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 5180 |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:functions` / `npm run check:functions` | Edge Function tests / type-check and lint (Deno via npx) |
| `npm run e2e` | Two-browser end-to-end test (needs test accounts; see the runbook) |

## Layout

```
src/
  auth/        sign-in state, route guard, profile
  pages/       Login, Home (upcoming + history), NewSession, SessionPage, Settings
  sessions/    session cards, join button and join window
  notes/       autosave engine (+ tests), editor, unload guards
  call/        pre-join check, LiveKit room, video stage, controls
supabase/
  migrations/  schema, then access control (RLS, grants, functions)
  functions/   video-token, session-end (+ Deno tests)
  tests/       authorization.sql: proves who can see what
```
