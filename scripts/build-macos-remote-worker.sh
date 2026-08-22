#!/usr/bin/env bash
set -euo pipefail

REMOTE_ROOT="${1:?missing remote root}"
BUILD_ID="${2:?missing build id}"
TARGET_ARCH="${3:?missing target architecture}"
P12_PATH="${4:?missing P12 path}"
SIGNING_IDENTITY="${5:?missing signing identity}"
MODE="${6:?missing mode}"

BUN_VERSION=1.3.14
NODE_VERSION=22.23.2
TOOLS="$REMOTE_ROOT/tools"
CACHE="$REMOTE_ROOT/cache"
TMP="$REMOTE_ROOT/tmp/$BUILD_ID"
SOURCE="$REMOTE_ROOT/src"
ARTIFACTS="$REMOTE_ROOT/artifacts/$BUILD_ID"

fail() { printf '[macos-worker] %s\n' "$*" >&2; exit 1; }
download() {
  local url="$1" sha256="$2" destination="$3"
  local temporary="$destination.tmp"
  if [[ -f "$destination" ]] && printf '%s  %s\n' "$sha256" "$destination" | shasum -a 256 -c - >/dev/null 2>&1; then
    return
  fi
  curl --fail --location --retry 3 --output "$temporary" "$url"
  printf '%s  %s\n' "$sha256" "$temporary" | shasum -a 256 -c - >/dev/null
  mv "$temporary" "$destination"
}

[[ -f "$REMOTE_ROOT/.openchamber-build-root" ]] || fail "invalid build root: $REMOTE_ROOT"
[[ -f "$SOURCE/package.json" && -f "$SOURCE/bun.lock" ]] || fail "incomplete source mirror: $SOURCE"
[[ "$MODE" == build || "$MODE" == check ]] || fail "unsupported mode: $MODE"
[[ "$TARGET_ARCH" == arm64 || "$TARGET_ARCH" == x64 ]] || fail "unsupported target: $TARGET_ARCH"
[[ -f "$P12_PATH" ]] || fail "P12 not found: $P12_PATH"
[[ -f "$REMOTE_ROOT/.build-lock/$BUILD_ID" ]] || fail 'remote build lock is not owned by this build'

case "$(uname -m)" in
  arm64)
    BUN_ARCHIVE=bun-darwin-aarch64.zip
    BUN_SHA256=d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620
    NODE_ARCHIVE="node-v$NODE_VERSION-darwin-arm64.tar.gz"
    NODE_SHA256=61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6
    ;;
  x86_64)
    BUN_ARCHIVE=bun-darwin-x64-baseline.zip
    BUN_SHA256=3e35ad6f53971a9834bf9e6786e2adf72b5f1921cc9a9c5fde073d2972944076
    NODE_ARCHIVE="node-v$NODE_VERSION-darwin-x64.tar.gz"
    NODE_SHA256=58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026
    ;;
  *) fail "unsupported macOS host architecture: $(uname -m)" ;;
esac

mkdir -p "$TOOLS/downloads" "$TOOLS/bin" "$CACHE/bun" "$CACHE/electron" "$CACHE/electron-builder" "$TMP"

BUN="$TOOLS/bun-$BUN_VERSION/bun"
if [[ ! -x "$BUN" ]]; then
  archive="$TOOLS/downloads/$BUN_ARCHIVE"
  staging="$TMP/bun"
  download "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/$BUN_ARCHIVE" "$BUN_SHA256" "$archive"
  rm -rf "$staging"
  mkdir -p "$staging"
  ditto -x -k "$archive" "$staging"
  mkdir -p "$(dirname "$BUN")"
  cp "$staging"/*/bun "$BUN"
  chmod 755 "$BUN"
fi

NODE_HOME="$TOOLS/node-v$NODE_VERSION"
if [[ ! -x "$NODE_HOME/bin/node" ]]; then
  archive="$TOOLS/downloads/$NODE_ARCHIVE"
  staging="$TMP/node"
  download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_ARCHIVE" "$NODE_SHA256" "$archive"
  rm -rf "$staging"
  mkdir -p "$staging"
  tar -xzf "$archive" -C "$staging"
  mv "$staging"/node-v*/ "$NODE_HOME"
fi

ln -sfn "$BUN" "$TOOLS/bin/bun"
ln -sfn "$NODE_HOME/bin/node" "$TOOLS/bin/node"
ln -sfn "$NODE_HOME/bin/npm" "$TOOLS/bin/npm"
ln -sfn "$NODE_HOME/bin/npx" "$TOOLS/bin/npx"

