# First-Merchant Shopify Checkout Webhook Smoke Runbook

GitHub issue: #99
Date: 2026-07-09

This runbook verifies the first-merchant Shopify-hosted checkout path against a
safe Shopify development or generated-test-data store and a reachable Cartaisy
backend environment.

Target path:

```text
cart -> Shopify-hosted checkout -> Shopify order webhook -> Cartaisy order reconciliation
```

## Operator Boundary

This smoke test is operator work. It may touch a live Shopify development
store, a reachable backend URL, environment variables, webhook configuration,
and staging database records. Do not run it against production merchant data,
real payment transactions, production databases, production Shopify credentials,
or shared environments without explicit operator approval.

AI agents may prepare this runbook, commands, checklists, and evidence tables.
AI agents must not invent execution evidence.

## Scope

Use one of these environments:

- Preferred: staging backend on the approved Railway staging path, once
  provisioned and healthy.
- Fallback: local backend exposed through an operator-approved HTTPS tunnel.

Use one of these Shopify stores:

- Shopify development store.
- Shopify generated-test-data store.

Verify:

- Store record exists in Cartaisy backend.
- Storefront credentials are store-scoped.
- Webhook secret is configured.
- Shopify webhook delivery reaches the backend.
- `POST /api/v1/checkout/handoff` returns a `checkoutUrl`.
- Shopify test checkout can complete.
- Order webhook is accepted and verified.
- `CheckoutHandoff` is reconciled.
- Local `Order` is created or updated with the correct `storeId`.
- Guest and customer attribution, if practical.

## Do Not Touch

- Native Stripe checkout redesign.
- Production merchant data.
- Real payment transactions.
- Mobile UI implementation.
- App Store or Play Store work.
- New webhook topics unless required for this smoke path.

## Prerequisites

Record values by description only. Do not paste secrets, tokens, private keys,
database URLs, or real webhook secret values into this file, PRs, tickets, logs,
or screenshots.

| Prerequisite | Required evidence | Result |
| --- | --- | --- |
| Backend commit | Git SHA deployed or running locally | Pending operator execution |
| Backend environment | Staging URL or local+tunnel description | Pending operator execution |
| Health endpoint | `/api/health` status | Pending operator execution |
| Readiness endpoint | `/api/ready` status, if available | Pending operator execution |
| Shopify store | Development/generated-test-data store domain, without tokens | Pending operator execution |
| Cartaisy Store record | Store id, shop domain, active/connected state | Pending operator execution |
| Storefront credentials | Confirmed present on the store-specific record/config, no values recorded | Pending operator execution |
| Webhook secret | Confirmed configured in backend environment, no value recorded | Pending operator execution |
| Webhook URL | HTTPS URL registered in Shopify for order webhook topics | Pending operator execution |
| SaaS safety mode | `SAAS_MODE` or `MULTI_TENANT_MODE` state recorded by name/status only | Pending operator execution |

## Environment Setup

### Preferred Staging

1. Confirm the Railway staging backend exists and is deployed from the target
   backend commit.
2. Confirm `/api/health` returns HTTP 200.
3. Confirm `/api/ready` returns HTTP 200 with database readiness. A 503 means
   the process is reachable but database readiness is not proven.
4. Confirm the staging database is dedicated to staging and not production.
5. Confirm the target Shopify development store is connected to the Cartaisy
   `Store` record expected for this smoke test.
6. Confirm the backend environment has `SHOPIFY_WEBHOOK_SECRET` configured.
7. Confirm staging SaaS safety flags are set by name/status only when this is a
   SaaS staging run.

### Local Tunnel Fallback

Use this only when staging is unavailable.

1. Start the backend locally with a non-production database approved by the
   operator.
2. Expose the backend through an HTTPS tunnel.
3. Confirm the public tunnel URL reaches `/api/health`.
4. Confirm the public tunnel URL reaches `/api/ready`, if the local setup uses
   database readiness.
5. Register Shopify webhooks against the HTTPS tunnel URL.
6. Keep tunnel URLs, database names, store descriptions, and command outputs in
   the evidence table. Keep secrets out.

## Shopify Webhook Setup

Register only the order topics needed by the existing smoke path:

- `orders/create`
- `orders/updated`
- `orders/paid`

Expected backend paths:

- `POST /api/webhooks/shopify/orders/create`
- `POST /api/webhooks/shopify/orders/updated`
- `POST /api/webhooks/shopify/orders/paid`

The backend must verify the Shopify HMAC and resolve
`X-Shopify-Shop-Domain` to the active connected `Store` before handler logic
runs.

## Smoke Steps

### 1. Record Baseline

Record:

- Backend commit SHA.
- Environment description.
- Shopify development/generated-test-data store domain.
- Target Cartaisy `Store` id.
- Existing `CheckoutHandoff` count for the target store, if checked.
- Existing `Order` count for the target store, if checked.

Do not run destructive database writes. Do not query or modify production data.

### 2. Verify Store Context

Confirm the target `Store` record:

- Exists.
- Is active/connected for the smoke store.
- Has the expected Shopify shop domain.
- Has store-scoped Storefront credentials configured.
- Does not require a global Shopify fallback for the checkout handoff path.

