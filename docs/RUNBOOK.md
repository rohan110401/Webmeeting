# Runbook

How to set up, run, operate and verify Webmeeting. The design is in [ARCHITECTURE.md](ARCHITECTURE.md).

**Never paste secret values into chat, commits, issues or migrations.** Enter them directly in the Supabase,
LiveKit or Netlify dashboards. The only values that belong in this repo are public: the Supabase project URL and
its publishable key.

| | Value |
|---|---|
| Supabase project | `uvmilaymaearmtzynhjy` (`https://uvmilaymaearmtzynhjy.supabase.co`) |
| Repository | `https://github.com/rohan110401/Webmeeting` |
| Dev server | `http://localhost:5180` |
| Test site | `https://webmeeting-test.netlify.app` (Netlify site `webmeeting-test`; password sign-in for test accounts on) |

---

## 1. Database

Apply the migrations in `supabase/migrations/` **in order**, using any one of:

- **Supabase CLI:**
  1. `npx supabase login`
  2. `npx supabase link --project-ref uvmilaymaearmtzynhjy`
  3. `npx supabase db push`
- **SQL editor:** paste each file, oldest first, and run it.
- **Claude Code with the Supabase connector:** ask it to apply the migrations.

Then:

1. Run `supabase/tests/authorization.sql`, either in the SQL editor or with
   `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql`.
   - It rolls itself back and leaves nothing behind.
   - The last row must read **`authorization tests: all passed`**.
2. Open **Advisors → Security** and check for new warnings.
   - Expected and intentional: `create_session`, `cancel_session` and `end_session` are SECURITY DEFINER functions that signed-in users can call. Each one checks that the caller is a participant before doing anything.

## 2. Authentication

In **Authentication → Sign In / Providers**:

- **Allow new users to sign up: off.** Accounts are created only by you (step 3).
- **Email:** enabled. Set the OTP length to 6 and the OTP expiry to 600 seconds.
- Leave every other provider off.

In **Authentication → Emails → Templates**, edit **Magic Link** so that it contains the code:

```html
<h2>Your sign-in code</h2>
<p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
<p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
```

Use the subject "Your sign-in code". Never put session or notes details in emails.

In **Authentication → Emails → SMTP Settings**, set up custom SMTP. The built-in mailer only delivers to members of your Supabase team and is heavily rate-limited.

- Resend free tier:
  - host `smtp.resend.com`, port `465`;
  - user `resend`, password = a Resend API key;
  - sender e.g. `sign-in@yourdomain`, on a domain verified in Resend.
- In Resend, turn **off** open and click tracking.

In **Authentication → URL Configuration**:

- *Site URL*: the production URL, e.g. `https://meet.yourdomain`.
- *Redirect URLs*: `http://localhost:5180/**`, plus the production URL with `/**` appended.

## 3. People and pairs

Sessions happen between the two members of a **pair**.

1. Create both accounts: **Authentication → Users → Add user → Create new user**.
   - Enter the email and tick *Auto Confirm User*.
   - The password field is optional. Leave it empty for real users, who sign in with emailed codes. Set one only for end-to-end test accounts.
2. Pair them in the SQL editor:

   ```sql
   select private.create_pair('person.one@example.com', 'person.two@example.com', 'Weekly');
   ```

3. Each person signs in, picks the name the other will see, and can then create or join sessions.

To remove someone's access, delete the user under **Authentication → Users**. This deletes their profile, their pair membership and their notes. Sessions they took part in stay, along with the other person's notes.

## 4. Video (LiveKit)

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io). The free *Build* plan is enough for development.
2. Under **Settings → Keys**, create an API key.
3. In Supabase, open **Edge Functions → Secrets** and add:

   | Name | Value |
   |---|---|
   | `LIVEKIT_URL` | the project's `wss://…livekit.cloud` URL |
   | `LIVEKIT_API_KEY` | the API key |
   | `LIVEKIT_API_SECRET` | the API secret |
   | `E2EE_MASTER_SECRET` | *(optional)* overrides the master secret that migration `…143358_e2ee_secret` generates in Vault |
   | `ALLOWED_ORIGINS` | `https://meet.yourdomain` (comma-separate several; `http://localhost:5180` is allowed when this is unset) |

   - The encryption master secret is generated inside the database (Vault, `e2ee_master_secret`), so nobody has to create or handle it. Changing it only affects calls that start afterwards, because nothing encrypted with it is stored.
   - If any LiveKit secret is missing, joining fails with "Video isn't set up yet". The app never falls back to an unencrypted call.
4. Deploy both functions. `supabase/config.toml` already turns off the gateway JWT check, because each function verifies the caller with Supabase Auth itself.

   ```bash
   npx supabase functions deploy video-token
   npx supabase functions deploy session-end
   ```

5. In LiveKit Cloud, leave recording (Egress) unconfigured. The app never asks for it.

## 5. Running locally

```bash
cp .env.example .env.local
```

- Fill in `VITE_SUPABASE_PUBLISHABLE_KEY` from **Project Settings → API Keys** (the publishable or anon key, never the secret or service-role key).
- Then run `npm install` and `npm run dev`, and open http://localhost:5180.
- Dev builds show a "sign in with a password" option for test accounts. Deployed builds include it only when built with `VITE_ALLOW_PASSWORD_SIGNIN=true` (the test site); production builds leave it out.

## 6. Deploying the site (Netlify)

1. Create a Netlify site from the GitHub repo. `netlify.toml` sets the build command, the output folder and SPA routing.
2. Under *Site configuration → Environment variables*, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Add your domain. HTTPS is automatic.
4. Add the production URL to Supabase's redirect URLs and to `ALLOWED_ORIGINS`.
5. `public/_headers` sends the CSP, HSTS and camera/microphone permissions.
   - If you move the database to another Supabase project, update the project URL in its `connect-src`.

## 7. Verification

| Check | Command |
|---|---|
| Web lint, types, unit tests, build | `npm run lint && npm run typecheck && npm test && npm run build` |
| Edge Function tests | `npm run test:functions` |
| Edge Function types and lint | `npm run check:functions` |
| Database authorization | `supabase/tests/authorization.sql` (see §1) |
| End-to-end, two browsers | `npm run e2e` (see below) |

**End-to-end tests** need two paired test accounts that have passwords (§3) and LiveKit configured (§4). The first time, also run `npx playwright install chromium`.

```bash
E2E_USER_A_EMAIL=… E2E_USER_A_PASSWORD=… E2E_USER_B_EMAIL=… E2E_USER_B_PASSWORD=… npm run e2e
```

**Manual check before real use.** Run one 60-minute call that includes:
- a Wi-Fi drop partway through;
- a screen share;
- iOS Safari and Android Chrome on mobile data.

## 8. Operations

**Audit trail** (actions only, never note content):

```sql
select occurred_at, actor_id, action, entity_type, entity_id, metadata
  from audit.events
 order by occurred_at desc
 limit 100;
```

**Backups.**
- The Free plan has no backups and **pauses after 7 days without activity**. A weekly schedule sits right on that edge.
- Before real use, upgrade to Pro ($25/month) for daily backups and no pausing.
- Once a quarter, restore a backup into a scratch project to check it works.

**Rotating secrets.**
- *LiveKit key:* create a new key, update both secrets, then delete the old key. Calls already running continue.
- *E2EE master secret:* update `E2EE_MASTER_SECRET`. New calls use the new key; nothing stored needs re-encrypting.

**Before sensitive use:** see "Hardening" in ARCHITECTURE.md (notes encryption at rest, MFA, Pro plan).
