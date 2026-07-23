# Authentication — design & reference

This document is the source of truth for how authentication works in dtasks
today (§1) and the agreed design for **OAuth social login with Google and
GitHub** (§2), tracked as a beads epic (see `bd search oauth`). Implementation
tasks reference sections of this file by number — keep the numbering stable.

Stack context: Python 3.11+ / Litestar 2 / SQLAlchemy 2 (async) / SQLite +
Alembic on the backend (`backend/`); React 19 + TanStack Router/Query on the
frontend (`frontend/`); single-VM Docker deployment behind Caddy
(`docs/deploy.md`).

---

## 1. Current state: password auth with invite-gated signup

Implemented under epic `dtask-tc7` (2026-07). All code lives in
`backend/app/auth.py` unless noted.

### 1.1 Accounts

- `users` table (`backend/app/models.py`): `id`, `email` (unique, stored
  lowercased), `password_hash`, `created_at`.
- Passwords hashed with **argon2** (`argon2-cffi`, library defaults).
- Signup requires an invite code matched (constant-time) against the
  `DTASKS_INVITE_CODE` env var. Minimum password length 8.
- On signup the user gets starter demo data (`backend/app/seed.py:seed_starter_data`).
- Login verifies against a dummy hash for unknown emails so response timing
  doesn't reveal whether an account exists.

### 1.2 Sessions

- Cookie sessions via Litestar `SessionAuth` + `ServerSideSessionConfig`;
  session payload is `{"user_id": <int>}`, stored server-side in a `FileStore`
  (`DTASKS_SESSION_DIR`, defaults next to the SQLite DB).
- Cookie: 30-day max age, `HttpOnly`, `SameSite=Lax`, `Secure` when
  `DTASKS_SECURE_COOKIES=1` (set in `docker-compose.yml` for prod).
- Everything outside `/api` is public (static SPA files); all `/api/*` routes
  require a session except handlers marked `exclude_from_auth=True`
  (signup, login).

### 1.3 Endpoints

| Method | Path               | Auth | Notes                                        |
| ------ | ------------------ | ---- | -------------------------------------------- |
| POST   | `/api/auth/signup` | none | email + password + invite_code; 201; sets session; 403 bad invite, 409 email exists |
| POST   | `/api/auth/login`  | none | email + password; 200; sets session; 401 generic error |
| POST   | `/api/auth/logout` | yes  | 204; clears session                          |
| GET    | `/api/auth/me`     | yes  | `{id, email}`; the SPA's session probe       |

Signup and login sit behind a rate limit (`DTASKS_AUTH_RATE_LIMIT`/minute,
default 20; tests raise it).

### 1.4 Frontend

- `/welcome` (`frontend/src/views/WelcomeView.tsx`): combined signup/login
  card, mode toggle, localized errors mapped from HTTP status
  (401 → invalid credentials, 403 → invalid invite, 409 → email exists).
- Route guard (`frontend/src/router.tsx`): a pathless `authed` layout route
  calls `/api/auth/me` via `currentUserQueryOptions`; failure redirects to
  `/welcome`; `/welcome` redirects to `/` when already signed in.
- API layer: `frontend/src/api/client.ts` (`ApiError` carries HTTP status),
  hooks `useSignup`/`useLogin`/`useLogout` in `frontend/src/api/hooks.ts`.
- i18n: `frontend/src/i18n/en.json` + `ru.json`, `welcome.*` keys.

### 1.5 Ops

- Password recovery is manual: `scripts/reset_password.py <email>` run on the
  VM (no SMTP in the beta).
- Env vars documented in `docs/deploy.md`; secrets live in a gitignored `.env`
  loaded by `docker-compose.yml` via `env_file`.

---

## 2. Design: OAuth social login (Google + GitHub)

### 2.1 Goals and non-goals

Goals:

- "Continue with Google" / "Continue with GitHub" on `/welcome`, for both
  first-time signup (still invite-gated) and returning login.
- Keep the existing cookie-session model: after a successful OAuth flow the
  backend sets the same `{"user_id": ...}` session; nothing else changes for
  the SPA or the API.
- Password and OAuth can coexist on one account (linked by verified email).

Non-goals (future work, §2.12): account-settings UI for linking/unlinking
providers, setting a password on an OAuth-only account from the UI, more
providers, SMTP-based flows.

### 2.2 Flow choice

**Server-side Authorization Code flow (confidential client).** The Litestar
backend performs the whole exchange; the SPA only navigates
(`window.location.href`) to a backend URL. No provider tokens ever reach the
browser, and provider access tokens are **discarded** after one profile fetch
(never persisted).

- CSRF: random `state` (`secrets.token_urlsafe(32)`), stored server-side in
  the (anonymous) session, single-use, checked on callback.
