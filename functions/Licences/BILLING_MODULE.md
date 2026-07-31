# Stripe Guide 

After creating a product on stripe, add the following metadata to the product.

* **tierID:** This is required and sets the tier of the product.
* **public:** If set to "true", the product will apear on the squidly products page.
* **trialPeriod:** This is the amount of days the user will be given after purchasing the product.
* **forceTrial:** If set to "true" the trial period will be applied even if the user has already purchased another licence.

For each price, make sure to add a description and lookup_key 

# Billing Module Walkthrough

This document explains exactly how the Stripe billing flow works in this codebase, from Firebase entrypoints to licence updates in Realtime Database.

## 1) Where it is wired in

- Top-level export: [functions/index.js](../index.js#L18)
- Public Stripe wrapper: [functions/Licences/stripe-billing.js](./stripe-billing.js#L60)
- Core billing logic: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L31)

## 2) Public entrypoints

### webhook (test)

- Defined in [functions/Licences/stripe-billing.js](./stripe-billing.js#L78)
- Calls webhookHandler(req, res, true)

### webhookLive (live)

- Defined in [functions/Licences/stripe-billing.js](./stripe-billing.js#L85)
- Calls webhookHandler(req, res, false)

### createLicenceCheckout (callable)

- Defined in [functions/Licences/stripe-billing.js](./stripe-billing.js#L92)
- Validates auth and request payload
- Supports optional specialOfferToken validation and offer override
- Calls createSubscriptionCheckout({..., isTest=false, isPublic=true})

### createCustomerPortal (callable)

- Defined in [functions/Licences/stripe-billing.js](./stripe-billing.js#L131)
- Validates biller permissions on the licence
- Calls createBillingPortal(licenceID, return_url)

## 3) Checkout creation flow

Main function: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L324)

1. Reads product config from licences-settings/tier-info/{productID} and validates product + price index.
2. Resolves Stripe price ID (test/live) and normalizes seat count (max 10000, fallback to 1).
3. If licenceID is provided, treats as renewal and verifies biller-level permission.
4. Reuses existing customerID for renewals; otherwise creates a Stripe customer with metadata.
5. Applies trial policy:
   - If trialPeriod is explicitly provided and is a positive integer, it is used.
   - Otherwise, product-level trial is applied only when product.trialPeriod is a positive integer and (product.forceTrial is true or the user does not own a licence).
6. Creates embedded Stripe subscription checkout session with:
   - line items + adjustable quantity
   - required Organisation custom field
   - metadata: creatorUID, licenceID, isTest, tier
7. Returns errors + client_secret.

Relevant lines:

- Product validation: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L274)
- Quantity bounds and MAX_USER_SEATS: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L217)
- Renewal permission check: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L342)
- New customer creation: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L355)
- Trial decision: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L374)
- Session create + client secret: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L387)

## 4) Webhook subscription sync flow

Main functions:

- webhookHandler: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L489)
- onSubscriptionEvent: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L466)

### Step-by-step

1. Selects Stripe API key and signing secret based on test/live mode.
2. Verifies webhook signature using req.rawBody.
3. Handles these event types:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
4. For each handled event, loads SubscriptionDetails and syncs licence state.

## 5) SubscriptionDetails lifecycle

Class: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L36)

When built from a Stripe subscription, it captures:

- subscription item and quantity (seats)
- status
- customer ID

Then it hydrates in parallel with:

- Licence/organisation name from Checkout session custom field: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L145)
- Tier from licences-settings/price-to-tier using Stripe price ID: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L190)
- Customer metadata (licenceID, creatorUID): [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L195)

Hydration call site: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L233)

## 6) Licence existence, creation, and update

### checkLicenceExists

- Verifies metadata licenceID exists and that its customerID matches the Stripe customer.
- If mismatch or missing, marks as not matched.
- Code: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L75)

### createLicence

If not matched:

1. Reads creator user from Firebase Auth (creatorUID from Stripe metadata).
2. Creates licence in RTDB via shared helper createLicence.
3. Updates Stripe customer metadata with authoritative licenceID + creatorUID + licenceName.

Code:

- Billing create wrapper: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L110)
- Shared helper: [functions/Licences/shared.js](./shared.js#L363)

### updateLicence

If licenceID is valid and matched:

1. Uses subscription status to decide active vs suspended.
2. Calls suspendLicence with inverse of active state.
3. If active, enforces seats and tier from Stripe on the licence.

Code: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L91)

## 7) What the shared licence helpers do

### updateLicenceTier

