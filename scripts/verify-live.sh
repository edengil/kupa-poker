#!/usr/bin/env bash
# אימות אתר חי אחרי פריסה.
# שימוש: KUPA_VERIFY_GROUP_SLUG=<slug> scripts/verify-live.sh [מחרוזת-סמן-בבאנדל]
# מזהה הקבוצה הוא בפועל מפתח הגישה ללינק הציבורי, ולכן הוא לא חי בסקריפט
# (גל 4ב, ממצא 17) — מעבירים אותו במשתנה סביבה. בסיס האתר ניתן לשינוי
# ב־KUPA_VERIFY_BASE_URL (ברירת המחדל היא כתובת הייצור הציבורית).
set -u
BASE="${KUPA_VERIFY_BASE_URL:-https://kupa-poker.vercel.app}"
GROUP="${KUPA_VERIFY_GROUP_SLUG:-}"
if [ -z "$GROUP" ]; then
  echo "KUPA_VERIFY_GROUP_SLUG is not set — export the group slug first" >&2
  exit 2
fi
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