- **PKCE (S256) for Google** in addition to the client secret. GitHub OAuth
  apps ignore PKCE, so `state` is the protection there.
- This works with `SameSite=Lax` cookies because both the redirect to the
  provider and the callback are top-level GET navigations, so the session
  cookie holding `state` is sent.

Sequence (both providers):

1. SPA navigates to `GET /api/auth/oauth/{provider}/login[?invite_code=...]`.
2. Backend stores `{state, code_verifier?, invite_code?}` in the server-side
   session under an `oauth` key with a created-at timestamp (valid 10 min),
   then 302s to the provider's authorize URL.
3. Provider redirects back to
   `GET /api/auth/oauth/{provider}/callback?code=...&state=...`.
4. Backend validates + pops the stored state, exchanges the code for an access
   token (httpx, server-to-server), fetches the user's profile/verified email,
   applies the account rules (§2.5), sets the session, and 302s to `/` — or to
   `/welcome?oauth_error=<code>` on failure (§2.7).

### 2.3 Library

Plain **httpx** (moved from dev to runtime dependency) — no OAuth client
library. Each provider needs one redirect URL construction, one token POST and
one or two profile GETs, all spelled out in §2.4; an extra dependency
(Authlib) buys little here and has no Litestar integration. We do **not**
validate Google's `id_token` JWT — we don't use it; claims come from the
`userinfo` endpoint over TLS, authenticated by the access token. Dev
dependency **respx** is added for mocking httpx in tests (§2.11).

### 2.4 Provider details

Google (OIDC):

- Authorize: `https://accounts.google.com/o/oauth2/v2/auth` with
  `client_id`, `redirect_uri`, `response_type=code`,
  `scope=openid email profile`, `state`, `code_challenge`,
  `code_challenge_method=S256`.
- Token: POST `https://oauth2.googleapis.com/token` (form-encoded:
  `code`, `client_id`, `client_secret`, `redirect_uri`,
  `grant_type=authorization_code`, `code_verifier`).
- Profile: GET `https://openidconnect.googleapis.com/v1/userinfo` with
  `Authorization: Bearer <access_token>` → `{sub, email, email_verified, ...}`.
  `sub` is the stable account id.

GitHub (OAuth2, not OIDC):

- Authorize: `https://github.com/login/oauth/authorize` with `client_id`,
  `redirect_uri`, `scope=read:user user:email`, `state`.
- Token: POST `https://github.com/login/oauth/access_token` with header
  `Accept: application/json` (form-encoded: `code`, `client_id`,
  `client_secret`, `redirect_uri`).
- Profile: GET `https://api.github.com/user` (`Authorization: Bearer ...`,
  `Accept: application/vnd.github+json`) → `{id, ...}`; `id` (numeric, store
  as string) is the stable account id. Email: GET
  `https://api.github.com/user/emails` → pick the entry with
  `primary && verified`; the `email` field on `/user` is often null and is
  not trusted.

### 2.5 Identity model and account rules

New table `oauth_accounts` (Alembic migration `0004`, SQLite
`batch_alter_table` where needed):

```
oauth_accounts
  id                   INTEGER PK
  user_id              INTEGER NOT NULL FK -> users.id ON DELETE CASCADE, indexed
  provider             VARCHAR(20) NOT NULL      -- "google" | "github"
  provider_account_id  VARCHAR(255) NOT NULL     -- Google sub / GitHub id-as-string
  email                VARCHAR(255) NOT NULL     -- verified email at link time (informational)
  created_at           DATETIME NOT NULL
  UNIQUE (provider, provider_account_id)
```

`users.password_hash` becomes **nullable** — OAuth-only accounts have no
password. We store only id + email from providers (no name/avatar).

Callback decision tree (after fetching profile; `email` = provider-verified
email, lowercased):

1. No verified email available → error `no_verified_email`.
2. `oauth_accounts` row for `(provider, provider_account_id)` exists → log
   that user in. Done. (Invite code, if present, is ignored.)
3. A `users` row with this email exists → **auto-link**: insert the
   `oauth_accounts` row, log the user in. Safe because both providers assert
   the email is verified; this is the standard trade-off, accepted for the
   beta.
4. No user → this is a signup: require a valid invite code from the stored
   OAuth session state (missing → `invite_required`, wrong →
   `invalid_invite`). Create the user (`password_hash=NULL`), insert the
   `oauth_accounts` row, seed starter data (same as password signup), log in.
   The `users.email` unique constraint resolves races.

### 2.6 New/changed endpoints

