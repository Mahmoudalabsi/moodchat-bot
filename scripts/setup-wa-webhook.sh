#!/bin/bash
TOKEN="EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb"
WABA_ID="995700279847597"
WEBHOOK_URL="https://my-project-two-nu-94.vercel.app/api/whatsapp/webhook"
VERIFY_TOKEN="MOOD_BOT_2026_WA"

echo "=== Step 1: Set webhook on WhatsApp Business Account ==="
RES=$(curl -s -X POST \
  "https://graph.facebook.com/v21.0/$WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"callback_url\": \"$WEBHOOK_URL\",
    \"verify_token\": \"$VERIFY_TOKEN\",
    \"fields\": \"messages,message_status,message_template_status_update\"
  }")
echo "Response: $RES"

echo ""
echo "=== Step 2: Verify webhook was registered ==="
curl -s "https://graph.facebook.com/v21.0/$WABA_ID/subscribed_apps?access_token=$TOKEN" | python3 -m json.tool
