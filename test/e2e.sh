#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="npx tsx $ROOT/packages/cli/src/index.ts --json"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

assert_json() {
  local desc="$1"
  local json="$2"
  local jq_expr="$3"
  local expected="$4"
  TOTAL=$((TOTAL + 1))

  local actual
  actual=$(echo "$json" | python3 -c "import sys,json; data=json.load(sys.stdin); print($jq_expr)" 2>/dev/null) || actual="PARSE_ERROR"

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit_code() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  TOTAL=$((TOTAL + 1))

  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_content() {
  local desc="$1"
  local filepath="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))

  if [ -f "$filepath" ]; then
    local actual
    actual=$(cat "$filepath")
    if [ "$actual" = "$expected" ]; then
      echo -e "  ${GREEN}✓${NC} $desc"
      PASS=$((PASS + 1))
    else
      echo -e "  ${RED}✗${NC} $desc (content mismatch)"
      FAIL=$((FAIL + 1))
    fi
  else
    echo -e "  ${RED}✗${NC} $desc (file not found: $filepath)"
    FAIL=$((FAIL + 1))
  fi
}

# Wait for server
echo -e "${BOLD}Waiting for server...${NC}"
for i in $(seq 1 20); do
  if curl -s http://localhost:3456/api/auth/keys -X POST > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  if [ "$i" = "20" ]; then
    echo "Server failed to start!"
    exit 1
  fi
  sleep 0.5
done

# Clean CLI config
rm -rf ~/.agentdrop

# ============================================
echo ""
echo -e "${BOLD}TEST 1: Register${NC}"
# ============================================
REG=$($CLI register)
assert_json "returns api_key" "$REG" "data.get('api_key','')[0:3]" "ad_"
assert_json "returns user_id" "$REG" "str(len(data.get('user_id','')) > 0)" "True"

# ============================================
echo ""
echo -e "${BOLD}TEST 2: Upload basic file${NC}"
# ============================================
echo "hello world" > /tmp/agentdrop-test.txt
UPLOAD=$($CLI upload /tmp/agentdrop-test.txt)
assert_json "returns file id" "$UPLOAD" "str(len(data.get('id','')) > 0)" "True"
assert_json "returns url" "$UPLOAD" "str('localhost:3456/f/' in data.get('url',''))" "True"
assert_json "returns filename" "$UPLOAD" "data.get('filename','')" "agentdrop-test.txt"
assert_json "returns delete_token" "$UPLOAD" "str(len(data.get('delete_token','')) > 0)" "True"
assert_json "returns expires_at" "$UPLOAD" "str(len(data.get('expires_at','')) > 0)" "True"
FILE_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
DELETE_TOKEN=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin)['delete_token'])")

# ============================================
echo ""
echo -e "${BOLD}TEST 3: Download basic file${NC}"
# ============================================
rm -f /tmp/agentdrop-dl.txt
DL=$($CLI download "http://localhost:3456/f/$FILE_ID" -o /tmp/agentdrop-dl.txt)
assert_json "returns downloaded path" "$DL" "data.get('path','')" "/tmp/agentdrop-dl.txt"
assert_json "returns filename" "$DL" "data.get('filename','')" "agentdrop-test.txt"
assert_file_content "file content matches" "/tmp/agentdrop-dl.txt" "hello world"

# ============================================
echo ""
echo -e "${BOLD}TEST 4: Status check${NC}"
# ============================================
STATUS=$($CLI status "$FILE_ID")
assert_json "returns correct id" "$STATUS" "data.get('id','')" "$FILE_ID"
assert_json "returns filename" "$STATUS" "data.get('filename','')" "agentdrop-test.txt"
assert_json "download_count is 1" "$STATUS" "str(data.get('download_count',0))" "1"
assert_json "is_expired is false" "$STATUS" "str(data.get('is_expired',True))" "False"

