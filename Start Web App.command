#!/bin/bash
#
# Double-click to start Wombo Combo.
#
# Starts the dev server, waits until it actually responds, opens your browser,
# and shuts everything down when you close this window or press Ctrl+C.

# Enable job control so the server runs in its own process group — that is what
# lets us kill the whole tree (npm -> next -> workers) on the way out.
set -m

# Resolve the project directory from this script's own location, so the file
# works no matter where it is launched from.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

APP_NAME="Wombo Combo"
SERVER_PID=""
CLEANED_UP=""

bold()  { printf "\033[1m%s\033[0m\n" "$1"; }
dim()   { printf "\033[2m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

cleanup() {
  # Guard against running twice (EXIT fires after INT/TERM/HUP).
  [ -n "$CLEANED_UP" ] && return
  CLEANED_UP=1

  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    printf "\n"
    dim "Shutting down $APP_NAME…"
    # Negative PID targets the whole process group.
    kill -TERM -"$SERVER_PID" 2>/dev/null

    # Give it two seconds to exit cleanly, then insist.
    for _ in 1 2 3 4; do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -"$SERVER_PID" 2>/dev/null
  fi
  green "Stopped."
}

# EXIT covers normal exit; the rest cover Ctrl+C and closing the window.
trap cleanup EXIT INT TERM HUP

clear
bold "$APP_NAME"
dim "$PROJECT_DIR"
printf "\n"

# --- Node -------------------------------------------------------------------
# Double-clicked scripts get a login shell but not always a full PATH, so pick
# up nvm / Homebrew installs that only exist in the user's profile.
if ! command -v node >/dev/null 2>&1; then
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  for candidate in /opt/homebrew/bin /usr/local/bin; do
    [ -x "$candidate/node" ] && PATH="$candidate:$PATH"
  done
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  red "Node.js was not found."
  echo "Install it from https://nodejs.org (LTS), then run this again."
  echo
  read -r -p "Press Return to close…"
  exit 1
fi

dim "Node $(node -v)"

# --- Dependencies -----------------------------------------------------------
# Reinstall when node_modules is missing or older than the lockfile.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  bold "Installing dependencies (first run takes a minute)…"
  if ! npm install; then
    red "npm install failed."
    echo
    read -r -p "Press Return to close…"
    exit 1
  fi
  touch node_modules
  printf "\n"
fi

# --- Port -------------------------------------------------------------------
# Find a free port rather than failing if something already holds 3000.
PORT=""
for candidate in 3000 3001 3002 3003 3004; do
  if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
    PORT="$candidate"
    break
  fi
done

if [ -z "$PORT" ]; then
  red "Ports 3000-3004 are all in use."
  echo "Close whatever is running on them and try again."
  echo
  read -r -p "Press Return to close…"
  exit 1
fi

[ "$PORT" != "3000" ] && dim "Port 3000 was busy — using $PORT instead."

# --- Start ------------------------------------------------------------------
URL="http://localhost:$PORT"
bold "Starting the server…"

npm run dev -- --port "$PORT" &
SERVER_PID=$!

# Wait for it to actually serve a request before opening the browser — Next
# prints its banner well before the first compile finishes.
printf "\033[2mWaiting for the app to be ready"
READY=""
for _ in $(seq 1 90); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    printf "\033[0m\n"
    red "The server exited unexpectedly. The error is above."
    echo
    read -r -p "Press Return to close…"
    exit 1
  fi
  if curl -sf -o /dev/null --max-time 2 "$URL"; then
    READY=1
    break
  fi
  printf "."
  sleep 1
done
printf "\033[0m\n"

if [ -z "$READY" ]; then
  red "Timed out waiting for the app to start."
  echo "It may still be compiling — try opening $URL yourself."
else
  open "$URL"
  printf "\n"
  green "$APP_NAME is running at $URL"
fi

printf "\n"
dim "Leave this window open while you use the app."
dim "Close it (or press Ctrl+C) to shut the server down."
printf "\n"

# Block here until the server exits or we are interrupted; the trap does the
# rest. `wait` on its own returns immediately when a trap fires, so loop.
while kill -0 "$SERVER_PID" 2>/dev/null; do
  wait "$SERVER_PID" 2>/dev/null
done
