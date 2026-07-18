#!/usr/bin/env python3
"""Daily SQLite backup + grandfather-father-son retention pruning.

Usage:
    python scripts/backup_db.py                # take today's backup, then prune
    python scripts/backup_db.py --prune-only    # skip the backup step
    python scripts/backup_db.py --dry-run       # report what would happen, change nothing

Cron (daily at 03:00, from the repo root, using the project's venv):
    0 3 * * *  cd /path/to/dtasks && /path/to/venv/bin/python scripts/backup_db.py >> /var/log/dtasks-backup.log 2>&1

systemd timer (place in /etc/systemd/system/):
    # dtasks-backup.service
    [Unit]
    Description=DTasks SQLite backup

    [Service]
    Type=oneshot
    WorkingDirectory=/path/to/dtasks
    ExecStart=/path/to/venv/bin/python scripts/backup_db.py

    # dtasks-backup.timer
    [Unit]
    Description=Run dtasks-backup daily

    [Timer]
    OnCalendar=daily
    Persistent=true

    [Install]
    WantedBy=timers.target

    Then: systemctl enable --now dtasks-backup.timer

In the Docker deployment (see docs/deploy.md), run this via `docker compose
exec app python scripts/backup_db.py` (cron on the host, or a sidecar timer)
so backups land under DTASKS_DB_PATH's directory (inside the persistent
`/data` volume) rather than the container's writable layer.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db import DB_PATH  # noqa: E402

# Existing manual-snapshot convention: jedi_tracker.YYYYMMDD_HHMMSS.sqlite.
# Retention math is derived purely by parsing this filename -- no metadata store.
FILENAME_RE = re.compile(r"^jedi_tracker\.(\d{8}_\d{6})\.sqlite$")
TIMESTAMP_FMT = "%Y%m%d_%H%M%S"

DAILY_RETENTION_DAYS = 30  # keep every backup within this window
WEEKLY_RETENTION_DAYS = 60  # keep one per ISO week between DAILY and this window
# beyond WEEKLY_RETENTION_DAYS: keep one per calendar month


def default_backup_dir() -> Path:
    override = os.environ.get("DTASKS_BACKUP_DIR")
    if override:
        return Path(override)
    return DB_PATH.parent / "db_backups"


def backup_filename(timestamp: dt.datetime) -> str:
    return f"jedi_tracker.{timestamp.strftime(TIMESTAMP_FMT)}.sqlite"


def parse_backup_timestamp(path: Path) -> dt.datetime | None:
    """Extract the snapshot timestamp from a backup filename, or None if not a match."""
    match = FILENAME_RE.match(path.name)
    if match is None:
        return None
    return dt.datetime.strptime(match.group(1), TIMESTAMP_FMT)


def list_backups(backup_dir: Path) -> list[tuple[Path, dt.datetime]]:
    if not backup_dir.exists():
        return []
    backups = []
    for path in backup_dir.glob("jedi_tracker.*.sqlite"):
        timestamp = parse_backup_timestamp(path)
        if timestamp is not None:
            backups.append((path, timestamp))
    return sorted(backups, key=lambda item: item[1])


def create_backup(db_path: Path, backup_dir: Path, now: dt.datetime) -> Path | None:
    """Snapshot `db_path` into `backup_dir` using the SQLite online backup API.

    Idempotent: if a backup already exists for `now`'s date, does nothing and
    returns None instead of creating a second same-day snapshot.
    """
    if not db_path.exists():
        # sqlite3.connect() silently creates an empty file at any path that
        # doesn't exist, which would otherwise turn a misconfigured DB path
        # into a daily stream of empty "successful" backups instead of a
        # loud, obvious failure.
        raise FileNotFoundError(f"Database file not found: {db_path}")

    backup_dir.mkdir(parents=True, exist_ok=True)

    today_prefix = f"jedi_tracker.{now.strftime('%Y%m%d')}_"
    already_have_today = any(path.name.startswith(today_prefix) for path, _ in list_backups(backup_dir))
    if already_have_today:
        return None

    dest = backup_dir / backup_filename(now)
    source_conn = sqlite3.connect(str(db_path))
    try:
        dest_conn = sqlite3.connect(str(dest))
        try:
            source_conn.backup(dest_conn)
        finally:
            dest_conn.close()
    finally:
        source_conn.close()
    return dest


def select_timestamps_to_keep(timestamps: list[dt.datetime], now: dt.datetime) -> set[dt.datetime]:
    """Pure GFS retention decision: which of `timestamps` survive pruning at `now`.

    - age <= 30 days: keep every one (one per day, since create_backup already
      guarantees at most one backup per calendar day)
    - 30 < age <= 60 days: keep only the earliest backup per ISO calendar week
    - age > 60 days: keep only the earliest backup per calendar month

    Pure function of (timestamps, now) -- deterministic and idempotent: running
    it twice with the same inputs (e.g. the same day, unchanged backup set)
    always keeps the same set, so re-running prune never deletes anything new.

    Note: at the 30/31-day and 60/61-day seams, a daily-tier survivor (age 30)
    and that same ISO week/month's weekly-or-monthly survivor (age 31+) can
    both be kept, since the daily branch never registers into weekly_seen /
    monthly_seen. This over-retains by at most one extra file per boundary --
    never under-retains -- and is intentional, not a bug.
    """
    keep: set[dt.datetime] = set()
    weekly_seen: dict[tuple[int, int], dt.datetime] = {}
    monthly_seen: dict[tuple[int, int], dt.datetime] = {}

    for timestamp in sorted(timestamps):
        age_days = (now.date() - timestamp.date()).days
        if age_days <= DAILY_RETENTION_DAYS:
            keep.add(timestamp)
        elif age_days <= WEEKLY_RETENTION_DAYS:
            iso_year, iso_week, _ = timestamp.isocalendar()
            week_key = (iso_year, iso_week)
            if week_key not in weekly_seen:
                weekly_seen[week_key] = timestamp
                keep.add(timestamp)
        else:
            month_key = (timestamp.year, timestamp.month)
            if month_key not in monthly_seen:
                monthly_seen[month_key] = timestamp
                keep.add(timestamp)

    return keep


def prune_backups(backup_dir: Path, now: dt.datetime, dry_run: bool = False) -> list[Path]:
    """Delete backups outside the retention policy. Returns the paths removed (or, in
    --dry-run mode, that would be removed)."""
    backups = list_backups(backup_dir)
    keep = select_timestamps_to_keep([timestamp for _, timestamp in backups], now)

    removed = []
    for path, timestamp in backups:
        if timestamp not in keep:
            removed.append(path)
            if not dry_run:
                path.unlink()
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--db-path", type=Path, default=DB_PATH, help="SQLite file to back up")
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
        help="Directory to write/prune backups in",
    )
    parser.add_argument("--prune-only", action="store_true", help="Skip taking a new backup")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen; don't write or delete",
    )
    args = parser.parse_args()

    backup_dir = args.backup_dir if args.backup_dir is not None else default_backup_dir()
    now = dt.datetime.now()

    if not args.prune_only:
        if args.dry_run:
            print(f"[dry-run] would back up {args.db_path} into {backup_dir}")
        else:
            created = create_backup(args.db_path, backup_dir, now)
            if created is not None:
                print(f"Created backup: {created}")
            else:
                print(f"Backup for {now.date()} already exists; skipping.")

    removed = prune_backups(backup_dir, now, dry_run=args.dry_run)
    verb = "Would delete" if args.dry_run else "Deleted"
    for path in removed:
        print(f"{verb}: {path}")
    if not removed:
        print("No backups pruned.")


if __name__ == "__main__":
    main()
