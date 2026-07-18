from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.backup_db import (  # noqa: E402
    backup_filename,
    create_backup,
    list_backups,
    parse_backup_timestamp,
    prune_backups,
    select_timestamps_to_keep,
)

NOW = dt.datetime(2026, 7, 18, 3, 0, 0)


def ts(days_ago: int, hour: int = 12) -> dt.datetime:
    """A synthetic backup timestamp `days_ago` days before NOW."""
    return (NOW - dt.timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0, microsecond=0)


def test_parse_backup_timestamp_round_trips_with_backup_filename() -> None:
    timestamp = dt.datetime(2026, 7, 13, 22, 44, 32)
    name = backup_filename(timestamp)
    assert name == "jedi_tracker.20260713_224432.sqlite"
    assert parse_backup_timestamp(Path(name)) == timestamp


def test_parse_backup_timestamp_ignores_unrelated_files() -> None:
    assert parse_backup_timestamp(Path("jedi_tracker.sqlite")) is None
    assert parse_backup_timestamp(Path("notes.txt")) is None
    assert parse_backup_timestamp(Path("jedi_tracker.2026-07-13.sqlite")) is None


def test_keep_all_backups_within_daily_window() -> None:
    timestamps = [ts(0), ts(5), ts(15), ts(30)]
    kept = select_timestamps_to_keep(timestamps, NOW)
    assert kept == set(timestamps)


def test_weekly_bucket_keeps_one_per_iso_week() -> None:
    # Three backups landing in the same ISO week (25), all 31-59 days old.
    same_week = [ts(31), ts(32), ts(33)]
    kept = select_timestamps_to_keep(same_week, NOW)
    assert len(kept) == 1
    # The earliest (chronologically first) survivor is kept.
    assert min(same_week) in kept


def test_weekly_bucket_keeps_one_per_distinct_week() -> None:
    timestamps = [ts(31), ts(38), ts(45), ts(52)]
    # Each is roughly a week apart -> distinct ISO weeks -> all survive.
    kept = select_timestamps_to_keep(timestamps, NOW)
    assert len(kept) == len(timestamps)


def test_monthly_bucket_keeps_one_per_calendar_month() -> None:
    # Several backups older than ~2 months, spread across two different months.
    old_month_a = [
        dt.datetime(2026, 3, 5, 12, 0, 0),
        dt.datetime(2026, 3, 20, 12, 0, 0),
    ]
    old_month_b = [dt.datetime(2026, 4, 10, 12, 0, 0)]
    kept = select_timestamps_to_keep(old_month_a + old_month_b, NOW)
    assert len(kept) == 2
    assert dt.datetime(2026, 3, 5, 12, 0, 0) in kept  # earliest in March survives
    assert dt.datetime(2026, 4, 10, 12, 0, 0) in kept


def test_full_gfs_mix_across_all_three_tiers() -> None:
    daily = [ts(0), ts(10), ts(30)]
    weekly_same_week = [ts(31), ts(32)]  # only one should survive
    weekly_other_week = [ts(50)]
    monthly = [dt.datetime(2026, 1, 3, 9, 0, 0), dt.datetime(2026, 1, 20, 9, 0, 0)]

    kept = select_timestamps_to_keep(daily + weekly_same_week + weekly_other_week + monthly, NOW)

    assert set(daily) <= kept
    assert len(kept & set(weekly_same_week)) == 1
    assert set(weekly_other_week) <= kept
    assert len(kept & set(monthly)) == 1


def test_retention_boundaries_are_inclusive_at_30_and_60_days() -> None:
    # age == 30 -> still daily tier (kept unconditionally).
    # age == 61 -> already monthly tier alongside a same-month peer.
    boundary_daily = ts(30)
    same_month_pair = [ts(61), ts(62)]
    kept = select_timestamps_to_keep([boundary_daily, *same_month_pair], NOW)
    assert boundary_daily in kept
    assert len(kept & set(same_month_pair)) == 1


def test_prune_backups_deletes_files_outside_retention(tmp_path: Path) -> None:
    backup_dir = tmp_path / "db_backups"
    backup_dir.mkdir()

    keep_ts = ts(0)
    same_week = [ts(31), ts(33)]
    for timestamp in [keep_ts, *same_week]:
        (backup_dir / backup_filename(timestamp)).write_bytes(b"fake-sqlite")

    removed = prune_backups(backup_dir, NOW)

    assert len(removed) == 1
    remaining = {p.name for p, _ in list_backups(backup_dir)}
    assert backup_filename(keep_ts) in remaining
    assert len(remaining) == 2


def test_prune_backups_is_idempotent(tmp_path: Path) -> None:
    backup_dir = tmp_path / "db_backups"
    backup_dir.mkdir()
    for timestamp in [ts(0), ts(31), ts(33), ts(90)]:
        (backup_dir / backup_filename(timestamp)).write_bytes(b"fake-sqlite")

    first_pass = prune_backups(backup_dir, NOW)
    assert len(first_pass) > 0

    second_pass = prune_backups(backup_dir, NOW)
    assert second_pass == []


def test_create_backup_skips_if_todays_backup_already_exists(tmp_path: Path) -> None:
    db_path = tmp_path / "jedi_tracker.sqlite"
    _make_real_sqlite_db(db_path)
    backup_dir = tmp_path / "db_backups"

    first = create_backup(db_path, backup_dir, NOW)
    assert first is not None
    assert first.exists()

    later_same_day = NOW.replace(hour=23, minute=59)
    second = create_backup(db_path, backup_dir, later_same_day)
    assert second is None
    assert len(list_backups(backup_dir)) == 1


def test_create_backup_produces_a_valid_sqlite_file(tmp_path: Path) -> None:
    import sqlite3

    db_path = tmp_path / "jedi_tracker.sqlite"
    _make_real_sqlite_db(db_path)
    backup_dir = tmp_path / "db_backups"

    dest = create_backup(db_path, backup_dir, NOW)
    assert dest is not None

    conn = sqlite3.connect(str(dest))
    try:
        rows = conn.execute("SELECT value FROM kv WHERE key = 'greeting'").fetchall()
        assert rows == [("hello",)]
        assert conn.execute("PRAGMA integrity_check;").fetchone() == ("ok",)
    finally:
        conn.close()


def _make_real_sqlite_db(path: Path) -> None:
    import sqlite3

    conn = sqlite3.connect(str(path))
    try:
        conn.execute("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO kv VALUES ('greeting', 'hello')")
        conn.commit()
    finally:
        conn.close()
