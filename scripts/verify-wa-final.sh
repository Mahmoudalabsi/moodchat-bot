#!/bin/bash
TOKEN="EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb"
WABA_ID="995700279847597"
PHONE_ID="1180359958489968"

echo "=== 1. Verify Webhook is registered on Meta ==="
curl -s "https://graph.facebook.com/v21.0/$WABA_ID/subscribed_apps?access_token=$TOKEN" | python3 -m json.tool

echo ""
echo "=== 2. Verify Vercel endpoints are responding ==="
echo "Webhook verification test:"
curl -s -m 10 "https://my-project-two-nu-94.vercel.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=MOOD_BOT_2026_WA&hub.challenge=VERIFY_OK_123"
echo ""
echo ""
echo "Status endpoint:"
curl -s -m 10 "https://my-project-two-nu-94.vercel.app/api/whatsapp-status" | python3 -m json.tool

echo ""
echo "=== 3. Telegram Bot still running ==="
ps aux | grep -E "worker-continuous|supervisor" | grep -v grep | awk '{print "✅ PID="$2, $11, $12, $13}'
