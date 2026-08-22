#!/usr/bin/env bash
set -euo pipefail

HOST="${OPENCHAMBER_MACOS_HOST:-macos-host}"
REMOTE_ROOT="${OPENCHAMBER_MACOS_BUILD_ROOT:-/Users/macserver/Build/OpenChamber-LingXiFox}"
P12_PATH="${OPENCHAMBER_MACOS_P12_PATH:?set OPENCHAMBER_MACOS_P12_PATH to your signing certificate path}"
SIGNING_IDENTITY="${OPENCHAMBER_MACOS_SIGNING_IDENTITY:-LingXiFox Code Signing}"
ARCH="${OPENCHAMBER_TARGET_ARCH:-arm64}"
CHECK_ONLY=false

usage() {
  cat <<'EOF'
Usage: ./scripts/build-macos-remote.sh [options]

Options:
  --arch arm64|x64       Target architecture (default: arm64)
  --host HOST            SSH host (default: macos-host)
  --remote-root PATH     Isolated macOS build directory
  --p12 PATH             P12 path on the macOS host
  --identity NAME        Code-signing identity name
  --check                Sync and validate the environment without building
  --help                 Show this help

The P12 password is read without echo and is never written to disk.
EOF
}

while (($#)); do
  case "$1" in
    --arch) ARCH="${2:?missing value for --arch}"; shift 2 ;;
    --host) HOST="${2:?missing value for --host}"; shift 2 ;;
    --remote-root) REMOTE_ROOT="${2:?missing value for --remote-root}"; shift 2 ;;
    --p12) P12_PATH="${2:?missing value for --p12}"; shift 2 ;;
    --identity) SIGNING_IDENTITY="${2:?missing value for --identity}"; shift 2 ;;
    --check) CHECK_ONLY=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$ARCH" == arm64 || "$ARCH" == x64 ]] || { printf 'Unsupported architecture: %s\n' "$ARCH" >&2; exit 2; }
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9._@-]*$ ]] || { printf 'Invalid SSH host: %s\n' "$HOST" >&2; exit 2; }
[[ "$REMOTE_ROOT" =~ ^/Users/[A-Za-z0-9._-]+/Build/[A-Za-z0-9._/-]+$ ]] || {
  printf 'Remote root must be a space-free path under /Users/<user>/Build: %s\n' "$REMOTE_ROOT" >&2
  exit 2
}
[[ "$P12_PATH" != *$'\n'* && "$SIGNING_IDENTITY" != *$'\n'* ]] || { printf 'Signing values cannot contain newlines.\n' >&2; exit 2; }

for command in ssh rsync; do
  command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_SOURCE="$REMOTE_ROOT/src"
BUILD_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOCAL_ARTIFACTS="$REPO_ROOT/artifacts/macos/$BUILD_ID"
REMOTE_LOCK="$REMOTE_ROOT/.build-lock"
REMOTE_LOCK_OWNER="$REMOTE_LOCK/$BUILD_ID"

cleanup() {
  unset P12_PASSWORD 2>/dev/null || true
  printf -v cleanup_command 'if test -f %q; then rm -rf %q; fi' "$REMOTE_LOCK_OWNER" "$REMOTE_LOCK"
  ssh "$HOST" "$cleanup_command" </dev/null >/dev/null 2>&1 || true
}

printf '[macos-remote] preparing %s:%s\n' "$HOST" "$REMOTE_ROOT"
printf -v prepare_command 'mkdir -p %q %q %q && touch %q && mkdir %q && touch %q' \
  "$REMOTE_ROOT" "$REMOTE_SOURCE" "$REMOTE_ROOT/artifacts" "$REMOTE_ROOT/.openchamber-build-root" \
  "$REMOTE_LOCK" "$REMOTE_LOCK_OWNER"
ssh -n "$HOST" "$prepare_command" || { printf 'Another remote build may be active: %s\n' "$REMOTE_LOCK" >&2; exit 1; }
trap cleanup EXIT

printf '[macos-remote] syncing source changes\n'
rsync -az --delete \
  --exclude='/.git/' \
  --exclude='/.github/' \
  --exclude='/.opencode/' \
  --exclude='/.agents/' \
  --exclude='/.claude/' \
  --exclude='/artifacts/' \
  --exclude='/data/' \
  --exclude='/workspaces/' \
  --exclude='/test-results/' \
  --exclude='/packages/docs/' \
  --exclude='/packages/mobile/' \
  --exclude='/packages/vscode/' \
  --exclude='**/node_modules/' \
  --exclude='**/dist/' \
  --exclude='/packages/electron/dist-bundle/' \
  --exclude='/packages/electron/.cache/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  "$REPO_ROOT/" "$HOST:$REMOTE_SOURCE/"

if [[ ! -t 0 ]]; then
  printf 'A terminal is required to read the P12 password.\n' >&2
  exit 1
fi
read -r -s -p "P12 password for $P12_PATH: " P12_PASSWORD
printf '\n'

MODE=build
[[ "$CHECK_ONLY" == true ]] && MODE=check
printf -v remote_command '/bin/bash %q %q %q %q %q %q %q' \
  "$REMOTE_SOURCE/scripts/build-macos-remote-worker.sh" \
  "$REMOTE_ROOT" "$BUILD_ID" "$ARCH" "$P12_PATH" "$SIGNING_IDENTITY" "$MODE"

printf '[macos-remote] running remote %s\n' "$MODE"
printf '%s\n' "$P12_PASSWORD" | ssh "$HOST" "$remote_command"
unset P12_PASSWORD

if [[ "$CHECK_ONLY" == true ]]; then
  printf '[macos-remote] environment and signing input validated\n'
  exit 0
fi

mkdir -p "$LOCAL_ARTIFACTS"
rsync -az "$HOST:$REMOTE_ROOT/artifacts/$BUILD_ID/" "$LOCAL_ARTIFACTS/"
printf '[macos-remote] artifacts: %s\n' "$LOCAL_ARTIFACTS"
