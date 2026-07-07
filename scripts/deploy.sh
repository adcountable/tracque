#!/usr/bin/env bash
# ============================================================
# Tracque — one-command deploy (Playbook Phase 0)
# ============================================================
# Prereqs (one-time, ~5 min):
#   1. supabase.com → create a project → note the PROJECT REF (in the URL)
#      and the SERVICE ROLE key (Project Settings → API).
#   2. rentcast.io → free API key.
#   3. npm i -g supabase && supabase login
#
# Then:  ./scripts/deploy.sh
set -euo pipefail

say()  { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
fail() { printf '\033[31mERROR: %s\033[0m\n' "$1"; exit 1; }

command -v supabase >/dev/null || fail "supabase CLI not found. Run: npm i -g supabase && supabase login"

say "Tracque deploy"
read -rp "Supabase project ref (e.g. abcdefghijklmnop): " REF
[ -n "$REF" ] || fail "project ref required"
read -rp "RentCast API key (blank = demo/mock data): " RENTCAST
read -rp "Resend API key (blank = outreach stays dry-run): " RESEND

say "1/5 Linking project"
supabase link --project-ref "$REF"

say "2/5 Applying migrations (001–009)"
supabase db push

say "3/5 Deploying edge functions"
for fn in scan-properties run-scheduled-scans daily-digest sweep-county send-outreach national-sweep; do
  echo "  → $fn"
  supabase functions deploy "$fn"
done

say "4/5 Setting secrets"
SECRETS=()
[ -n "$RENTCAST" ] && SECRETS+=("RENTCAST_API_KEY=$RENTCAST")
[ -n "$RESEND" ]   && SECRETS+=("RESEND_API_KEY=$RESEND")
if [ ${#SECRETS[@]} -gt 0 ]; then
  supabase secrets set "${SECRETS[@]}"
else
  echo "  (none provided — running on mock data)"
fi

say "5/5 Smoke test"
read -rp "Service role key (for the smoke test; skip with Enter): " SRK
if [ -n "$SRK" ]; then
  ./scripts/smoke-test.sh "https://$REF.supabase.co" "$SRK" || true
else
  echo "  Skipped. Run later: ./scripts/smoke-test.sh https://$REF.supabase.co <service-role-key>"
fi

say "Done"
cat <<EOF
Next:
  1. cp .env.example .env   # fill VITE_SUPABASE_URL=https://$REF.supabase.co + anon key
  2. bun install && bun dev # Deal Finder → Scan market → badge should say "Live data"
  3. Automation: enable pg_cron per the snippet in supabase/migrations/008_automation.sql
  4. Free off-market sweep (Nashville):
     curl -X POST "https://$REF.supabase.co/functions/v1/sweep-county" \\
       -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" \\
       -d '{"user_id":"demo-user","zip":"37216","min_fit":50}'
Then open the Playbook tab and keep ticking.
EOF
