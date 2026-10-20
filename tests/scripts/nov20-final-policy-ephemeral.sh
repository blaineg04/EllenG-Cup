#!/usr/bin/env bash
# Opt-in only. Creates an isolated local PostgreSQL cluster in a temporary directory.
# Requires local initdb, pg_ctl, createdb, and psql; no production credentials.
set -euo pipefail
[[ "${ELLENG_ENABLE_FINAL_POLICY_DB_TESTS:-}" == "1" ]] || { echo "Explicit opt-in required" >&2; exit 2; }
for bin in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin /usr/local/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin; do
  [[ -x "$bin/initdb" ]] && export PATH="$bin:$PATH" && break
done
for exe in initdb pg_ctl createdb psql; do
  command -v "$exe" >/dev/null 2>&1 || { echo "Missing local PostgreSQL command: $exe" >&2; exit 2; }
done
dir="$(mktemp -d "${TMPDIR:-/tmp}/elleng-pg-XXXXXX")"
port=55439
cleanup() {
  pg_ctl -D "$dir/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT
mkdir "$dir/data"
initdb -D "$dir/data" -A trust -U postgres --no-instructions >"$dir/initdb.log"
# Only localhost is exposed; cluster and data are removed at script exit.
pg_ctl -D "$dir/data" -o "-h 127.0.0.1 -p $port -c unix_socket_directories=$dir" -l "$dir/server.log" -w start
db="elleng_policy_test_ephemeral_$$"
createdb -h 127.0.0.1 -p "$port" -U postgres "$db"
export ELLENG_FINAL_POLICY_DB_URL="postgresql://127.0.0.1:$port/$db"
bash "$(dirname "$0")/nov20-final-policy-local-check.sh"