| Method | Path                                   | Auth | Behaviour |
| ------ | -------------------------------------- | ---- | --------- |
| GET    | `/api/auth/oauth/{provider}/login`     | none | Optional `invite_code` query param. 404 for unknown/unconfigured provider. 302 to provider authorize URL. Rate-limited (same config as signup/login). |
| GET    | `/api/auth/oauth/{provider}/callback`  | none | Validates state, runs §2.5, 302 to `/` on success or `/welcome?oauth_error=<code>` on failure. Rate-limited. |
| GET    | `/api/auth/providers`                  | none | `{"google": bool, "github": bool}` — whether each provider's env creds are set. The SPA uses this to decide which buttons to render. |

Changed: `POST /api/auth/login` must treat a user whose `password_hash` is
NULL exactly like an unknown email (verify against the dummy hash, return the
same generic 401) — no account-existence or auth-method leak.

`scripts/reset_password.py` keeps working unchanged and doubles as the manual
way to give an OAuth-only account a password.

### 2.7 Error codes on `/welcome?oauth_error=`

`invite_required`, `invalid_invite`, `no_verified_email`, `state_mismatch`,
`provider_error` (any provider-side failure: user denied consent, token
exchange failed, profile fetch failed). Each gets a localized message (§2.9);
unknown codes fall back to a generic message.

### 2.8 Configuration

| Env var                      | Where               | Meaning |
| ---------------------------- | ------------------- | ------- |
| `DTASKS_GOOGLE_CLIENT_ID` / `DTASKS_GOOGLE_CLIENT_SECRET` | `.env` | Google OAuth client. Unset ⇒ Google disabled (button hidden, endpoints 404). |
| `DTASKS_GITHUB_CLIENT_ID` / `DTASKS_GITHUB_CLIENT_SECRET` | `.env` | Same for GitHub. |
| `DTASKS_PUBLIC_URL`          | compose: `https://${DOMAIN}`; dev default `http://localhost:5173` | External origin used to build `redirect_uri = {PUBLIC_URL}/api/auth/oauth/{provider}/callback`. |

Dev: the Vite dev server (`:5173`) proxies `/api` to the backend (`:8010`), so
the dev redirect URI is `http://localhost:5173/api/auth/oauth/{provider}/callback`
and the whole flow stays same-origin. Register **separate dev and prod OAuth
apps** per provider — a GitHub OAuth app allows only one callback URL.

### 2.9 Frontend

`WelcomeView.tsx`:

- Below the submit button: an "or" divider, then "Continue with Google" /
  "Continue with GitHub" buttons (inline SVG marks), rendered only for
  providers enabled per `/api/auth/providers` (new hook `useAuthProviders`).
- Login mode: buttons navigate via
  `window.location.href = '/api/auth/oauth/<p>/login'`.
- Signup mode: invite code must be non-empty first (client-side check with a
  localized inline error); then navigate with
  `?invite_code=<encodeURIComponent(...)>`.
- On mount, read `oauth_error` from the URL query (TanStack Router search
  params), show the localized banner in the existing error slot, and strip the
  param from the URL.
- New i18n keys in both `en.json` and `ru.json`:
  `welcome.continueWithGoogle`, `welcome.continueWithGithub`, `welcome.or`,
  `welcome.inviteRequiredForOauth`, `welcome.errors.oauth.<each §2.7 code>`.

### 2.10 Security notes

- Provider tokens are never stored (memory only, per-request).
- No `next`/return-URL parameter — success always redirects to `/`, failure
  to `/welcome?oauth_error=...`; no open-redirect surface.
- `state` is single-use and expires after 10 minutes; both OAuth endpoints sit
  behind the existing auth rate limit.
- Only provider-verified emails are trusted (Google `email_verified`, GitHub
  `primary && verified`), for both auto-linking and account creation.
- Generic 401 on password login regardless of whether the account is
  OAuth-only, unknown, or has a wrong password.

### 2.11 Testing

Backend (`backend/tests/test_oauth.py`, mock provider HTTP with **respx**;
follow `conftest.py` patterns — env vars are read at import time):

- login redirect: 302 with correct authorize URL/params; state + verifier land
  in the session; 404 when provider unconfigured or unknown.
- callback: wrong/missing/expired state → `state_mismatch`; provider error
  param → `provider_error`; unverified email → `no_verified_email`.
- §2.5 paths: existing identity logs in; verified-email match auto-links
  (row created, no duplicate user); new user with valid invite is created,
  seeded, logged in; missing/wrong invite → respective errors; state is
  single-use (replay fails).
- password login with an OAuth-only account → generic 401.
- GitHub email selection: primary-but-unverified rejected; verified primary
  chosen over others.

Frontend (`WelcomeView.test.tsx` + hook tests): buttons render per providers
response; signup-mode click without invite shows inline error and does not
navigate; `oauth_error` param renders the right message in both languages.

### 2.12 Future work

Account settings page (list linked providers, link/unlink, set/change
password), password reset via email once SMTP exists, further providers.