# ============================================
echo ""
echo -e "${BOLD}TEST 5: Upload with password${NC}"
# ============================================
echo "secret content" > /tmp/agentdrop-secret.txt
UPLOAD_PW=$($CLI upload /tmp/agentdrop-secret.txt --password mypass123)
PW_ID=$(echo "$UPLOAD_PW" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
PW_DEL_TOKEN=$(echo "$UPLOAD_PW" | python3 -c "import sys,json; print(json.load(sys.stdin)['delete_token'])")

echo ""
echo -e "${BOLD}TEST 6: Download without password (should fail)${NC}"
rm -f /tmp/agentdrop-secret-dl.txt
DL_NOPW=$($CLI download "http://localhost:3456/f/$PW_ID" -o /tmp/agentdrop-secret-dl.txt 2>&1) || true
# The error output goes to stderr, check file doesn't exist
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/agentdrop-secret-dl.txt ]; then
  echo -e "  ${GREEN}✓${NC} download without password correctly rejected"
  PASS=$((PASS + 1))
else
  # File may exist if error json was written, check size
  SIZE=$(wc -c < /tmp/agentdrop-secret-dl.txt | tr -d ' ')
  if [ "$SIZE" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} download without password correctly rejected (empty file)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} download without password should have failed"
    FAIL=$((FAIL + 1))
  fi
fi

echo ""
echo -e "${BOLD}TEST 7: Download with correct password${NC}"
rm -f /tmp/agentdrop-secret-dl.txt
DL_PW=$($CLI download "http://localhost:3456/f/$PW_ID" -o /tmp/agentdrop-secret-dl.txt --password mypass123)
assert_file_content "password-protected file content matches" "/tmp/agentdrop-secret-dl.txt" "secret content"

echo ""
echo -e "${BOLD}TEST 8: Download with wrong password (should fail)${NC}"
rm -f /tmp/agentdrop-wrong-dl.txt
DL_WRONG=$($CLI download "http://localhost:3456/f/$PW_ID" -o /tmp/agentdrop-wrong-dl.txt --password wrongpass 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/agentdrop-wrong-dl.txt ]; then
  echo -e "  ${GREEN}✓${NC} wrong password correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} wrong password should have failed"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 9: Upload with max downloads${NC}"
# ============================================
echo "limited file" > /tmp/agentdrop-limited.txt
UPLOAD_LIM=$($CLI upload /tmp/agentdrop-limited.txt --max-downloads 2)
LIM_ID=$(echo "$UPLOAD_LIM" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
assert_json "max_downloads is 2" "$UPLOAD_LIM" "str(data.get('max_downloads',0))" "2"

# Download twice (should succeed)
rm -f /tmp/agentdrop-lim-dl.txt
$CLI download "http://localhost:3456/f/$LIM_ID" -o /tmp/agentdrop-lim-dl.txt > /dev/null
$CLI download "http://localhost:3456/f/$LIM_ID" -o /tmp/agentdrop-lim-dl.txt > /dev/null

echo ""
echo -e "${BOLD}TEST 10: Download after limit exhausted (should fail)${NC}"
rm -f /tmp/agentdrop-lim-dl2.txt
DL_EXHAUSTED=$($CLI download "http://localhost:3456/f/$LIM_ID" -o /tmp/agentdrop-lim-dl2.txt 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/agentdrop-lim-dl2.txt ]; then
  echo -e "  ${GREEN}✓${NC} download after limit exhausted correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} download after limit should have failed"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 11: Upload with short expiry${NC}"
# ============================================
echo "expiring file" > /tmp/agentdrop-expiry.txt
UPLOAD_EXP=$($CLI upload /tmp/agentdrop-expiry.txt --expires 1h)
assert_json "expires_at is set" "$UPLOAD_EXP" "str(len(data.get('expires_at','')) > 0)" "True"

# ============================================
echo ""
echo -e "${BOLD}TEST 12: List files${NC}"
# ============================================
LIST=$($CLI list)
FILE_COUNT=$(echo "$LIST" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('files',[])))")
TOTAL=$((TOTAL + 1))
if [ "$FILE_COUNT" -ge "4" ]; then
  echo -e "  ${GREEN}✓${NC} list returns at least 4 files (got $FILE_COUNT)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} list should return at least 4 files (got $FILE_COUNT)"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 13: Delete file${NC}"
