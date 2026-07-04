#!/bin/bash
set -uo pipefail

# In this environment the bd (beads) binary lives at /root/go/bin/bd but that
# directory isn't on PATH by default, so a bare `bd` call fails with
# "command not found". Add it for this session and persist it for later
# commands (bd ready, bd close, etc.) via CLAUDE_ENV_FILE.
if [ -d "/root/go/bin" ]; then
  export PATH="/root/go/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="/root/go/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
  fi
fi

if command -v bd >/dev/null 2>&1; then
  bd prime --hook-json
fi
