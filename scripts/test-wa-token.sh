#!/bin/bash
TOKEN="EAATAOIj0lhUBRyaqztvEJKfPCxs5ykyWQ9pUHB8pEJaC7jhh9g6RyJa2qFwKldM40hfxZBaYPWWmrGtHAlgGg5GNOgAAPeNXs5UxSHF8gbQAb9S50vUTVUVUoi2hUDeamx5ZB5ZA2JQjdhYe0jyeh4ens4HGWlNZBmMOAcm2xAUuYStngMY58uLnhv0eos0ZC9wZDZD"

echo "=== Testing Token ==="
echo ""
echo "--- Step 1: Get Business Accounts ---"
curl -s "https://graph.facebook.com/v21.0/me?access_token=$TOKEN" | head -c 2000
echo ""
echo ""
echo "--- Step 2: List WhatsApp Phone Numbers ---"
PHONE_BUSINESS=$(curl -s "https://graph.facebook.com/v21.0/me?fields=id,name&access_token=$TOKEN")
echo "$PHONE_BUSINESS"
echo ""
