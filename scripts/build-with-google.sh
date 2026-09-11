#!/usr/bin/env bash
#
# Builds Slime with your Google OAuth client compiled in, so the finished app shows a single
# Connect button instead of asking anyone to paste credentials.
#
# The macOS and Linux counterpart of build-with-google.ps1. Same contract: reads
# scripts/google-client.json if it exists, otherwise asks once and offers to save it. That file is
# gitignored — the credentials never leave this machine.
#
# Usage:  ./scripts/build-with-google.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
config="$here/google-client.json"

# node rather than jq: this is a node project, so node is already a hard requirement and jq is not.
read_field() {
  node -e 'const f=require("fs");let c={};try{c=JSON.parse(f.readFileSync(process.argv[1],"utf8"))}catch{};process.stdout.write(String(c[process.argv[2]]??""))' "$1" "$2"
}

if [ -f "$config" ]; then
  client_id="$(read_field "$config" client_id)"
  client_secret="$(read_field "$config" client_secret)"
  echo "Using credentials from scripts/google-client.json"
else
  echo
  echo "No saved credentials yet. Paste them from the Google Cloud console"
  echo "(Google Auth Platform -> Clients -> your Desktop app client)."
  echo
  read -r -p "Client ID: " client_id
  read -r -s -p "Client secret (press Enter to skip): " client_secret
  echo
  client_id="$(printf '%s' "$client_id" | tr -d '[:space:]')"
  client_secret="$(printf '%s' "$client_secret" | tr -d '[:space:]')"

  read -r -p "Save these to scripts/google-client.json for next time? (y/N) " save
  if [[ "$save" =~ ^[Yy] ]]; then
    CLIENT_ID="$client_id" CLIENT_SECRET="$client_secret" node -e \
      'require("fs").writeFileSync(process.argv[1],JSON.stringify({client_id:process.env.CLIENT_ID,client_secret:process.env.CLIENT_SECRET},null,2))' \
      "$config"
    chmod 600 "$config"
    echo "Saved. It is gitignored."
  fi
fi

if [ -z "$client_id" ]; then
  echo "A client ID is required." >&2
  exit 1
fi

# option_env! in src-tauri/src/store.rs reads these at compile time.
export SLIME_GOOGLE_CLIENT_ID="$client_id"
export SLIME_GOOGLE_CLIENT_SECRET="$client_secret"

echo
echo "Building with client ${client_id:0:24}…"

cd "$root"
# `option_env!` is resolved at compile time but does not register an env-var dependency with cargo,
# so changing the credentials alone will not trigger a rebuild and the previous client would be
# silently reused. Touching the file that reads them forces just that crate to recompile —
# `cargo clean` also works but throws away gigabytes of unrelated cache.
touch src-tauri/src/store.rs

npm run tauri build

echo
echo "Done. Bundles are in:"
# Listed rather than hardcoded: the set depends on the host (dmg and app on macOS, deb and AppImage
# on Linux) and on which of them the toolchain on this machine could actually produce.
find "$root/src-tauri/target/release/bundle" -maxdepth 2 -type f \
  \( -name '*.dmg' -o -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' \) 2>/dev/null \
  | sed 's/^/  /' || true
find "$root/src-tauri/target/release/bundle" -maxdepth 1 -type d -name macos 2>/dev/null \
  | sed 's/^/  /' || true
