# Deploy runbook

Docker-based production deployment for dtasks: a `docker compose` stack of two
containers — `app` (the Litestar backend, serving the built frontend as static
files) and `caddy` (reverse proxy, automatic HTTPS via Let's Encrypt). Target:
a single Oracle Cloud "Always Free" VM (upgraded to Pay-As-You-Go to remove
idle-instance reclamation).

This VM may host other unrelated hobby apps later — each would get its own
container plus its own Caddy site block. No action needed now; just keep that
in mind before assuming this compose file owns the whole machine.

## Prerequisites (one-time, on the VM)

- Confirm the Oracle PAYG upgrade has completed (removes Always Free idle
  reclamation risk).
- Install Docker Engine + the `docker compose` plugin.
- Point the deployment domain's DNS `A`/`AAAA` record at the VM's public IP —
  Caddy needs this to succeed at the ACME HTTP-01 challenge on port 80.
- Open inbound ports 80 and 443 in the VM's firewall/security list.

## First deploy

```sh
git clone <repo-url> dtasks && cd dtasks
cp .env.example .env
# edit .env: real DOMAIN, ACME_EMAIL, and a private DTASKS_INVITE_CODE
docker compose build
docker compose up -d
docker compose logs -f app   # confirm "alembic upgrade head" ran, then uvicorn started
```

Open `https://<DOMAIN>` — Caddy obtains a cert automatically on first request.

## Environment variables

| Variable              | Set in                       | Purpose |
| ---------------------- | ----------------------------- | ------- |
| `DOMAIN`               | `.env`                        | Public hostname Caddy requests a cert for and proxies |
| `ACME_EMAIL`           | `.env`                        | Contact email Let's Encrypt associates with the cert |
| `DTASKS_INVITE_CODE`   | `.env`                        | Required on signup; hand this out to beta friends |
| `DTASKS_SECURE_COOKIES`| `docker-compose.yml` (`app`)  | Fixed to `1` — session cookie gets the `Secure` flag |
| `DTASKS_DB_PATH`       | `docker-compose.yml` (`app`)  | Fixed to `/data/dtasks.sqlite`, inside the `dtasks-data` volume |
| `DTASKS_SESSION_DIR`   | `docker-compose.yml` (`app`)  | Fixed to `/data/sessions`, inside the same volume |

`.env` is gitignored — it never gets committed. `DTASKS_DB_PATH`/`DTASKS_SESSION_DIR`
are intentionally hardcoded in `docker-compose.yml` rather than `.env`: they must
point inside the `dtasks-data` volume for persistence to work, so there's no
legitimate reason to override them per-deploy.

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

```sh
docker compose exec app sqlite3 /data/dtasks.sqlite ".backup /data/backup.sqlite"
docker compose cp app:/data/backup.sqlite ./dtasks-backup-$(date +%F).sqlite
docker compose exec app rm /data/backup.sqlite   # don't leave copies inside the volume
```

`.backup` takes a consistent snapshot even while the app is writing to the
live database. Copy the resulting file off the VM (e.g. to your own machine
or object storage) — a backup that lives on the same disk as the original
doesn't protect against disk loss. Put the first two lines in a daily cron job;
the third line and the off-host copy are what make it an actual backup.

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
