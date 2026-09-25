# Anara public-site Azure cutover runbook

Date prepared: 2026-08-15 (Australia/Melbourne)

## Scope

Move only `anara.health` and `www.anara.health` from Webflow to the isolated Azure Static Web App `anara-public-site` in `webapp_prod_rg`.

Do not change:

- GoDaddy registration or nameservers.
- The Azure DNS zone delegation.
- Microsoft 365 MX, SPF, DKIM, DMARC, or `autodiscover` records.
- `portal.anara.health`, `secure.anara.health`, API records, or the Digital Health Wallet.
- Any unrelated Azure resource.

## Approved Azure context

- Subscription: `Microsoft Azure Sponsorship` (`77854bbe-f0bc-49f2-9209-65e73fe6e4e2`)
- Resource group: `webapp_prod_rg`
- Static Web App: `anara-public-site`
- Management region: `westus2`
- SKU: Free

## Current rollback baseline

| Record | Value | TTL | ETag captured 2026-08-15 |
|---|---|---:|---|
| Apex A | `198.202.211.1` | 3600 | `ff3e5d1f-8138-4042-977b-c76f1335d27e` |
| `www` CNAME | `cdn.webflow.com` | 3600 | `c34fe16d-ee39-4342-ad91-2746bee9d9a2` |

These values must be captured again immediately before cutover. The fresh ETags, not the values above, are the concurrency guard.

## Gates

1. Azure preview endpoint passes the automated route, header, 404, desktop, and mobile checks.
2. The user separately approves production DNS changes.
3. Webflow remains active throughout validation and the observation window.
4. Domain ownership is validated with TXT records before traffic records change.
5. A fresh Azure DNS export and record-set snapshot exist before cutover.

## Pre-cutover evidence

Run from the site repository:

```bash
az account set --subscription 77854bbe-f0bc-49f2-9209-65e73fe6e4e2
az network dns zone export \
  --resource-group webapp_prod_rg \
  --name anara.health \
  --file-name outputs/anara.health-precutover.zone

az network dns record-set list \
  --resource-group webapp_prod_rg \
  --zone-name anara.health \
  --output json > outputs/anara.health-precutover-recordsets.json

az network dns record-set a show \
  --resource-group webapp_prod_rg \
  --zone-name anara.health \
  --name @ \
  --output json

az network dns record-set cname show \
  --resource-group webapp_prod_rg \
  --zone-name anara.health \
  --name www \
  --output json
```

Do not continue if the current A or CNAME value differs from the documented baseline without review.

## Zero-downtime domain validation

Use TXT-token validation. It does not route traffic away from Webflow.

```bash
az staticwebapp hostname set \
  --resource-group webapp_prod_rg \
  --name anara-public-site \
  --hostname anara.health \
  --validation-method dns-txt-token \
  --no-wait

az staticwebapp hostname set \
  --resource-group webapp_prod_rg \
  --name anara-public-site \
  --hostname www.anara.health \
  --validation-method dns-txt-token \
  --no-wait
```

Fetch both validation tokens with `az staticwebapp hostname show`. Publish the tokens as TXT values at `_dnsauth.www.anara.health`. Azure supports multiple TXT values in one record set. Keep Webflow's A and CNAME records unchanged during this step.

Wait until both hostnames show `Ready`, public TXT lookup succeeds against each Azure authoritative nameserver, and managed certificates are ready.

## Production cutover

This section requires separate production-DNS approval.

1. Set the apex A record to an Azure DNS alias whose target resource is the Static Web App resource ID.
2. Set `www` CNAME to the Static Web App default hostname.
3. Use the fresh record-set ETags so a concurrent DNS change causes the operation to fail instead of being overwritten.
4. Do not alter any other record set.

Expected post-cutover routing:

| Host | Target |
|---|---|
| `anara.health` | Azure DNS alias to `/subscriptions/77854bbe-f0bc-49f2-9209-65e73fe6e4e2/resourceGroups/webapp_prod_rg/providers/Microsoft.Web/staticSites/anara-public-site` |
| `www.anara.health` | The deployed Static Web App `defaultHostname` |

## Production verification

Run the automated verifier against both hosts:

```bash
node scripts/verify-static-site.mjs --local . --base-url https://anara.health
node scripts/verify-static-site.mjs --local . --base-url https://www.anara.health
```

Also verify independently:

```bash
curl -fsSI https://anara.health/
curl -fsSI https://www.anara.health/
curl -fsSI https://www.anara.health/plans-pricing
curl -fsSI https://www.anara.health/same-day-doctor-visits-chandigarh
curl -fsSI https://portal.anara.health/
curl -fsSI https://secure.anara.health/
dig +short MX anara.health
dig +short CNAME autodiscover.anara.health
dig +short TXT anara.health
dig +short TXT _dmarc.anara.health
```

Confirm desktop and 390 px mobile rendering in a real browser. Check the homepage, service-status page, legal pages, and one redirect to each destination class.

## Immediate rollback

Rollback changes only the apex A and `www` CNAME record sets:

1. Remove the apex Static Web App alias and restore `198.202.211.1` with TTL 3600.
2. Restore `www` CNAME to `cdn.webflow.com` with TTL 3600.
3. Confirm public resolution from the Azure authoritative nameservers and at least two public recursive resolvers.
4. Confirm `https://www.anara.health/` returns Webflow HTTP 200 and `https://anara.health/` returns the prior redirect behavior.
5. Leave the Static Web App and TXT validation records in place until the incident is understood.

Do not roll back or edit MX, SPF, DKIM, DMARC, `autodiscover`, `portal`, `secure`, API, or nameserver records.

## Webflow cancellation gate

Webflow can be cancelled only after:

- Both production hosts pass automated and browser verification.
- Microsoft 365 DNS and email remain unchanged.
- Portal and Digital Health Wallet endpoints remain reachable.
- The rollback path has been tested or dry-run reviewed against fresh record state.
- The production observation window is complete.
