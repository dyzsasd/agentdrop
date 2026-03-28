#!/usr/bin/env bash
set -euo pipefail

PROD="https://agentdrop-457589095314.us-central1.run.app"
PASS=0
FAIL=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

assert() {
  local desc="$1"
  local actual="$2"
  local expected="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

jq_py() {
  echo "$1" | python3 -c "import sys,json; data=json.load(sys.stdin); print($2)" 2>/dev/null || echo "PARSE_ERROR"
}

# Clean config
rm -rf ~/.agentdrop

# ============================================
echo -e "${BOLD}PROD E2E TESTS against $PROD${NC}"
echo ""

# ============================================
echo -e "${BOLD}1. Register${NC}"
REG=$(agentdrop --json register)
assert "returns ok api_key" "$(jq_py "$REG" "data.get('api_key','')[0:3]")" "ad_"
API_KEY=$(jq_py "$REG" "data.get('api_key','')")
echo "   API key: ${API_KEY:0:12}..."

# ============================================
echo ""
echo -e "${BOLD}2. Upload plain file${NC}"
echo "Hello from prod test!" > /tmp/prod-test.txt
UPLOAD=$(agentdrop --json upload /tmp/prod-test.txt)
assert "upload returns id" "$(jq_py "$UPLOAD" "str(len(data.get('id',''))>0)")" "True"
assert "upload returns url" "$(jq_py "$UPLOAD" "str('$PROD' in data.get('url','') or '/f/' in data.get('url',''))")" "True"
assert "upload returns filename" "$(jq_py "$UPLOAD" "data.get('filename','')")" "prod-test.txt"
FILE_ID=$(jq_py "$UPLOAD" "data.get('id','')")
DEL_TOKEN=$(jq_py "$UPLOAD" "data.get('delete_token','')")
echo "   File ID: $FILE_ID"

# ============================================
echo ""
echo -e "${BOLD}3. Download plain file${NC}"
rm -f /tmp/prod-dl.txt
DL=$(agentdrop --json download "$PROD/f/$FILE_ID" -o /tmp/prod-dl.txt)
assert "download returns path" "$(jq_py "$DL" "data.get('path','')")" "/tmp/prod-dl.txt"
CONTENT=$(cat /tmp/prod-dl.txt 2>/dev/null || echo "MISSING")
assert "file content matches" "$CONTENT" "Hello from prod test!"

# ============================================
echo ""
echo -e "${BOLD}4. Status check${NC}"
STATUS=$(agentdrop --json status "$FILE_ID")
assert "status returns correct id" "$(jq_py "$STATUS" "data.get('id','')")" "$FILE_ID"
assert "download_count is 1" "$(jq_py "$STATUS" "str(data.get('download_count',0))")" "1"
assert "is_expired is False" "$(jq_py "$STATUS" "str(data.get('is_expired',True))")" "False"

# ============================================
echo ""
echo -e "${BOLD}5. Upload with password${NC}"
echo "secret prod data" > /tmp/prod-secret.txt
UPLOAD_PW=$(agentdrop --json upload /tmp/prod-secret.txt --password s3cret)
PW_ID=$(jq_py "$UPLOAD_PW" "data.get('id','')")
PW_DEL=$(jq_py "$UPLOAD_PW" "data.get('delete_token','')")

# ============================================
echo ""
echo -e "${BOLD}6. Download without password (should fail)${NC}"
rm -f /tmp/prod-nopw.txt
DL_NOPW=$(agentdrop --json download "$PROD/f/$PW_ID" -o /tmp/prod-nopw.txt 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/prod-nopw.txt ]; then
  echo -e "  ${GREEN}✓${NC} correctly rejected without password"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} should have been rejected without password"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}7. Download with correct password${NC}"
rm -f /tmp/prod-withpw.txt
DL_PW=$(agentdrop --json download "$PROD/f/$PW_ID" -o /tmp/prod-withpw.txt --password s3cret)
PW_CONTENT=$(cat /tmp/prod-withpw.txt 2>/dev/null || echo "MISSING")
assert "password-protected content matches" "$PW_CONTENT" "secret prod data"

# ============================================
echo ""
echo -e "${BOLD}8. Upload with max-downloads=1${NC}"
echo "one-time file" > /tmp/prod-limited.txt
UPLOAD_LIM=$(agentdrop --json upload /tmp/prod-limited.txt --max-downloads 1)
LIM_ID=$(jq_py "$UPLOAD_LIM" "data.get('id','')")
assert "max_downloads is 1" "$(jq_py "$UPLOAD_LIM" "str(data.get('max_downloads',0))")" "1"

# Download once (should work)
rm -f /tmp/prod-lim-dl.txt
agentdrop --json download "$PROD/f/$LIM_ID" -o /tmp/prod-lim-dl.txt > /dev/null

echo ""
echo -e "${BOLD}9. Download after limit exhausted (should fail)${NC}"
rm -f /tmp/prod-lim-dl2.txt
DL_EX=$(agentdrop --json download "$PROD/f/$LIM_ID" -o /tmp/prod-lim-dl2.txt 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/prod-lim-dl2.txt ]; then
  echo -e "  ${GREEN}✓${NC} correctly rejected after download limit"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} should have been rejected after limit"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}10. List files${NC}"
LIST=$(agentdrop --json list)
FILE_COUNT=$(jq_py "$LIST" "str(len(data.get('files',[])))")
TOTAL=$((TOTAL + 1))
if [ "$FILE_COUNT" -ge "3" ]; then
  echo -e "  ${GREEN}✓${NC} list returns $FILE_COUNT files"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} expected at least 3 files, got $FILE_COUNT"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}11. Delete file${NC}"
DEL=$(agentdrop --json delete "$FILE_ID" --token "$DEL_TOKEN")
assert "delete returns deleted=true" "$(jq_py "$DEL" "str(data.get('deleted',False))")" "True"

echo ""
echo -e "${BOLD}12. Download deleted file (should fail)${NC}"
rm -f /tmp/prod-gone.txt
DL_GONE=$(agentdrop --json download "$PROD/f/$FILE_ID" -o /tmp/prod-gone.txt 2>&1) || true
TOTAL=$((TOTAL + 1))
if [ ! -f /tmp/prod-gone.txt ]; then
  echo -e "  ${GREEN}✓${NC} deleted file correctly returns gone"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} deleted file should not be downloadable"
  FAIL=$((FAIL + 1))
fi

# ============================================
echo ""
echo -e "${BOLD}13. Web UI served${NC}"
HTML=$(curl -s "$PROD/")
TOTAL=$((TOTAL + 1))
if echo "$HTML" | grep -q "AgentDrop"; then
  echo -e "  ${GREEN}✓${NC} web UI served at root"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} web UI not served"
  FAIL=$((FAIL + 1))
fi

# ============================================
# Cleanup
rm -f /tmp/prod-test.txt /tmp/prod-dl.txt /tmp/prod-secret.txt /tmp/prod-nopw.txt
rm -f /tmp/prod-withpw.txt /tmp/prod-limited.txt /tmp/prod-lim-dl.txt /tmp/prod-lim-dl2.txt /tmp/prod-gone.txt

# Summary
echo ""
echo "=========================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}ALL $TOTAL TESTS PASSED (prod)${NC}"
else
  echo -e "${RED}${BOLD}$FAIL/$TOTAL TESTS FAILED${NC} ($PASS passed)"
fi
echo "=========================================="
exit $FAIL
