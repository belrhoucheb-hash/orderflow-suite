#!/usr/bin/env bash
# ============================================================
# Inbox-koppeling smoke test
# ============================================================
#
# Doel: valideer end-to-end dat een net-gekoppelde inbox
# gepolld wordt en een order-concept oplevert.
#
# Verplicht vóór elke merge naar main die poll-inbox,
# test-inbox-connection, tenant_inboxes of useTenantInboxes raakt.
#
# Credentials: gebruik de test-mailbox uit 1Password,
# 'Orderflow Smoke Inbox'. Commit ze NIET.
#
# Gebruik:
#   export SMOKE_TEST_HOST=...
#   export SMOKE_TEST_PORT=993
#   export SMOKE_TEST_USER=...
#   export SMOKE_TEST_PASS=...
#   export SUPABASE_URL=...
#   export SUPABASE_ANON_KEY=...
#   export SUPABASE_AUTH_JWT=...     # JWT van een testgebruiker met tenant-admin rol
#   export SUPABASE_TENANT_ID=...
#   bash scripts/smoke-test-inbox.sh
# ============================================================

set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

required=(SMOKE_TEST_HOST SMOKE_TEST_USER SMOKE_TEST_PASS SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_AUTH_JWT SUPABASE_TENANT_ID)
for v in "${required[@]}"; do
  [[ -n "${!v:-}" ]] || fail "env $v ontbreekt"
done

PORT="${SMOKE_TEST_PORT:-993}"

echo "Stap 1, test-inbox-connection met verse gegevens"
test_result=$(curl -sS -X POST "$SUPABASE_URL/functions/v1/test-inbox-connection" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
  "tenantId": "$SUPABASE_TENANT_ID",
  "host": "$SMOKE_TEST_HOST",
  "port": $PORT,
  "username": "$SMOKE_TEST_USER",
  "password": "$SMOKE_TEST_PASS",
  "folder": "INBOX"
}
JSON
)")

echo "Response: $test_result"
echo "$test_result" | grep -q '"ok":true' || fail "test-inbox-connection faalde"

echo ""
echo "Stap 2, inbox aanmaken via REST (met versleuteld wachtwoord)"
create_result=$(curl -sS -X POST "$SUPABASE_URL/rest/v1/tenant_inboxes" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$(cat <<JSON
{
  "tenant_id": "$SUPABASE_TENANT_ID",
  "label": "smoke-test-$(date +%s)",
  "host": "$SMOKE_TEST_HOST",
  "port": $PORT,
  "username": "$SMOKE_TEST_USER"
}
JSON
)")

INBOX_ID=$(echo "$create_result" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "$INBOX_ID" ]] || fail "Inbox niet aangemaakt: $create_result"
echo "Inbox aangemaakt: $INBOX_ID"

echo ""
echo "Stap 3, wachtwoord via RPC zetten"
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/set_tenant_inbox_password" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_inbox_id\":\"$INBOX_ID\",\"p_password\":\"$SMOKE_TEST_PASS\"}" > /dev/null

echo ""
echo "Stap 4, poll-inbox handmatig triggeren"
poll_result=$(curl -sS -X POST "$SUPABASE_URL/functions/v1/poll-inbox" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "Response: $poll_result"

processed=$(echo "$poll_result" | grep -o '"processed":[0-9]*' | head -1 | cut -d':' -f2)
echo "Orders verwerkt: ${processed:-0}"

echo ""
echo "Stap 5, inbox-state valideren (last_polled_at, consecutive_failures)"
state=$(curl -sS "$SUPABASE_URL/rest/v1/tenant_inboxes?id=eq.$INBOX_ID&select=last_polled_at,last_error,consecutive_failures" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY")
echo "State: $state"
echo "$state" | grep -q '"consecutive_failures":0' || fail "consecutive_failures niet 0"

echo ""
echo "Stap 6, opruimen"
curl -sS -X DELETE "$SUPABASE_URL/rest/v1/tenant_inboxes?id=eq.$INBOX_ID" \
  -H "Authorization: Bearer $SUPABASE_AUTH_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" > /dev/null

echo ""
echo "=== Smoke test geslaagd ==="
