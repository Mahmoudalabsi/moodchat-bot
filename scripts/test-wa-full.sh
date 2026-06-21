#!/bin/bash
TOKEN="EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb"
PHONE_ID="1180359958489968"
WEBHOOK_URL="https://my-project-two-nu-94.vercel.app/api/whatsapp/webhook"

echo "=== Webhook registered with Meta: ✅ ==="
echo ""
echo "=== Now checking Vercel logs for incoming webhook calls... ==="
echo ""
echo "=== Sending a test template message (hello_world) ==="
# This is the only template available on Test Number
curl -s -X POST \
  "https://graph.facebook.com/v21.0/$PHONE_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "15556739898",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": {"code": "en_US"}
    }
  }' | python3 -m json.tool

echo ""
echo "=== Final webhook status check ==="
curl -s -m 10 "https://my-project-two-nu-94.vercel.app/api/whatsapp-status" | python3 -m json.tool
