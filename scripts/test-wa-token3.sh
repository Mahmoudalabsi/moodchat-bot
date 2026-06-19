#!/bin/bash
TOKEN="EAATAOIj0lhUBRyaqztvEJKfPCxs5ykyWQ9pUHB8pEJaC7jhh9g6RyJa2qFwKldM40hfxZBaYPWWmrGtHAlgGg5GNOgAAPeNXs5UxSHF8gbQAb9S50vUTVUVUoi2hUDeamx5ZB5ZA2JQjdhYe0jyeh4ens4HGWlNZBmMOAcm2xAUuYStngMY58uLnhv0eos0ZC9wZDZD"

echo "=== Try old WABA ID 264033988099879 ==="
curl -s "https://graph.facebook.com/v21.0/264033988099879?access_token=$TOKEN"
echo ""
echo ""
echo "=== List phone numbers in WABA ==="
curl -s "https://graph.facebook.com/v21.0/264033988099879/phone_numbers?access_token=$TOKEN"
echo ""
echo ""
echo "=== Try businesses for system user ==="
curl -s "https://graph.facebook.com/v21.0/me/businesses?access_token=$TOKEN"
echo ""