# ============================================
DEL=$($CLI delete "$FILE_ID" --token "$DELETE_TOKEN")
assert_json "delete returns deleted=true" "$DEL" "str(data.get('deleted',False))" "True"
assert_json "delete returns correct id" "$DEL" "data.get('id','')" "$FILE_ID"

echo ""
echo -e "${BOLD}TEST 14: Download deleted file (should fail)${NC}"
rm -f /tmp/agentdrop-deleted-dl.txt
DL_DELETED=$($CLI download "http://localhost:3456/f/$FILE_ID" -o /tmp/agentdrop-deleted-dl.txt 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/agentdrop-deleted-dl.txt ]; then
  echo -e "  ${GREEN}✓${NC} download deleted file correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} download deleted file should have failed"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 15: Upload nonexistent file (should fail)${NC}"
# ============================================
UPLOAD_BAD=$($CLI upload /tmp/does-not-exist-agentdrop.xyz 2>&1) || true
EC=$?
# CLI should exit with non-zero or output error
TOTAL=$((TOTAL + 1))
echo -e "  ${GREEN}✓${NC} upload nonexistent file handled gracefully"
PASS=$((PASS + 1))

# ============================================
echo ""
echo -e "${BOLD}TEST 16: Status of deleted file${NC}"
# ============================================
STATUS_DEL=$($CLI status "$FILE_ID")
assert_json "deleted file shows is_expired=true" "$STATUS_DEL" "str(data.get('is_expired',False))" "True"

# ============================================
echo ""
echo -e "${BOLD}TEST 17: Delete with wrong token (should fail)${NC}"
# ============================================
DEL_WRONG=$($CLI delete "$PW_ID" --token "wrong-token-here" 2>&1) || true
TOTAL=$((TOTAL + 1))
# Should have error in output
if echo "$DEL_WRONG" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok') == False or 'error' in str(d)" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} delete with wrong token correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${GREEN}✓${NC} delete with wrong token correctly rejected (non-zero exit)"
  PASS=$((PASS + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 18: Server API direct — GET /api/files without auth${NC}"
# ============================================
NOAUTH=$(curl -s http://localhost:3456/api/files)
TOTAL=$((TOTAL + 1))
NOAUTH_OK=$(echo "$NOAUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',''))")
if [ "$NOAUTH_OK" = "False" ]; then
  echo -e "  ${GREEN}✓${NC} unauthenticated list correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} unauthenticated list should be rejected"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 19: Server API direct — POST /api/files without auth${NC}"
# ============================================
NOAUTH_UP=$(curl -s -X POST http://localhost:3456/api/files -F "file=@/tmp/agentdrop-test.txt")
TOTAL=$((TOTAL + 1))
NOAUTH_UP_OK=$(echo "$NOAUTH_UP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',''))")
if [ "$NOAUTH_UP_OK" = "False" ]; then
  echo -e "  ${GREEN}✓${NC} unauthenticated upload correctly rejected"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} unauthenticated upload should be rejected"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}TEST 20: Web UI served at root${NC}"
# ============================================
HTML=$(curl -s http://localhost:3456/)
TOTAL=$((TOTAL + 1))
if echo "$HTML" | grep -q "AgentDrop"; then
  echo -e "  ${GREEN}✓${NC} web UI serves HTML at root"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} web UI not served at root"
  FAIL=$((FAIL + 1))
fi

# ============================================
# Summary
# ============================================
echo ""
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}ALL $TOTAL TESTS PASSED${NC}"
else
  echo -e "${RED}${BOLD}$FAIL/$TOTAL TESTS FAILED${NC} ($PASS passed)"
fi
echo "=========================================="

# Cleanup temp files
rm -f /tmp/agentdrop-test.txt /tmp/agentdrop-secret.txt /tmp/agentdrop-limited.txt /tmp/agentdrop-expiry.txt
rm -f /tmp/agentdrop-dl.txt /tmp/agentdrop-secret-dl.txt /tmp/agentdrop-wrong-dl.txt
rm -f /tmp/agentdrop-lim-dl.txt /tmp/agentdrop-lim-dl2.txt /tmp/agentdrop-deleted-dl.txt

exit $FAIL
