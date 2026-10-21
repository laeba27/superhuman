#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL="${MYSQL:-mysql -u root}"
SUITES=(api drag-resize content arrange saving responsive)
[ $# -gt 0 ] && SUITES=("$@")

reset_db() {
  $MYSQL < "$ROOT/database/schema.sql" && $MYSQL < "$ROOT/database/seed.sql" || { echo "Could not reset the database with: $MYSQL"; exit 2; }
  find "$ROOT/public/uploads" -type f ! -name .htaccess ! -name .gitkeep -delete
}

failed=0
for suite in "${SUITES[@]}"; do
  reset_db
  echo "== $suite"
  if [ "$suite" = api ]; then
    output=$(python3 -I "$ROOT/tests/api.test.py" 2>&1)
  else
    output=$(node "$ROOT/tests/browser/$suite.test.js" 2>&1)
  fi
  status=$?
  grep -E '^(FAIL|[0-9]+ passed)|Error' <<< "$output" || true
  [ "$status" -ne 0 ] && failed=1
done
reset_db
[ $failed -eq 0 ] && echo "All suites passed." || echo "Some suites failed."
exit $failed
