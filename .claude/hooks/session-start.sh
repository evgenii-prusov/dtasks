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

# Sandboxes that pre-bake browsers (Claude Code's cloud containers) ship a
# Chromium whose build number does not match the one this repo's Playwright
# version would download, so `npx playwright test` fails to find an executable.
# playwright.config.ts honours this variable when it is set.
if [ -e "/opt/pw-browsers/chromium" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_BROWSER_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

# core.hooksPath is local git config, so a fresh clone (a cloud sandbox) does
# not get it and none of .beads-hooks/ runs: no block on committing to main,
# and no pre-commit re-export of .beads/issues.jsonl. Set it only when unset,
# so a checkout that already points somewhere keeps its value.
if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR/.beads-hooks" ] \
  && ! git -C "$CLAUDE_PROJECT_DIR" config --get core.hooksPath >/dev/null 2>&1; then
  git -C "$CLAUDE_PROJECT_DIR" config core.hooksPath .beads-hooks
fi

if command -v bd >/dev/null 2>&1; then
  bd prime --hook-json
fi
