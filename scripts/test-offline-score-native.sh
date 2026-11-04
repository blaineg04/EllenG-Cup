#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v initdb >/dev/null; then
 for bin in /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@16/bin; do
  if test -x "$bin/initdb"; then export PATH="$bin:$PATH"; break; fi
 done
fi
command -v initdb >/dev/null
umask 077
tmp="$(mktemp -d "${RUNNER_TEMP:-/tmp}/elleng-offline-cas.XXXXXX")"
mkdir -p "$tmp/socket"
cleanup(){ if test -f "$tmp/data/postmaster.pid"; then pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; fi; rm -rf "$tmp"; }
trap cleanup EXIT
initdb -D "$tmp/data" -A trust -U elleng_ci >/dev/null
pg_ctl -D "$tmp/data" -o "-c listen_addresses='' -k '$tmp/socket' -c unix_socket_permissions=0700" -l "$tmp/postgres.log" start >/dev/null
createdb -h "$tmp/socket" -U elleng_ci elleng_offline_test
psql -X -h "$tmp/socket" -U elleng_ci -d elleng_offline_test -v ON_ERROR_STOP=1 -f tests/reliability/offline-score-cas.sql
