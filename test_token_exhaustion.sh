#!/bin/bash
set -e

BASE_URL="http://localhost:3000"
ADMIN_SESSION="svbnIINtUY_c_SY0MqDTAr07DfaZpyr8LCE_lvZ5anwUeVzvU8cOuUTkQv-bj9Il"
PROJECT_ID="e9ec005d-2fa4-41c7-84a9-e5f98fd3724b"

function api_call() {
  curl -s "$@" -H "Cookie: session=$ADMIN_SESSION"
}

echo "========================================"
echo "TEST SUITE: Token Exhaustion & Precision"
echo "========================================"

# Test 1: Zero tokens → 402 blocked
echo ""
echo "TEST 1: Zero tokens → premium model blocked (402)"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 0 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
RESULT=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" -H "Content-Type: application/json" -d '{"content":"Hello","model":"kimi-k2.6","speed":"fast"}')
echo "Response: $RESULT"
if echo "$RESULT" | grep -q '"statusCode":402'; then
  echo "✅ PASS: Blocked with 402 (insufficient tokens)"
else
  echo "❌ FAIL: Expected 402, got different response"
fi

# Test 2: 1 token → pre-charge deducts 1, reconciliation handles remainder
echo ""
echo "TEST 2: 1 token → message allowed, partial pre-charge"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 1 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
# Send async and wait
api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Say hi","model":"kimi-k2.6","speed":"fast"}' >/tmp/test2_result.json &
PID=$!
sleep 45
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
echo "Final balance after 1-token message: $BALANCE"
if echo "$BALANCE" | grep -q '0'; then
  echo "✅ PASS: Balance exhausted to 0 (never negative)"
else
  echo "❌ FAIL: Balance should be 0, got: $BALANCE"
fi

# Check no negative transactions
NEGATIVE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT COUNT(*) FROM token_transactions WHERE user_id = '3100fdb7-4727-486d-aa59-b9cd9e48fb1d' AND amount < 0 AND amount < -1;")
echo "Transactions with amount < -1 (should be 0): $NEGATIVE"
if echo "$NEGATIVE" | grep -q '0'; then
  echo "✅ PASS: No over-deductions (negative balance prevented)"
else
  echo "❌ FAIL: Found over-deduction transactions"
fi

# Test 3: Nano-level precision — very short message cost calculation
echo ""
echo "TEST 3: Nano-level precision for short message"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 100 WHERE username = 'admin';" >/dev/null
# Calculate what the estimated cost should be for "Hi" (2 chars = 1 token input, 2 token output)
# Kimi K2.6 via Fireworks: input $0.95/1M, output $4.00/1M
# 1 input token: (1/1M) * 0.95 = 0.00000095
# 2 output tokens: (2/1M) * 4.00 = 0.000008
# total USD: 0.00000895
# tokens = 0.00000895 * 1.2 * 1000 = 0.01074 → ceil = 1 token
echo "Expected cost for 'Hi' via Kimi K2.6: 1 token (input: 0.25→1 token, output: 0.5→1 token, total=2 tokens raw)"

RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hi","model":"kimi-k2.6","speed":"fast"}' >/tmp/test3_result.json &
PID=$!
sleep 45
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
TX=$(sudo -u postgres psql -d auroracraft -t -c "SELECT amount, description FROM token_transactions WHERE user_id = '3100fdb7-4727-486d-aa59-b9cd9e48fb1d' AND type = 'deduct' ORDER BY created_at DESC LIMIT 1;")
echo "Final balance: $BALANCE"
echo "Last deduction: $TX"
# Should have deducted exactly 1 token (pre-charge) then possibly reconciled
if echo "$TX" | grep -q 'Pre-charge'; then
  echo "✅ PASS: Pre-charge transaction recorded"
else
  echo "❌ FAIL: No pre-charge transaction found"
fi

# Test 4: Token exhaustion mid-stream via reconciliation
echo ""
echo "TEST 4: Exhaustion during reconciliation (balance=2, actual > estimate)"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 2 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
# Longer message to ensure actual cost > 1 (the pre-charge for a 4-char message)
api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Write a three sentence greeting","model":"kimi-k2.6","speed":"fast"}' >/tmp/test4_result.json &
PID=$!
sleep 60
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

BALANCE=$(sudo -u postgres psql -d auroracraft -t -c "SELECT ai_tokens FROM users WHERE username = 'admin';")
echo "Final balance after exhaustion test: $BALANCE"
# Balance should be >= 0 (never negative)
NEG=$(sudo -u postgres psql -d auroracraft -t -c "SELECT CASE WHEN ai_tokens < 0 THEN 'NEGATIVE' ELSE 'OK' END FROM users WHERE username = 'admin';")
if echo "$NEG" | grep -q 'OK'; then
  echo "✅ PASS: Balance never went negative"
else
  echo "❌ FAIL: Balance went negative!"
fi

# Test 5: Free model bypasses LiteLLM with 0 tokens
echo ""
echo "TEST 5: Free model with 0 tokens (should succeed, no LiteLLM)"
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 0 WHERE username = 'admin';" >/dev/null
RESPONSE=$(api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions" -H "Content-Type: application/json" -d '{"bridge":"opencode"}')
SESSION_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
api_call -X POST "$BASE_URL/api/projects/$PROJECT_ID/agent/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello free model","model":"opencode-deepseek-v4-flash-free","speed":"fast"}' >/tmp/test5_result.json &
PID=$!
sleep 30
kill $PID 2>/dev/null || true
wait $PID 2>/dev/null || true

# Check that no new LiteLLM process started for free model
LITELLM_RUNNING=$(pgrep -f "litellm.*8000" | wc -l)
echo "LiteLLM processes running: $LITELLM_RUNNING"
if [ "$LITELLM_RUNNING" -eq "0" ]; then
  echo "✅ PASS: No LiteLLM spawned for free model"
else
  echo "⚠️  WARN: LiteLLM may still be running from earlier test"
fi

echo ""
echo "========================================"
echo "TEST SUITE COMPLETE"
echo "========================================"

# Restore admin tokens
sudo -u postgres psql -d auroracraft -c "UPDATE users SET ai_tokens = 1000 WHERE username = 'admin';" >/dev/null
echo "Admin tokens restored to 1000"
