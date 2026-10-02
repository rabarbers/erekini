#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS="$ROOT/assets/cli"

UNAME_S="$(uname -s)"
UNAME_M="$(uname -m)"

case "$UNAME_S" in
  MINGW*|MSYS*|CYGWIN*)
    # POSIX shell on Windows (e.g. Git Bash). The Linux binary cannot run here;
    # delegate to the PowerShell wrapper, which selects the win-x64 or win-arm64
    # runtime by machine architecture and owns the Windows runtime cache.
    PS1_PATH="$SCRIPT_DIR/run-katlang.ps1"
    if command -v cygpath >/dev/null 2>&1; then
      PS1_PATH="$(cygpath -w "$PS1_PATH")"
    fi
    for PS in powershell.exe powershell pwsh.exe pwsh; do
      if command -v "$PS" >/dev/null 2>&1; then
        exec "$PS" -NoProfile -ExecutionPolicy Bypass -File "$PS1_PATH" "$@"
      fi
    done
    printf 'No PowerShell found to run the Windows KatLang wrapper: %s\n' "$PS1_PATH" >&2
    exit 1
    ;;
  Linux)
    case "$UNAME_M" in
      x86_64) RID="linux-x64" ;;
      aarch64|arm64) RID="linux-arm64" ;;
      *) RID="" ;;
    esac
    ;;
  Darwin)
    case "$UNAME_M" in
      x86_64) RID="osx-x64" ;;
      arm64|aarch64) RID="osx-arm64" ;;
      *) RID="" ;;
    esac
    ;;
  *)
    RID=""
    ;;
esac

if [ -z "${RID:-}" ]; then
  printf 'Unsupported platform for the bundled KatLang CLI: %s %s. Only linux-x64, linux-arm64, osx-x64, osx-arm64, win-x64, and win-arm64 runtimes are bundled; answer from the skill references instead (reference-only mode).\n' "$UNAME_S" "$UNAME_M" >&2
  exit 1
fi

shopt -s nullglob
archives=("$ASSETS"/katlang-cli-*-"$RID".tar.gz)
shopt -u nullglob

if [ "${#archives[@]}" -ne 1 ]; then
  printf 'Expected exactly one KatLang %s release archive in %s.\n' "$RID" "$ASSETS" >&2
  exit 1
fi

ARCHIVE="${archives[0]}"
NAME="${ARCHIVE##*/}"
VERSION="${NAME#katlang-cli-}"
VERSION="${VERSION%-"$RID".tar.gz}"

if [ -z "$VERSION" ] || [ "$VERSION" = "$NAME" ]; then
  printf 'Invalid KatLang %s release archive name: %s\n' "$RID" "$NAME" >&2
  exit 1
fi

CACHE="${TMPDIR:-/tmp}/katlang-$VERSION-$RID"
BIN="$CACHE/katlang"

if [ ! -x "$BIN" ]; then
  mkdir -p "$CACHE"
  tar --no-same-owner -xzf "$ARCHIVE" -C "$CACHE"
  chmod u+x "$BIN"
fi

exec "$BIN" "$@"
