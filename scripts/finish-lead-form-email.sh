#!/usr/bin/env bash
# Finishes the anara.health lead-form email setup and deploys the site to production.
# Safe to re-run. Prints no secrets.
#
# What it does:
#   1. Creates the Azure-managed sending domain on the Email Communication Service (India data location).
#   2. Links that domain to the Communication Service resource.
#   3. Stores the ACS connection string + sender address as Static Web App settings (production and the
#      'leadform' preview environment). The API prefers ACS when present and ignores SendGrid.
#   4. Deploys ./webflow-site + ./api to production.
#   5. Runs read-only smoke checks on production.
set -euo pipefail

RG=webapp_prod_rg
SWA=anara-public-site
EMAIL_SVC=acs-email-anara-site
ACS=acs-anara-site
DOMAIN=AzureManagedDomain
cd "$(dirname "$0")/.."

echo "== 1. Azure-managed sending domain =="
if ! az communication email domain show -n "$DOMAIN" --email-service-name "$EMAIL_SVC" -g "$RG" -o none 2>/dev/null; then
  az communication email domain create -n "$DOMAIN" --email-service-name "$EMAIL_SVC" -g "$RG" \
    --location global --domain-management AzureManaged -o none
fi
DOMAIN_ID=$(az communication email domain show -n "$DOMAIN" --email-service-name "$EMAIL_SVC" -g "$RG" --query id -o tsv)
MAIL_FROM=$(az communication email domain show -n "$DOMAIN" --email-service-name "$EMAIL_SVC" -g "$RG" --query mailFromSenderDomain -o tsv)
echo "   sender domain: $MAIL_FROM"

echo "== 2. Link domain to $ACS =="
az communication update -n "$ACS" -g "$RG" --linked-domains "$DOMAIN_ID" -o none

echo "== 3. Static Web App settings (values not printed) =="
CS=$(az communication list-key -n "$ACS" -g "$RG" --query primaryConnectionString -o tsv)
for ENV_ARGS in "" "--environment-name leadform"; do
  # shellcheck disable=SC2086
  az staticwebapp appsettings set -n "$SWA" -g "$RG" $ENV_ARGS \
    --setting-names "ACS_EMAIL_CONNECTION_STRING=$CS" "ACS_SENDER_ADDRESS=DoNotReply@$MAIL_FROM" -o none
done
unset CS
az staticwebapp appsettings list -n "$SWA" -g "$RG" --query "properties" -o json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ', {k:('<set>' if ('KEY' in k or 'CONNECTION' in k) else v) for k,v in d.items()})"

echo "== 4. Deploy production =="
(cd api && npm test --silent)
SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query properties.apiKey -o tsv)" \
  npx -y @azure/static-web-apps-cli@2 deploy ./webflow-site --api-location ./api --env production \
  | grep -iE "deploy|error|fail|✔|✖" || true

echo "== 5. Smoke checks (no email is sent) =="
for p in / /privacy.html /terms.html; do
  printf '   %-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://www.anara.health$p")"
done
printf '   apex redirect   %s\n' "$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' --max-time 20 https://anara.health/)"
printf '   api validation  %s\n' "$(curl -s -w ' (%{http_code})' --max-time 40 -X POST -H 'Accept: application/json' -H 'Origin: https://www.anara.health' -d 'name=&email=bad&company=' https://www.anara.health/api/lead)"
echo
echo "Done. To prove delivery, submit the form on https://www.anara.health/#cta once with a name starting 'TEST'."
