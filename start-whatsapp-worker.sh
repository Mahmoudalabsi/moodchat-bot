#!/usr/bin/env bash
# تشغيل عامل واتساب الخلفي (whatsapp-worker.mjs)
# مستقل عن start-worker.sh الخاص بتيليجرام

cd "$(dirname "$0")"

# تحميل متغيرات البيئة إن وُجدت
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

# اختيار المُشغّل المتوفر (bun أولوية، ثم node)
if command -v bun >/dev/null 2>&1; then
  exec bun whatsapp-worker.mjs
elif command -v node >/dev/null 2>&1; then
  exec node whatsapp-worker.mjs
else
  echo "❌ لا يوجد node أو bun في النظام"
  exit 1
fi
