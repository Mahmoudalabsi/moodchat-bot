#!/bin/bash
TOKEN="EAATAOIj0lhUBRzbHLZBv1GfU1u4He8oOSudvwXyOLNsXFXv1EZCIMmRHPDmaepbZCL2Hy1LpwF7ssYC6b3ilBXPZB253foCdiZBZBNdGVZAj5SBr4t7UZAhswitEpFREUdBi5O64WL1x8Y1tnGTZBtD1XyAoDoZCVI1ZCnUy8PtNqAwGbWpjIVKbBLC4eVpgwQjTDRO3QaZA4re3K8kunHoQBiZBtPq8ViG9RdKu0sX7DzLEMsvKK2YoI6cZA9leDxyKkTh4lCQg6DxZAoPtPW6ZA6WWjWZBencPb"
PHONE_ID="1180359958489968"
WABA_ID="995700279847597"

echo "=== 1. Verify Token ==="
curl -s "https://graph.facebook.com/debug_token?input_token=$TOKEN&access_token=$TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
print(f\"  Valid: {d.get('is_valid')}\")
print(f\"  Type: {d.get('type')}\")
print(f\"  App: {d.get('application')}\")
print(f\"  Expires: {d.get('expires_at')} (0=never)\")
print(f\"  Scopes: {', '.join(d.get('scopes', []))}\")
"

echo ""
echo "=== 2. Verify Phone Number ID ($PHONE_ID) ==="
curl -s "https://graph.facebook.com/v21.0/$PHONE_ID?access_token=$TOKEN" | python3 -m json.tool

echo ""
echo "=== 3. Verify WABA ID ($WABA_ID) ==="
curl -s "https://graph.facebook.com/v21.0/$WABA_ID?access_token=$TOKEN" | python3 -m json.tool

echo ""
echo "=== 4. List all phone numbers in WABA ==="
curl -s "https://graph.facebook.com/v21.0/$WABA_ID/phone_numbers?access_token=$TOKEN" | python3 -m json.tool
