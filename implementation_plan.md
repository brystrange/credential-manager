# Lemon Squeezy Subscription Integration — Fort Knox

## Overview

This plan integrates a **Lemon Squeezy subscription billing system** into Fort Knox using its existing Firebase + React (Vite) stack. The approach uses:
- **Lemon Squeezy** as the payment/subscription provider (checkout + billing portal)
- **Firebase Cloud Functions** for secure server-side webhook handling and checkout URL generation
- **Firestore** to store subscription status per user
- **Frontend React** for a pricing page, upgrade prompts, and plan-gating logic

---

## User Review Required

> [!IMPORTANT]
> **Plan tiers**: The plan below proposes **Free** and **Pro** tiers. You'll need to decide on the specific limits. Suggested defaults are listed — please confirm or override them before implementation.
>
> | Feature | Free | Pro |
> |---|---|---|
> | Credential entries | Up to 10 | Unlimited |
> | Password history | Last 3 revisions | Full history |
> | Platforms | All | All |
> | Price | $0/mo | $X/mo |
>
> **You must create the products/variants in your Lemon Squeezy dashboard first** and provide:
> - Your **Store ID**
> - Your **API Key** (for server-side API calls)
> - The **Variant ID** for the Pro Monthly plan (and optionally Pro Annual)
> - Your **Webhook Signing Secret**

> [!WARNING]
> The current `firestore.rules` enforces a strict `hasMaxFields(5)` limit on `/users/{userId}`. The subscription fields (`plan`, `subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`) added to the user doc will require this limit to be raised to `9` and the update rule to be relaxed for those specific fields. This is handled safely in the plan via admin-SDK writes from Cloud Functions only.

---

## Open Questions

> [!IMPORTANT]
> 1. **Pricing**: What should the Pro plan cost (monthly / annually)?
> 2. **Free tier limit**: Is 10 credentials the right cap? Would you prefer a different number?
> 3. **Grandfathering**: Should existing users be grandfathered into Pro (unlimited) for free?
> 4. **Annual plan**: Do you want a discounted annual billing option in addition to monthly?
> 5. **Cancellation behavior**: When a Pro subscription is cancelled, should the user immediately drop to Free or keep Pro until the billing period ends? (Lemon Squeezy handles the `subscription_expired` event for this)

---

## Architecture Diagram

```
User clicks "Upgrade"
       │
       ▼
[Cloud Function: createCheckoutSession]
  - Receives Firebase UID
  - Calls Lemon Squeezy API to create a checkout session
    with custom_data: { user_id: firebaseUID }
  - Returns checkout URL
       │
       ▼
[Lemon Squeezy Checkout Page]
  - User completes payment
       │
       ▼
[Lemon Squeezy → Webhook POST]
  - Hits Cloud Function: lemonWebhook
  - Verifies X-Signature with HMAC-SHA256
  - Extracts meta.custom_data.user_id
  - Updates Firestore /users/{uid}:
      plan: "pro"
      subscriptionId: "..."
      subscriptionStatus: "active"
      currentPeriodEnd: <timestamp>
       │
       ▼
[Client reads Firestore user doc]
  - Determines plan gating
  - Shows/hides upgrade prompts
```

---

## Proposed Changes

### 1. Lemon Squeezy Dashboard Setup (Manual — you do this)

Before any code is written, in your Lemon Squeezy dashboard:
1. Create a **Store** → note your **Store ID**
2. Create a **Product** called "Fort Knox Pro"
3. Add a **Variant** for "Monthly" (and optionally "Annual")  
4. Note the **Variant ID(s)**
5. Create an **API Key** with full access
6. Create a **Webhook** pointing to your Firebase Function URL with events:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_expired`
   - `subscription_resumed`
7. Note the **Webhook Signing Secret**

---

### 2. Firebase Cloud Functions

#### [MODIFY] [index.ts](file:///c:/Users/Intel%20Core%20i5/OneDrive/Desktop/Honeycomb/Scratch/credential-manager/functions/src/index.ts)

Add two new HTTP functions alongside the existing callable functions:

**`createCheckoutSession` (onCall)**
- Called from the frontend when a user clicks "Upgrade"
- Accepts `{ variantId }` from the client
- Makes an authenticated POST request to `https://api.lemonsqueezy.com/v1/checkouts`
- Passes `checkout_data.custom.user_id = request.auth.uid` and `checkout_data.email = user.email`
- Returns `{ checkoutUrl }` to the client
- Requires: `LEMONSQUEEZY_API_KEY` and `LEMONSQUEEZY_STORE_ID` env vars

**`lemonWebhook` (onRequest — raw HTTP, NOT onCall)**
- Public HTTPS endpoint for Lemon Squeezy to POST to
- **Does NOT use `express.json()` before signature check** — reads raw body buffer
- Verifies `X-Signature` header using `HMAC-SHA256(rawBody, LEMONSQUEEZY_WEBHOOK_SECRET)`
- Handles events:
  - `subscription_created` → set `plan: "pro"`, `subscriptionStatus: "active"`
  - `subscription_updated` → update status and `currentPeriodEnd`
  - `subscription_cancelled` → set `subscriptionStatus: "cancelled"` (keeps Pro until expiry)
  - `subscription_expired` → set `plan: "free"`, `subscriptionStatus: "expired"`
  - `subscription_resumed` → restore `plan: "pro"`, `subscriptionStatus: "active"`
