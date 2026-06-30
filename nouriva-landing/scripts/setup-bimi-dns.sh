#!/usr/bin/env bash
# Add BIMI + update DMARC for nouriva.tech via Cloudflare API.
# Requires: CLOUDFLARE_API_TOKEN with Zone → DNS → Edit for nouriva.tech
set -euo pipefail

ZONE_NAME="${ZONE_NAME:-nouriva.tech}"
BIMI_CONTENT='v=BIMI1; l=https://nouriva.tech/bimi/logo.svg;'
DMARC_CONTENT='v=DMARC1; p=quarantine; pct=100; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;'

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Set CLOUDFLARE_API_TOKEN (Zone DNS Edit) and re-run." >&2
  exit 1
fi

zone_id=$(curl -fsS "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | jq -r '.result[0].id')

echo "Zone: ${ZONE_NAME} (${zone_id})"

upsert_txt() {
  local name="$1"
  local content="$2"
  local fqdn="${name}.${ZONE_NAME}"
  local id

  id=$(curl -fsS "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records?type=TXT&name=${fqdn}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    | jq -r '.result[0].id // empty')

  if [ -n "${id}" ]; then
    echo "Updating ${fqdn}"
    curl -fsS -X PUT "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${id}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"TXT\",\"name\":\"${name}\",\"content\":\"${content}\",\"ttl\":1}" \
      | jq -e '.success' >/dev/null
  else
    echo "Creating ${fqdn}"
    curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"TXT\",\"name\":\"${name}\",\"content\":\"${content}\",\"ttl\":1}" \
      | jq -e '.success' >/dev/null
  fi
}

upsert_txt "default._bimi" "${BIMI_CONTENT}"
upsert_txt "_dmarc" "${DMARC_CONTENT}"

echo "OK. Verify:"
echo "  dig TXT default._bimi.${ZONE_NAME} +short"
echo "  dig TXT _dmarc.${ZONE_NAME} +short"
