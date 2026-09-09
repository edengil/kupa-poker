# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`kupa-poker` (README + UI are in Hebrew, RTL) is a **Next.js 14 App Router** app backed by **Supabase**. It tracks a poker group's cashbox. Two entry points:
- `/` — owner app (`components/OwnerApp.jsx` → `components/PokerApp.jsx`). Gated behind login.
- `/g/<slug>` — public read-only view (`components/PublicApp.jsx`), also gated behind login now.

Optional integrations (all no-op without their env vars): WhatsApp bot (`app/api/whatsapp`, `lib/whatsapp.js`), web-push (`lib/push.js`), Vercel cron (`vercel.json`).

### Commands (no lint/test suites exist)
- Dev server: `npm run dev` (http://localhost:3000). The update script already runs `npm install`.
- Production build check: `npm run build`.
- There is **no test script and no ESLint config**. Do not run `next lint` casually — with no config it drops into an interactive ESLint setup prompt. `npm run build` already does Next's type/lint pass.

### The app cannot render anything useful without a Supabase backend
`.env.local` must define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (see `.env.local.example`). The browser Supabase client throws if URL/key are missing. Next only reads `.env.local` at startup — **restart `npm run dev` after editing it**.

### Running a full local backend (Supabase) — not in the update script
This is heavy startup work, so it is intentionally NOT automated. Do it manually when you need end-to-end behavior:
1. Docker must be running (install via the standard cloud DinD steps: fuse-overlayfs storage driver, legacy iptables, then `dockerd`).
2. `supabase start` (CLI already understands `supabase/config.toml`, which is committed). It pulls images the first time.
3. Apply schema: `docker exec -i supabase_db_workspace psql -U postgres -d postgres < supabase/schema.sql`.
4. Put the **JWT** `ANON_KEY` and `SERVICE_ROLE_KEY` printed by `supabase start` into `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY`, with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. Restart the dev server.

### Non-obvious: logging in locally without Google
The only sign-in UI is "Google OAuth", which cannot run against local Supabase. To reach the owner app locally:
- Create a user via the GoTrue admin API (`POST /auth/v1/admin/users` with the service key, `email_confirm:true`).
- Sign that user in and hand the session to the browser client. The browser client is `@supabase/ssr` cookie storage; the cookie name is derived from the URL host: for `127.0.0.1` it is **`sb-127-auth-token`**, value = `base64-` + base64url(JSON session). The simplest reliable way is a throwaway dev-only route handler that calls `supabase.auth.signInWithPassword(...)` on the server client (which writes that cookie for you) and redirects to `/`; delete it before committing.
- Once a session exists, `OwnerApp` auto-creates one `groups` row for the user. The core write path is the **הזנה** (input) tab: type a night summary (e.g. `סיכום פוקר 1.8` + `<name> מגיע/חייב <amount>` lines), press **שמור ערב**; it persists to `groups.data.sessions` (verify with psql).

### Other gotchas
- Realtime broadcast/presence failures are swallowed by design (viewers fall back to polling), so a missing/blocked Realtime service does not block owner-side flows.
- All writes go through a single `groups` row per owner; `lib/store.js` debounces writes (~700ms) and also caches in `localStorage` under `poker:cache:*`. If the DB looks stale after a manual reset, clear site data so the local cache re-syncs.