- Always responds HTTP 200 immediately

**`createBillingPortalSession` (onCall)**
- Accepts `{ subscriptionId }` 
- Calls Lemon Squeezy API to get the billing portal URL for the subscription
- Returns `{ portalUrl }` so the user can manage/cancel their subscription

---

### 3. Environment Variables

#### [MODIFY] Firebase Functions environment config

Set the following secrets via `firebase functions:secrets:set`:
```
LEMONSQUEEZY_API_KEY
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_WEBHOOK_SECRET
LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID
LEMONSQUEEZY_PRO_ANNUAL_VARIANT_ID   (optional)
```

These are accessed in the function via `process.env.*` (Firebase Functions v2 secret manager).

---

### 4. Firestore

#### [MODIFY] [firestore.rules](file:///c:/Users/Intel%20Core%20i5/OneDrive/Desktop/Honeycomb/Scratch/credential-manager/firestore.rules)

- Raise `hasMaxFields` on `/users/{userId}` from `5` → `9`
- Allow client to **read** new subscription fields (already allowed via `allow read`)
- Subscription fields are written **only by Cloud Functions (Admin SDK)**, so client-side write rules do not need to change — the admin SDK bypasses Firestore rules entirely

New fields written to `/users/{uid}` by the webhook function:
```
plan: "free" | "pro"
subscriptionId: string          // LS subscription ID
subscriptionStatus: string      // "active" | "cancelled" | "expired" | "on_trial"
currentPeriodEnd: timestamp
lsCustomerId: string            // Lemon Squeezy customer ID
```

---

### 5. Frontend — New Service

#### [NEW] `src/services/subscriptionService.ts`

- `getSubscription(uid)` — reads `/users/{uid}` and returns `{ plan, subscriptionStatus, currentPeriodEnd }`
- `createCheckout(variantId)` — calls `createCheckoutSession` Cloud Function, redirects to checkout URL
- `openBillingPortal(subscriptionId)` — calls `createBillingPortalSession`, opens URL

---

### 6. Frontend — Subscription Context

#### [NEW] `src/context/SubscriptionContext.tsx`

- Provides `{ plan, status, isPro, credentialLimit, isAtLimit }` to all components
- Reads from Firestore in real-time (`onSnapshot`) on `/users/{uid}` after vault unlock
- `isPro` = `plan === "pro" && status === "active"`
- `credentialLimit` = `isPro ? Infinity : 10`
- `isAtLimit` = `credentials.length >= credentialLimit`

---

### 7. Frontend — Pricing / Upgrade Page

#### [NEW] `src/components/PricingPage.tsx`

A beautiful, full-screen pricing page with:
- **Free tier card** — current plan badge if on Free
- **Pro tier card** — highlighted, "Most Popular" badge, upgrade CTA button
- Clicking "Upgrade" calls `createCheckout()` → redirects to Lemon Squeezy hosted checkout
- Manage Subscription / Cancel link (opens billing portal) for Pro users

---

### 8. Frontend — Plan Gating

#### [MODIFY] `src/App.tsx`

- Wrap app with `SubscriptionProvider`
- Pass `credentials.length` into context
- FAB / "Add credential" button: disabled with tooltip "Upgrade to Pro to add more" when `isAtLimit`
- Show a soft banner at the top of the credentials list when user has 8/10 (near limit)

#### [MODIFY] `src/components/CredentialModal.tsx` (if it exists)

- Block submission if `isAtLimit` for new credentials (as a safety net)

---

### 9. Frontend — Sidebar / Settings

#### [MODIFY] `src/App.tsx` (Sidebar section)

- Add a "Plan" section in the sidebar showing:
  - **Free**: "Free Plan — 10 credential limit" + "Upgrade to Pro →" link
  - **Pro**: "Pro Plan ✓" + "Manage Subscription" link

---

## Verification Plan

### Cloud Function Tests
- Deploy functions to Firebase, then use the Lemon Squeezy **test mode** to trigger webhooks
- Verify Firestore `/users/{uid}` fields are updated correctly after each event type
- Test signature verification: send a webhook with a bad signature, confirm it returns 403

### Manual Verification
1. Click Upgrade → confirm Lemon Squeezy checkout opens with pre-filled email
2. Complete a test checkout → confirm `plan: "pro"` appears in Firestore within seconds
3. Add >10 credentials as a Free user → confirm the 11th is blocked
4. Open billing portal → confirm subscription management works
5. Cancel a subscription in test mode → confirm `plan` reverts to `"free"` after expiry event

### Automated Tests
```bash
# Build and type-check the functions
cd functions && npm run build

# Type-check the frontend
cd .. && npx tsc --noEmit
```
