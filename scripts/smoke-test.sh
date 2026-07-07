#!/usr/bin/env bash
# Deal Finder deployment smoke test.
# Usage: ./scripts/smoke-test.sh https://<project-ref>.supabase.co <SERVICE_ROLE_KEY>
set -euo pipefail

BASE="${1:?usage: smoke-test.sh <supabase-url> <service-role-key>}"
KEY="${2:?usage: smoke-test.sh <supabase-url> <service-role-key>}"
USER_ID="${3:-demo-user}"

say() { printf '\n== %s ==\n' "$1"; }

say "1/3 scan-properties (Nashville seller-finance)"
SCAN=$(curl -sS -X POST "$BASE/functions/v1/scan-properties" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\",\"market\":\"Nashville, TN\",\"strategy\":\"seller_finance\",\"params\":{\"max_price\":650000,\"min_beds\":3,\"buyer_name\":\"Smoke Test\"}}")
SOURCE=$(echo "$SCAN" | grep -o '"source":"[^"]*"' | head -1 || true)
COUNT=$(echo "$SCAN" | grep -o '"count":[0-9]*' | head -1 || true)
echo "  $SOURCE $COUNT"
echo "$SCAN" | grep -q '"error"' && { echo "  FAIL: $SCAN" | head -c 400; exit 1; }
echo "  OK — expect source:rentcast with a key set; source:mock means demo fallback"

say "2/3 run-scheduled-scans (no-op unless schedules are due)"
curl -sS -X POST "$BASE/functions/v1/run-scheduled-scans" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' | head -c 300
echo

say "3/3 daily-digest (last 24h of leads)"
curl -sS -X POST "$BASE/functions/v1/daily-digest" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\"}" | head -c 300
echo

say "done — all three functions responded"
