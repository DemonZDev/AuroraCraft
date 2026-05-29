#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
ADMIN_SESSION="svbnIINtUY_c_SY0MqDTAr07DfaZpyr8LCE_lvZ5anwUeVzvU8cOuUTkQv-bj9Il"
PROJECT_ID="e9ec005d-2fa4-41c7-84a9-e5f98fd3724b"
ADMIN_USER_ID="3100fdb7-4727-486d-aa59-b9cd9e48fb1d"

function api_call() {
  curl -s "$@" -H "Cookie: session=$ADMIN_SESSION"
}

echo "========================================"
echo "TEST SUITE: Token Exhaustion & Precision"
echo "========================================"

# Clean slate: delete old transactions, reset balance
sudo -u postgres psql -d auroracraft -c "DELETE FROM token_transactions WHERE user_id = '$ADMIN_USER_ID';" >/dev/null
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 1000, tokens_used = 0 WHERE username = 'admin';" >/dev/null

echo ""
echo "TEST 1: Zero tokens → premium model blocked (402)"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 0 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
RESULT=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" -H "Content-Type: application/json" -d '{"content":"Hello","model":"kimi-k2.6","speed":"fast"}')
if echo "$RESULT" | grep -q '"statusCode":402'; then
  echo "✅ PASS: Blocked with 402 (insufficient tokens)"
else
  echo "❌ FAIL: Expected 402, got: $RESULT"
fi

# Test 2: 1 token → partial pre-charge, reconciliation
echo ""
echo "TEST 2: 1 token → message goes through, partial deduction"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 1 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Say hello","model":"kimi-k2.6","speed":"fast"}' >/tmp/test2.json &
PID=$!
sleep 50
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
echo "Final balance: $BALANCE"
# Balance should be >= 0
NEG=$(sudo -u postgres psql -d auroracraft -t -c "SELECT CASE WHEN ai_tokens < 0 THEN 'NEGATIVE' ELSE 'OK' END FROM users WHERE username = 'admin';")
if echo "$NEG" | grep -q 'OK'; then
  echo "✅ PASS: Balance never negative ($BALANCE)"
else
  echo "❌ FAIL: Balance went negative!"
fi

# Show all transactions from this test
echo "Transactions:"
sudo -u postgres psql -d auroracraft -t -c "
SELECT type, amount, description 
FROM token_transactions 
WHERE user_id = '$ADMIN_USER_ID' 
ORDER BY created_at DESC 
LIMIT 5;"

# Test 3: Nano precision with short message
echo ""
echo "TEST 3: Nano-level precision — 'Hi' message cost"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 100 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hi","model":"kimi-k2.6","speed":"fast"}' >/tmp/test3.json &
PID=$!
sleep 50
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
TX=$(sudo -u postgres psql -d auroracraft -t -c "
SELECT type, amount, description 
FROM token_transactions 
WHERE user_id = '$ADMIN_USER_ID' 
ORDER BY created_at DESC 
LIMIT 5;")
echo "Final balance: $BALANCE"
echo "Last transactions:"
echo "$TX"

# Verify there are refund or additional charge transactions
HAS_RECONCILE=$(sudo -u postgres psql -d auroracraft -t -c "
SELECT COUNT(*) 
FROM token_transactions 
WHERE user_id = '$ADMIN_USER_ID' 
AND (description LIKE 'Refund%' OR description LIKE 'Additional charge%');")
echo "Reconciliation transactions: $HAS_RECONCILE"
if echo "$HAS_RECONCILE" | grep -q '[1-9]'; then
  echo "✅ PASS: Token reconciliation is active"
else
  echo "⚠️  WARN: No reconciliation transactions found (may need longer output to trigger)"
fi

# Test 4: Exhaustion during reconciliation
echo ""
echo "TEST 4: Balance=2, actual cost may exceed estimate"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 2 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Write a three sentence greeting","model":"kimi-k2.6","speed":"fast"}' >/tmp/test4.json &
PID=$!
sleep 60
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
NEG=$(sudo -u postgres psql -d auroracraft -t -c "SELECT CASE WHEN ai_tokens < 0 THEN 'NEGATIVE' ELSE 'OK' END FROM users WHERE username = 'admin';")
echo "Final balance: $BALANCE"
if echo "$NEG" | grep -q 'OK'; then
  echo "✅ PASS: Balance never negative"
else
  echo "❌ FAIL: Balance went negative!"
fi

echo ""
echo "All transactions:"
sudo -u postgres psql -d auroracraft -t -c "
SELECT type, amount, description 
FROM token_transactions 
WHERE user_id = '$ADMIN_USER_ID' 
ORDER BY created_at;")

# Test 5: Free model with 0 tokens
echo ""
echo "TEST 5: Free model with 0 tokens (no LiteLLM)"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 0 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello free","model":"opencode-deepseek-v4-flash-free","speed":"fast"}' >/tmp/test5.json &
PID=$!
sleep 30
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

# Verify no deduction happened for free model
FREE_DEDUCT=$(sudo -u postgres psql -d auroracraft -t -c "
SELECT COUNT(*) 
FROM token_transactions 
WHERE user_id = '$ADMIN_USER_ID' 
AND type = 'deduct' 
AND description LIKE '%flash-free%';")
echo "Deductions for free model: $FREE_DEDUCT"
if echo "$FREE_DEDUCT" | grep -q '0'; then
  echo "✅ PASS: No tokens deducted for free model"
else
  echo "❌ FAIL: Tokens deducted for free model!"
fi

echo ""
echo "========================================"
echo "TEST SUITE COMPLETE"
echo "========================================"

# Restore
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 1000 WHERE username = 'admin';" >/dev/null