export PATH="$TOOLS/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"
export BUN_INSTALL_CACHE_DIR="$CACHE/bun"
export ELECTRON_CACHE="$CACHE/electron"
export ELECTRON_BUILDER_CACHE="$CACHE/electron-builder"
export npm_config_cache="$CACHE/npm"
export TMPDIR="$TMP"
export APP_BUILDER_TMP_DIR="$TMP/app-builder"
export ELECTRON_BUILDER_ARCH="$TARGET_ARCH"
export CSC_LINK="$P12_PATH"
export CSC_NAME="$SIGNING_IDENTITY"
export CSC_IDENTITY_AUTO_DISCOVERY=true

IFS= read -r CSC_KEY_PASSWORD || fail 'missing P12 password on stdin'
export CSC_KEY_PASSWORD

[[ "$("$BUN" --version)" == "$BUN_VERSION" ]] || fail 'unexpected Bun version'
[[ "$("$NODE_HOME/bin/node" --version)" == "v$NODE_VERSION" ]] || fail 'unexpected Node.js version'
xcodebuild -version
openssl pkcs12 -in "$P12_PATH" -passin env:CSC_KEY_PASSWORD -noout >/dev/null 2>&1 || fail 'P12 password or file is invalid'
CERT_SUBJECT="$(openssl pkcs12 -in "$P12_PATH" -passin env:CSC_KEY_PASSWORD -clcerts -nokeys 2>/dev/null \
  | openssl x509 -noout -subject -nameopt RFC2253)"
[[ "$CERT_SUBJECT" == *"CN=$SIGNING_IDENTITY"* ]] || fail "P12 does not contain identity: $SIGNING_IDENTITY"

if [[ "$MODE" == check ]]; then
  printf '[macos-worker] toolchain and P12 validated\n'
  exit 0
fi

trap 'unset CSC_KEY_PASSWORD' EXIT

cd "$SOURCE"
printf '[macos-worker] installing dependencies\n'
"$BUN" install --frozen-lockfile

printf '[macos-worker] building Electron app for %s\n' "$TARGET_ARCH"
rm -rf packages/electron/dist packages/electron/dist-bundle
"$BUN" run --cwd packages/electron generate:macos-icon
"$BUN" run --cwd packages/electron build:web-assets
"$BUN" run --cwd packages/electron prepare:opencode-cli
"$BUN" run --cwd packages/electron verify:opencode-cli
"$BUN" run --cwd packages/electron bundle:main
"$BUN" run --cwd packages/electron rebuild:native
"$BUN" x electron-builder --mac --"$TARGET_ARCH" --publish=never \
  -c.forceCodeSigning=true \
  -c.mac.notarize=false \
  -c.mac.timestamp=none \
  -c.dmg.sign=false
"$BUN" run --cwd packages/electron verify:opencode-cli:packaged

if [[ "$TARGET_ARCH" == arm64 ]]; then
  APP_PATH="$SOURCE/packages/electron/dist/mac-arm64/OpenChamber LingXiFox.app"
else
  APP_PATH="$SOURCE/packages/electron/dist/mac/OpenChamber LingXiFox.app"
fi
[[ -d "$APP_PATH" ]] || fail "packaged app not found: $APP_PATH"

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
SIGN_INFO="$(codesign -dvvv "$APP_PATH" 2>&1)"
[[ "$SIGN_INFO" == *"Authority=$SIGNING_IDENTITY"* ]] || fail 'unexpected signing authority'
[[ "$SIGN_INFO" =~ flags=.*runtime ]] || fail 'hardened runtime flag missing'

mkdir -p "$ARTIFACTS"
ditto "$APP_PATH" "$ARTIFACTS/OpenChamber LingXiFox.app"
for artifact in "$SOURCE"/packages/electron/dist/*.dmg \
  "$SOURCE"/packages/electron/dist/*.zip \
  "$SOURCE"/packages/electron/dist/*.blockmap \
  "$SOURCE"/packages/electron/dist/latest-mac.yml; do
  [[ -f "$artifact" ]] && cp "$artifact" "$ARTIFACTS/"
done
printf '%s\n' "$SIGN_INFO" > "$ARTIFACTS/codesign.txt"
printf '[macos-worker] signed artifacts ready: %s\n' "$ARTIFACTS"
