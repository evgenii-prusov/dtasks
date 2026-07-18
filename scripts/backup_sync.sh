#!/usr/bin/env bash
# Mirror a local backup directory to the shared OCI Object Storage bucket.
#
# Generic across projects: retention is whatever the local directory already
# contains (for dtasks, scripts/backup_db.py's GFS pruning); this script only
# mirrors it. Deleted local files are deleted remotely too -- the bucket's
# 30-day object versioning (infra/storage.tf) is the undo button.
#
# Usage:
#   backup_sync.sh <source-dir> <remote-prefix>
#
#   backup_sync.sh /data/db_backups dtasks/db_backups
#   backup_sync.sh ~/otherproj/dumps otherproj/dumps
#
# Environment overrides:
#   BACKUP_RCLONE_REMOTE  rclone remote name        (default: ocibackup)
#   BACKUP_BUCKET         bucket name               (default: backups)
#   BACKUP_MAX_DELETE     rclone --max-delete guard (default: 10)
#   BACKUP_WARN_GIB       warn when bucket exceeds  (default: 16)
#
# Setup (rclone remote config, scheduling): docs/backup-storage.md.
set -euo pipefail

REMOTE="${BACKUP_RCLONE_REMOTE:-ocibackup}"
BUCKET="${BACKUP_BUCKET:-backups}"
MAX_DELETE="${BACKUP_MAX_DELETE:-10}"
WARN_GIB="${BACKUP_WARN_GIB:-16}"

if [ "$#" -ne 2 ]; then
    echo "usage: $0 <source-dir> <remote-prefix>" >&2
    exit 2
fi
SRC="$1"
PREFIX="$2"

# A missing or empty source almost always means a broken mount, a wrong path,
# or a backup job that never ran -- syncing it would mirror the emptiness to
# the offsite copy (bounded by --max-delete, but still). Fail loudly instead.
if [ ! -d "$SRC" ]; then
    echo "ERROR: source directory does not exist: $SRC" >&2
    exit 1
fi
if [ -z "$(ls -A "$SRC")" ]; then
    echo "ERROR: refusing to sync empty source directory: $SRC" >&2
    exit 1
fi

DEST="$REMOTE:$BUCKET/$PREFIX"
echo "Syncing $SRC -> $DEST"

# --checksum: backup files are immutable once written, and OCI stores MD5s,
#   so checksum comparison is both cheap and stricter than size+modtime.
# --max-delete: caps how many remote files one run may remove. Normal GFS
#   pruning deletes a handful per day; anything above the cap aborts the
#   sync (exit 7) for a human to look at.
rclone sync "$SRC" "$DEST" \
    --checksum \
    --max-delete "$MAX_DELETE" \
    --stats-one-line \
    -v

# The Always Free allowance is 20 GiB across the whole bucket; warn early
# enough to act before writes start failing or billing starts.
BYTES=$(rclone size "$REMOTE:$BUCKET" --json | sed -E 's/.*"bytes":([0-9]+).*/\1/')
GIB=$((BYTES / 1024 / 1024 / 1024))
echo "Bucket usage: ${GIB} GiB (${BYTES} bytes)"
if [ "$GIB" -ge "$WARN_GIB" ]; then
    echo "WARNING: bucket usage ${GIB} GiB >= ${WARN_GIB} GiB threshold (Always Free cap is 20 GiB)" >&2
fi
