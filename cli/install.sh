#!/usr/bin/env bash
# Install the bsky CLI: create a venv, store creds in the OS keyring, drop a
# launcher into ~/.local/bin/. Idempotent — safe to re-run.
#
# Linux only for now (uses libsecret / secret-tool). macOS Keychain support
# is on the roadmap; PRs welcome.
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: this installer is Linux-only right now (uses gnome-keyring/libsecret)." >&2
  echo "       on macOS, run cli/bsky.py directly with creds in env vars." >&2
  exit 1
fi

if ! command -v secret-tool >/dev/null 2>&1; then
  echo "error: secret-tool not found. install with:" >&2
  echo "    sudo apt-get install libsecret-tools     # Debian/Ubuntu" >&2
  echo "    sudo dnf install libsecret               # Fedora" >&2
  exit 1
fi

ROOT="${OPENCLAW_BLUESKY_ROOT:-$HOME/.local/share/openclaw-bluesky}"
BIN_DIR="${OPENCLAW_BLUESKY_BIN:-$HOME/.local/bin}"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$ROOT" "$BIN_DIR"

if [[ ! -d "$ROOT/venv" ]]; then
  echo "==> creating venv at $ROOT/venv"
  python3 -m venv "$ROOT/venv"
fi

echo "==> installing/upgrading dependencies"
"$ROOT/venv/bin/pip" install --quiet --upgrade pip
"$ROOT/venv/bin/pip" install --quiet -r "$HERE/requirements.txt"

cp "$HERE/bsky.py" "$ROOT/bsky.py"
cp "$HERE/_facets.py" "$ROOT/_facets.py"

# Prompt for creds only if not already present
if ! secret-tool lookup service openclaw origin bluesky type handle >/dev/null 2>&1; then
  read -rp "Bluesky handle (e.g. you.bsky.social): " HANDLE
  read -rsp "App password (https://bsky.app/settings/app-passwords): " APP_PW
  echo
  echo -n "$HANDLE" | secret-tool store --label="Bluesky handle" \
    service openclaw origin bluesky type handle
  echo -n "$APP_PW" | secret-tool store --label="Bluesky app password" \
    service openclaw origin bluesky type app-password handle "$HANDLE"
  echo "==> creds stored in keyring"
else
  echo "==> creds already in keyring (skipping)"
fi

cat > "$BIN_DIR/bsky" <<EOF
#!/usr/bin/env bash
exec "$ROOT/venv/bin/python" "$ROOT/bsky.py" "\$@"
EOF
chmod +x "$BIN_DIR/bsky"

echo
echo "done. try: bsky whoami"
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "note: $BIN_DIR is not in your PATH — add it to your shell rc."
fi
