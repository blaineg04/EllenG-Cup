#!/usr/bin/env bash
# Run ONLY against an existing, disposable loopback PostgreSQL database.
# Never creates users, alters production policies, or changes tournament data.
set -euo pipefail
if [[ "${ELLENG_ENABLE_FINAL_POLICY_DB_TESTS:-}" != "1" ]]; then
  echo "Explicit ELLENG_ENABLE_FINAL_POLICY_DB_TESTS=1 required" >&2
  exit 2
fi
url="${ELLENG_FINAL_POLICY_DB_URL:-}"
if [[ -z "$url" || "$url" == *"@"* || "$url" == *"?"* || "$url" == *"#"* ]]; then
  echo "Missing URL or unsafe PostgreSQL connection options" >&2
  exit 2
fi
case "$url" in
  postgresql://localhost/*|postgresql://127.0.0.1/*|postgres://localhost/*|postgres://127.0.0.1/*|postgresql://localhost:*/*|postgresql://127.0.0.1:*/*|postgres://localhost:*/*|postgres://127.0.0.1:*/*) ;;
  *) echo "Only explicit local loopback PostgreSQL is accepted" >&2; exit 2 ;;
esac
db="${url##*/}"
if [[ ! "$db" =~ ^elleng_policy_test_[a-zA-Z0-9_]+$ ]]; then
  echo "Only uniquely named elleng_policy_test_* databases are accepted" >&2
  exit 2
fi
command -v psql >/dev/null 2>&1 || { echo "psql not installed" >&2; exit 2; }
# Ignore ambient Postgres connection settings, which could silently override local.
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPORT PGUSER PGDATABASE PGOPTIONS PGSSLMODE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGPASSFILE PGCHANNELBINDING
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql "$url" -X -v ON_ERROR_STOP=1 -f "$root/tests/sql/nov20-final-score-policy-disposable.sql"
echo "Isolated policy metadata assertions passed. Authenticated role behavior still requires separate verification."
