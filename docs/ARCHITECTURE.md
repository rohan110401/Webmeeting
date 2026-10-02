# Architecture

Private video sessions between two people. Each person keeps their own notes for every session, and those notes are visible to no one else.

## Shape

```
Browser (React SPA on Netlify, HTTPS)
  ├─ Supabase Auth ─────── email 6-digit code → JWT        (sign-up disabled; accounts by invitation)
  ├─ Supabase Postgres ─── sessions, participants, notes   (RLS: you only ever see your own rows)
  │     ▲ save_note()  debounced autosave
  ├─ Edge Function video-token
  │     verifies JWT → participant + join window → 10-min LiveKit token + per-session E2EE key
  ├─ Edge Function session-end
  │     ends the session as the caller → closes the LiveKit room (both disconnected)
  └─ LiveKit Cloud ─────── WebRTC audio/video/screen, end-to-end encrypted, max 2 per room
```

| Concern | Choice |
|---|---|
| Frontend | Vite, React 18, TypeScript, Tailwind, react-router 7 (data router), TanStack Query |
| Video | LiveKit Cloud (`livekit-client` and `@livekit/components-react` hooks with a custom UI), lazy-loaded on the call route |
| Backend | Supabase: Postgres with RLS and SQL functions, plus two Deno Edge Functions |
| Auth | Supabase email OTP code, passwordless, with sign-up disabled |
| Hosting | Netlify static site; `_headers` sets the CSP, HSTS and Permissions-Policy |

## Data model

```
auth.users ─1:1─ profiles (display_name, timezone)
auth.users ─*:*─ pairs        via pair_members   (max 2 per pair, enforced by trigger)
pairs ─1:*─ sessions (scheduled_at, duration, status, video_room_name*)
sessions ─1:*─ session_participants              (copied from the pair at creation)
session_participants ─1:0..1─ session_notes       (one per person per session; FK guarantees author ∈ participants)
audit.events                                      (append-only; never exposed to the API)
```

\* `video_room_name` is random and is never granted to API roles.

## Who can see what

| Data | You | The other person | Anyone else |
|---|---|---|---|
| Your session (time, status, participants) | yes | yes | no; behaves as "not found" |
| Your notes | read and write | **never** | never |
| Your display name | yes | yes | no |
| Room name, LiveKit secret, E2EE master secret | no | no | no |

How this is enforced:

1. **Identity comes from the verified JWT** (`auth.uid()`). An ID sent by the browser is only ever a lookup key.
2. **RLS on every table, deny by default, with grants column by column.**
   - `session_notes` policies match only `author_id = auth.uid()`.
   - No policy for any command matches another person's note, and there is no DELETE.
   - The API can insert only `(session_id, content)`, so it cannot even name an author.
3. **Schema constraint:** a composite foreign key from `session_notes(session_id, author_id)` to `session_participants` makes a note in someone else's session impossible to store.
4. **Writes go through SQL functions** that check participation first (`create_session`, `cancel_session`, `end_session`, `save_note`).
5. **Not yours and doesn't exist look the same** everywhere: 404 from functions, `null` from `get_session`. Session IDs are random UUIDs.
6. **Tests prove it:** `supabase/tests/authorization.sql` impersonates two pairs and checks every table and function in both directions.

## Video security

- **Joining:** `video-token` checks the JWT, that the caller is a participant, the session status, and the window (from 15 min before the start to 60 min after the planned end).
  - It creates the room with **`maxParticipants: 2`**.
  - It returns a 10-minute token for exactly that room. The identity is the user ID, with no name or email.
  - The token allows camera, microphone and screen share only: no data channel, admin or recording.
- **E2EE:** the key is `HMAC-SHA256(E2EE_MASTER_SECRET, session_id)`. It is handed only to verified participants and used with LiveKit's `ExternalE2EEKeyProvider`.
  - LiveKit relays only encrypted frames.
  - Calls fail closed: there is no unencrypted fallback.
- **Rejoining from a second device** replaces the first connection (LiveKit's duplicate-identity rule), so one person can never take both places.
- **End session** marks the session ended and deletes the room. After that, no token is issued.
- **Transport:** DTLS-SRTP media and `wss://` signaling, behind an HTTPS-only site with HSTS. The CSP limits connections to the Supabase project and `*.livekit.cloud`.

## Notes autosave

Implemented in `src/notes/autosave.ts`, with unit tests in `autosave.test.ts`.

- **When it saves:**
  - 1.5 s after typing stops, and at least every 10 s while typing continues;
  - immediately on blur, Leave or End, and when the tab is hidden;
  - a keepalive request on `pagehide`.
- **One request at a time.** Edits made during a save are saved right after it.
- **Failures** retry with backoff (1 s up to 30 s) and immediately on `online`. The text stays in memory.
- **Optimistic version check:** two tabs never silently overwrite each other. The UI offers "keep this version" or "use the other version".
- **Warnings:** a `beforeunload` warning appears only while unsaved. An in-app navigation guard appears only while saving is impossible.
- **Nothing is stored in localStorage**, so no note text lingers on shared devices.

## Hardening (before sensitive use)

- **Encrypt notes at rest at the application level.** Today, the database operator can read notes in plaintext; RLS protects them only from other users.
  - Move `save_note`/`myNote` behind an Edge Function that applies AES-256-GCM with a versioned key from function secrets.
  - Bind the ciphertext to `session_id:author_id` as associated data.
  - The database and backups would then hold only ciphertext.
- **Supabase Pro** for backups and no auto-pause.
- **TOTP MFA** (Supabase Auth supports it for free).
- **Retention policy** and a privacy notice, considering India's DPDP Act.

## Growing later

| Feature | Approach |
|---|---|
| More participants | Drop the pair-size trigger (pairs → groups) and raise `maxParticipants`; grid layout |
| Text chat | LiveKit data channel (ephemeral), or a `session_messages` table with Realtime private channels |
| Recording / transcription | LiveKit Egress or Agents. This conflicts with E2EE: it needs a bot holding the key, plus explicit consent |
| AI summaries | Claude API over a transcript and your own notes, stored like notes (private, per person) |
| Reminders / calendar | pg_cron → Edge Function → email outbox; `.ics` attachments |
| Mobile app | PWA first; then React Native with LiveKit's RN SDK and the same backend |
