#!/usr/bin/env bash
# ===========================================================================
# Chetu financial ledger — verification harness
# ===========================================================================
# Rebuilds a scratch database, applies the base migrations, seeds production's
# shape, applies the financial migrations so the backfills run over real data,
# then runs the workflow and permission suite. That is the same order
# production will see.
#
# The suite POSTS REAL JOURNALS, so it is not idempotent: it must always run
# against a freshly rebuilt database, which is why the rebuild and the run live
# in one script rather than two.
#
#   scripts/financial-verify/run.sh            # full rebuild + verify
#   scripts/financial-verify/run.sh --keep     # leave the database for inspection
#
# Requires a local PostgreSQL reachable on PGHOST/PGPORT (defaults below).
# Never point this at production: it drops and recreates its database.
# ===========================================================================
set -uo pipefail

PGHOST_="${PGHOST:-/tmp}"; PGPORT_="${PGPORT:-55432}"; PGUSER_="${PGUSER:-postgres}"
DB="${VERIFY_DB:-chetu_test}"
PSQL="psql -h $PGHOST_ -p $PGPORT_ -U $PGUSER_ -v ON_ERROR_STOP=1 -q"
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="$HERE/../../supabase/migrations"

case "$DB" in *prod*|*production*) echo "refusing to run against '$DB'"; exit 2;; esac

echo "── rebuilding $DB ──"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;" >/dev/null || exit 1
$PSQL -d "$DB" -f "$HERE/00-supabase-shim.sql" >/dev/null 2>&1

echo "── base migrations ──"
for f in $(ls "$MIG"/*.sql | sort | head -13); do
  printf '  %-56s' "$(basename "$f")"
  out=$($PSQL -d "$DB" -f "$f" 2>&1) && echo "ok" || { echo "FAIL"; echo "$out" | head -15; exit 1; }
done

echo "── seed (production shape) ──"
$PSQL -d "$DB" -f "$HERE/01-seed-production-shape.sql" 2>&1 \
  | grep -vE '^(SET|INSERT|UPDATE|DO|CREATE|SELECT)$' | sed 's/^/  /'

echo "── financial migrations ──"
for f in $(ls "$MIG"/*.sql | sort | tail -8); do
  printf '  %-56s' "$(basename "$f")"
  out=$($PSQL -d "$DB" -f "$f" 2>&1) && echo "ok" || { echo "FAIL"; echo "$out" | head -25; exit 1; }
  echo "$out" | grep -E 'NOTICE' | sed 's/^/      /'
done

echo "── verification suite ──"
OUT=$(psql -h "$PGHOST_" -p "$PGPORT_" -U "$PGUSER_" -d "$DB" -f "$HERE/02-tests.sql" 2>&1)
echo "$OUT" | grep -E '^psql.*ERROR' | sed 's/^/  UNCAUGHT /'
echo "$OUT" | sed -n '/RESULTS/,$p'

FAILED=$(psql -h "$PGHOST_" -p "$PGPORT_" -U "$PGUSER_" -d "$DB" -tAc \
  "SELECT count(*) FROM _verify_results WHERE NOT passed" 2>/dev/null || echo 99)
UNCAUGHT=$(echo "$OUT" | grep -cE '^psql.*ERROR')

if [ "${1:-}" != "--keep" ]; then :; fi
if [ "$FAILED" != "0" ] || [ "$UNCAUGHT" != "0" ]; then
  echo ""; echo "VERIFICATION FAILED — $FAILED assertion(s), $UNCAUGHT uncaught error(s)"; exit 1
fi
echo ""; echo "VERIFICATION PASSED"