- Updates licence tier in RTDB transactionally.
- Updates each linked user’s tier mapping for this licence.
- Recomputes each linked user’s max-tier.
- Code: [functions/Licences/shared.js](./shared.js#L582)

### updateLicenceSeats

- Updates seat count transactionally.
- If seats are reduced below current user count, removes overflow users (by sort order).
- Removes licence mappings for removed users.
- Code: [functions/Licences/shared.js](./shared.js#L630)

### suspendLicence

- Suspended: saves oldTier, sets tier=0, disabled=true.
- Unsuspended: restores tier from oldTier, disabled=false.
- Propagates current tier to each linked user and recomputes max-tier.
- Code: [functions/Licences/shared.js](./shared.js#L686)

## 8) Billing portal flow

Function: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L526)

1. Reads licence customerID and isTest from RTDB.
2. Chooses Stripe mode from isTest.
3. Creates billing portal session and returns URL.

## 9) Product/tier sync dependency

Checkout and webhook tier mapping depend on data produced by syncStripeProducts:

- Source: [functions/Licences/Stripe/sync.js](./Stripe/sync.js#L93)
- Writes:
  - licences-settings/price-to-tier
  - licences-settings/tier-info

If this sync is stale or missing, product validation or tier resolution can fail.

## 10) Billing audit (31 Jul 2026, refreshed)

### Fixed gotchas

1. Status map typo fixed.
   - STATUS_VALUES now uses incomplete correctly.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L195)

2. Logging variable scope fixed.
   - Success log now references details.creatorUID.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L476)

3. Undeclared valid assignment removed.
   - No stray valid assignment remains in the catch block.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L480)

4. Webhook acknowledgement timing fixed.
   - 200 is now sent after event processing.
   - Signature failures return 400 and processing failures return 500.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L495)

5. Create-licence failures now propagate to webhook status.
   - onSubscriptionEvent now re-throws createLicence errors after logging.
   - This allows webhookHandler to return 500, enabling Stripe retries.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L480)

6. Organisation field extraction hardened.
   - getLicenceName now guards missing sessions/custom_fields and validates text value before assignment.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L151)

7. Wrapper now awaits webhookHandler.
   - webhook and webhookLive await core handler execution.
   - Locations: [functions/Licences/stripe-billing.js](./stripe-billing.js#L82), [functions/Licences/stripe-billing.js](./stripe-billing.js#L89)

8. Seat-count regression fixed.
   - Wrapper now passes quantity: seats to checkout creation.
   - Location: [functions/Licences/stripe-billing.js](./stripe-billing.js#L106)

9. validateProductAndPrice invalid-price handling fixed.
   - invalid priceID now correctly sets valid=false.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L298)

10. createSpecialOffer shared-ref import fixed.
   - specialOfferRef is now imported from shared helpers.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L46)

11. createSpecialOffer token scope fixed.
   - token is declared outside the if block and safely returned.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L447)

12. Special-offer product/price validation gate fixed.
   - productID and priceIndex are now required only when no valid specialOffer is attached.
   - Location: [functions/Licences/stripe-billing.js](./stripe-billing.js#L61)

13. Quantity NaN/fractional edge-case handling improved.
   - quantity now guards NaN and rounds up fractional values before checkout creation.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L331)

14. Special-offer claimer auth path fixed.
   - Special-offer validator now reads auth from validator context and checks against auth.uid.
   - Location: [functions/Licences/stripe-billing.js](./stripe-billing.js#L44)

15. Concurrent subscription-event create race now reconciles before update.
   - When createLicence returns false (typically because a concurrent event already created the licence), onSubscriptionEvent now re-checks licence existence before calling updateLicence.
   - This prevents the second event from becoming a no-op due to stale licenceMatched=false.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L488)

### Open gotchas (still present)

1. Renewal path silently falls back to creating a new customer when customerID is missing.
   - If licenceID is provided but the licence record has no customerID, code proceeds to create a new Stripe customer.
   - Flow impact: can split billing identity for a single licence and create hard-to-reconcile customer records.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L349)
   - Recommended fix: when renewing with licenceID, fail if customerID is missing instead of creating a new customer.

2. Unknown Stripe price mapping degrades to tier 0 instead of failing fast.
   - getTier defaults to 0 when price-to-tier mapping is absent.
   - Flow impact: active subscriptions can be synced to tier 0 if mapping is stale or missing.
   - Location: [functions/Licences/Stripe/billing.js](./Stripe/billing.js#L192)
   - Recommended fix: treat missing mapping as an error and surface 500 from webhook processing.

## 11) Quick mental model

- createLicenceCheckout starts Stripe Checkout.
- Stripe emits subscription events.
- webhook/webhookLive verify + dispatch.
- onSubscriptionEvent maps Stripe subscription -> local licence.
- Licence is created (if needed), then suspended/unsuspended and synchronized for tier/seats.
