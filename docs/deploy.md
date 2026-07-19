# Deploy runbook

Docker-based production deployment for dtasks: a single-container
`docker compose` stack — `app` (the Litestar backend, serving the built
frontend as static files). HTTPS termination and reverse proxying live in the
shared edge stack from the [dinfra repo](https://github.com/evgenii-prusov/dinfra):
one Caddy container owning ports 80/443 for every app on this VM. The dtasks
app publishes no ports — it joins the external docker network `web` under the
alias `dtasks-app`, and dinfra's Caddyfile routes the domain to it. Target:
a single Oracle Cloud "Always Free" VM (upgraded to Pay-As-You-Go to remove
idle-instance reclamation), shared with other hobby apps (dcash/dengi.dev).

## Prerequisites (one-time, on the VM)

- Confirm the Oracle PAYG upgrade has completed (removes Always Free idle
  reclamation risk).
- Install Docker Engine + the `docker compose` plugin.
- Point the deployment domain's DNS `A`/`AAAA` record at the VM's public IP —
  Caddy needs this to succeed at the ACME HTTP-01 challenge on port 80.
- Open inbound ports 80 and 443 in the VM's firewall/security list.
- The **dinfra edge stack** must be up and routing this domain (see the
  [dinfra README](https://github.com/evgenii-prusov/dinfra)): once per VM
  `docker network create web`, then `~/dinfra` with a site block for this
  domain in its Caddyfile.

## First deploy

```sh
git clone <repo-url> dtasks && cd dtasks
cp .env.example .env
# edit .env: real DOMAIN and a private DTASKS_INVITE_CODE
docker compose build
docker compose up -d
docker compose logs -f app   # confirm "alembic upgrade head" ran, then uvicorn started
```

Open `https://<DOMAIN>` — TLS certificates are handled by the dinfra edge
(it obtains one automatically the first time the site block is up).

## Environment variables

| Variable              | Set in                       | Purpose |
| ---------------------- | ----------------------------- | ------- |
| `DOMAIN`               | `.env`                        | Public hostname — builds `DTASKS_PUBLIC_URL`; cert + proxying for it are configured in dinfra |
| `DTASKS_INVITE_CODE`   | `.env`                        | Required on signup; hand this out to beta friends |
| `DTASKS_SECURE_COOKIES`| `docker-compose.yml` (`app`)  | Fixed to `1` — session cookie gets the `Secure` flag |
| `DTASKS_DB_PATH`       | `docker-compose.yml` (`app`)  | Fixed to `/data/dtasks.sqlite`, inside the `dtasks-data` volume |
| `DTASKS_SESSION_DIR`   | `docker-compose.yml` (`app`)  | Fixed to `/data/sessions`, inside the same volume |
| `DTASKS_PUBLIC_URL`    | `docker-compose.yml` (`app`)  | Fixed to `https://${DOMAIN}` — external origin used to build OAuth callback URLs |
| `DTASKS_GOOGLE_CLIENT_ID` / `DTASKS_GOOGLE_CLIENT_SECRET` | `.env` | Google OAuth client credentials; unset disables the Google login button |
| `DTASKS_GITHUB_CLIENT_ID` / `DTASKS_GITHUB_CLIENT_SECRET` | `.env` | GitHub OAuth app credentials; unset disables the GitHub login button |

`.env` is gitignored — it never gets committed. `DTASKS_DB_PATH`/`DTASKS_SESSION_DIR`
are intentionally hardcoded in `docker-compose.yml` rather than `.env`: they must
point inside the `dtasks-data` volume for persistence to work, so there's no
legitimate reason to override them per-deploy.

## OAuth providers

Google and GitHub login are each optional and independent: leaving a
provider's client ID/secret pair unset in `.env` disables that provider's
"Continue with ..." button and 404s its endpoints (see `docs/auth.md` §2.8).
Set up whichever ones you want.

**Register separate dev and prod OAuth apps for each provider.** A GitHub
OAuth app allows exactly one callback URL, so a single app can't serve both
`localhost` and your production domain — Google apps can technically hold
multiple redirect URIs, but keeping dev and prod apps separate avoids
surprises and is what this runbook assumes.

Callback URLs you'll need:

- **Prod**: `https://<DOMAIN>/api/auth/oauth/google/callback` and
  `https://<DOMAIN>/api/auth/oauth/github/callback` (substitute your real
  `DOMAIN`).
- **Dev**: `http://localhost:5173/api/auth/oauth/google/callback` and
  `http://localhost:5173/api/auth/oauth/github/callback` — the Vite dev
  server on `:5173` proxies `/api` to the backend, so the callback stays
  same-origin even though the backend itself runs on `:8000`.

### Google

1. Go to the [Google Cloud Console](https://console.cloud.google.com/),
   create (or pick) a project, then **APIs & Services → OAuth consent
   screen**. Configure it with scopes `openid`, `email`, and `profile`
   (these are the only scopes dtasks requests).
2. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**, application type **Web application**.
3. Under **Authorized redirect URIs**, add the callback URL for this app
   (the prod URL above for your prod app, the dev URL for your dev app).
4. Save, then copy the generated **Client ID** and **Client secret** into
   `.env` as `DTASKS_GOOGLE_CLIENT_ID` / `DTASKS_GOOGLE_CLIENT_SECRET`.

### GitHub

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**
   (under your GitHub account, or an org's settings if you want the app
   owned by the org).
2. Fill in an application name and homepage URL (e.g. `https://<DOMAIN>`
   for prod, `http://localhost:5173` for dev).
3. Set **Authorization callback URL** to the callback URL for this app (the
   prod or dev URL above — GitHub only accepts one, which is why dev and
   prod need separate apps).
4. Register the app, then **Generate a new client secret**. Copy the
   **Client ID** and the generated secret into `.env` as
   `DTASKS_GITHUB_CLIENT_ID` / `DTASKS_GITHUB_CLIENT_SECRET`.

After editing `.env`, run `docker compose up -d` to pick up the new values
(no rebuild needed — they're plain env vars).

## Migrations

`docker-entrypoint.sh` runs `alembic upgrade head` before starting uvicorn on
every container start. A fresh volume gets migrated from scratch; an existing
one is brought forward from whatever revision it's on. There is no manual
migration step — `docker compose up -d` (or a restart) is sufficient.

## Password reset

The beta has no email/SMTP, so a stuck friend needs an operator to run this
against the live container:

```sh
docker compose exec app python /app/scripts/reset_password.py <email>
# prompts for a new password (hidden input), twice to confirm
```

This edits the user row directly in `/data/dtasks.sqlite` inside the running
container — no restart needed.

## Backup

`scripts/backup_db.py` automates daily backups with tiered (grandfather-father-son)
retention, using the SQLite online backup API (`sqlite3.Connection.backup()` —
never a plain file copy, which can capture a torn state mid-write):

- backups from the last 30 days are all kept (one per day)
- 30 days–~2 months old: kept down to one per week
- older than ~2 months: kept down to one per month

It writes/prunes `dtasks.YYYYMMDD_HHMMSS.sqlite` files under
`DTASKS_DB_PATH`'s directory (override with `--backup-dir` or `DTASKS_BACKUP_DIR`)
— in the Docker deployment that's inside the persistent `/data` volume, not the
container's writable layer. Running it twice in the same day is a no-op for the
backup step (idempotent) and pruning never re-deletes or double-deletes.

Run it daily inside the container, e.g. via a host cron job:

```sh
0 3 * * *  cd /path/to/dtasks && docker compose exec -T app python /app/scripts/backup_db.py >> /var/log/dtasks-backup.log 2>&1
```

(See the docstring at the top of `scripts/backup_db.py` for the bare-host cron
line and a systemd timer unit, if not running under Docker.) `--dry-run` reports
what a run would do without touching anything; `--prune-only` re-runs just the
retention pass.

Backups still live on the same volume as the live DB, so also periodically copy
one off the VM (e.g. to your own machine or object storage) — a backup on the
same disk as the original doesn't protect against disk loss:

```sh
docker compose cp app:/data/db_backups/dtasks.20260718_030000.sqlite ./
```

## Restore

```sh
docker compose stop app
docker compose cp ./dtasks-backup-2026-07-01.sqlite app:/data/dtasks.sqlite
docker compose start app
```

Stop the app before overwriting the live DB file — restoring into a file the
app has open for writes risks corruption. Session data is not backed up by
this procedure (`/data/sessions` is untouched), so a restore logs everyone out;
that's expected and harmless — they just log back in.

## Invite codes

`DTASKS_INVITE_CODE` in `.env` is checked verbatim against the `invite_code`
field on `POST /api/auth/signup`. Hand the current value to a beta friend
directly (e.g. in a DM); there's no invite-tracking or per-user codes. Rotate
it by editing `.env` and running `docker compose up -d` (existing sessions are
unaffected; only future signups need the new code).
