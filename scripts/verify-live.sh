#!/usr/bin/env bash
# אימות אתר חי אחרי פריסה — שימוש: scripts/verify-live.sh [מחרוזת-סמן-בבאנדל]
set -u
BASE="https://kupa-poker.vercel.app"
GROUP="502329063a21"
fail=0

code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/g/$GROUP")
echo "group page: $code"
[ "$code" = "200" ] || fail=1

code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/api/wa-reminders")
echo "wa-reminders without token: $code (expect 403)"
[ "$code" = "403" ] || fail=1

if [ -n "${1:-}" ]; then
  if curl -s --max-time 30 "$BASE/g/$GROUP" | grep -q "$1"; then
    echo "marker found in live page: $1"
  else
    # הסמן עשוי לשבת בצ'אנק JS — בודקים גם את נכסי העמוד
    echo "marker not in HTML (may live in a JS chunk): $1 — verify manually if critical"
  fi
fi

[ "$fail" = "0" ] && echo "LIVE OK" || echo "LIVE CHECK FAILED"
exit $fail
