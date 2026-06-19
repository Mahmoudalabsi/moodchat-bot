#!/bin/bash
TOKEN="EAATAOIj0lhUBRyaqztvEJKfPCxs5ykyWQ9pUHB8pEJaC7jhh9g6RyJa2qFwKldM40hfxZBaYPWWmrGtHAlgGg5GNOgAAPeNXs5UxSHF8gbQAb9S50vUTVUVUoi2hUDeamx5ZB5ZA2JQjdhYe0jyeh4ens4HGWlNZBmMOAcm2xAUuYStngMY58uLnhv0eos0ZC9wZDZD"

echo "=== Try whatsapp_business_account via /me/accounts ==="
curl -s "https://graph.facebook.com/v21.0/me/accounts?access_token=$TOKEN"
echo ""
echo ""
echo "=== Try /me?fields=whatsapp_business_account ==="
curl -s "https://graph.facebook.com/v21.0/me?fields=whatsapp_business_account&access_token=$TOKEN"
echo ""
echo ""
echo "=== Token debug ==="
curl -s "https://graph.facebook.com/debug_token?input_token=$TOKEN&access_token=$TOKEN"
echo ""