### 3. Create Or Reuse A Test Cart

Using the approved mobile/API flow or a prepared API client:

1. Create or choose a test cart for the target store.
2. Add a safe test product from the same store.
3. Confirm the cart belongs to the target store.

### 4. Run Checkout Handoff

Call:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/checkout/handoff" \
  -H "Content-Type: application/json" \
  -H "X-Store-ID: <storeId>" \
  -d '{
    "cartId": "<shopifyCartId>",
    "guestSessionId": "<guestSessionId-if-guest>"
  }'
```

For an authenticated customer test, include the approved customer
authentication header instead of relying on guest attribution.

Expected:

- HTTP success response.
- Response includes a `checkoutUrl`.
- A non-sensitive `CheckoutHandoff` record is created for the target `storeId`
  and cart.
- No secret or private Shopify credential appears in the response.

### 5. Complete Shopify Test Checkout

Open the returned `checkoutUrl` and complete Shopify test checkout using
Shopify's approved test payment path for the development store.

Expected:

- Shopify accepts the checkout.
- A Shopify order is created in the development/generated-test-data store.
- No real payment transaction is used.

### 6. Verify Webhook Delivery

In Shopify webhook delivery logs or backend logs, confirm:

- Shopify attempted delivery to the expected backend URL.
- Delivery reached the backend.
- HMAC verification passed.
- Shop-domain-to-Store mapping resolved the target `storeId`.
- Handler accepted the webhook without a retryable failure.

### 7. Verify Reconciliation

Confirm in the safe target database:

- The matching `CheckoutHandoff` is marked reconciled.
- The reconciled handoff references the local `Order`.
- The local `Order` exists or was updated.
- The local `Order.storeId` equals the target Cartaisy `Store` id.
- Shopify order identifiers are stored only within the target store context.
- Customer attribution is correct when testing an authenticated customer.
- Guest attribution is correct when testing a guest session.

### 8. Record Result

Record pass/fail evidence in the matrix below. If the smoke run fails, classify
the blocker as backend, mobile/API client, Shopify config, or environment.

## Pass/Fail Matrix

| Check | Expected result | Actual result | Status | Follow-up owner |
| --- | --- | --- | --- | --- |
| Backend commit recorded | Commit SHA recorded | Pending operator execution | Pending | Operator |
| Environment recorded | Staging or local+tunnel description recorded | Pending operator execution | Pending | Operator |
| Store description recorded | Development/generated-test-data store recorded without secrets | Pending operator execution | Pending | Operator |
| Store record exists | Target `Store` exists and is active/connected | Pending operator execution | Pending | Operator |
| Storefront credentials scoped | Store-specific credentials confirmed, no global fallback needed | Pending operator execution | Pending | Operator |
| Webhook secret configured | Secret present in environment, value not recorded | Pending operator execution | Pending | Operator |
| Webhook delivery reaches backend | Shopify delivery reaches expected backend URL | Pending operator execution | Pending | Operator |
| Checkout handoff returns URL | `/checkout/handoff` returns `checkoutUrl` | Pending operator execution | Pending | Operator |
| Shopify test checkout completes | Development-store checkout creates Shopify order | Pending operator execution | Pending | Operator |
| Order webhook accepted | HMAC verified and handler accepts order webhook | Pending operator execution | Pending | Operator |
| Handoff reconciled | Matching `CheckoutHandoff` marked reconciled | Pending operator execution | Pending | Operator |
| Local order store-scoped | Local `Order.storeId` equals target store id | Pending operator execution | Pending | Operator |
| Guest attribution | Guest order/session attribution verified, if practical | Pending operator execution | Pending | Operator |
| Customer attribution | Customer order attribution verified, if practical | Pending operator execution | Pending | Operator |

## Failure Classification

Use this table for any failed or blocked step.

| Failure | Evidence | Classification | Follow-up |
| --- | --- | --- | --- |
| Pending operator execution | Not run as part of issue #99 docs update | Environment/operator | Run smoke after staging or local tunnel context is approved |

Classifications:

- Backend: code, route, webhook verification, reconciliation, or store-scoping
  behavior failed.
- Mobile/API client: cart setup or handoff call from the client path failed.
- Shopify: dev store, checkout, test payment, webhook registration, or delivery
  configuration failed.
- Environment: backend URL, tunnel, staging deploy, database, secret, or health
  readiness failed.

## Evidence Template

Copy this section into the release evidence record after an operator run.

```text
Run date:
Operator:
Backend commit:
Environment:
Backend URL description:
Shopify store description:
Cartaisy Store id:
Webhook topics tested:
Guest attribution tested: yes/no
Customer attribution tested: yes/no

Summary:

Pass/fail matrix:

Failures/blockers:

Follow-up issues:
```

## Current Execution Status

No smoke run was executed as part of issue #99. This document adds the
repeatable runbook and evidence table only. Successful checkout URL generation
and order webhook reconciliation remain pending until an operator runs the
smoke test against an approved Shopify development or generated-test-data store
and records the result.
