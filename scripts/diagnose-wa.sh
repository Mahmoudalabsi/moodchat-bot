#!/bin/bash
TOKEN="EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb"
PHONE_ID="1180359958489968"

echo "=== 1. Check if your phone is in the allowed list (Test Recipients) ==="
curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?access_token=$TOKEN" | python3 -m json.tool

echo ""
echo "=== 2. Try sending a test message from Meta to confirm bot can send ==="
# Try sending hello_world template (only allowed template on Test Number)
echo "Trying to send hello_world template..."
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
echo "=== 3. Check Vercel deployment logs (last webhook activity) ==="
echo "Status endpoint:"
curl -s -m 10 "https://my-project-two-nu-94.vercel.app/api/whatsapp-status" | python3 -m json.tool

echo ""
echo "=== 4. Check that webhook is properly subscribed for messages events ==="
curl -s "https://graph.facebook.com/v21.0/995700279847597/subscribed_apps?access_token=$TOKEN" | python3 -m json.tool
