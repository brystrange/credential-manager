# Security Hardening — Fort Knox Credential Manager

Implement all security recommendations from the audit: environment variables, Firebase App Check, Cloud Functions for admin operations, auto-lock vault, auth rate limiting, CSP headers, and more.

## User Review Required

> [!IMPORTANT]
> **Firebase Billing Plan**: Cloud Functions require the **Blaze (pay-as-you-go)** plan. If you're on the free Spark plan, you'll need to upgrade. Do you already have the Blaze plan? Answer: Yes I have.

> [!IMPORTANT]
> **Admin Users**: Who should be the admin? I need your Firebase UID or email to set the custom claim. You can find your UID in the Firebase Console → Authentication → Users tab. Answer: Here's my UID NGq845EEJEMDZKKAPZMaSxznt5p2

> [!WARNING]
> **Breaking Change**: After these changes, the admin console will require you to log in with a Firebase account that has the `admin: true` custom claim. The old hardcoded password `gisellekobe1!` will be completely removed. Answer: Yes. But make the security code the same password as the admin's password. If the admin changes his password, the security code will be changed as well.

---

## Proposed Changes

### 1. Environment Variables & API Key Cleanup

#### [MODIFY] [.gitignore](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/.gitignore)
- Add `.env`, `.env.local`, `.env.production` to gitignore

#### [NEW] [.env](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/.env)
- Move all Firebase config values into `VITE_` prefixed env vars
- Note: These are still public in the JS bundle — the point is to keep them out of git and make it easy to swap per environment

#### [MODIFY] [firebaseConfig.ts](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/firebaseConfig.ts)
- Read config from `import.meta.env.VITE_*` instead of hardcoded values
- Initialize Firebase App Check

---

### 2. Firebase App Check

#### [MODIFY] [firebaseConfig.ts](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/firebaseConfig.ts)
- Add `initializeAppCheck()` with **reCAPTCHA v3** provider
- This ensures only requests from your real app (not cURL/Postman) reach Firebase

---

### 3. Cloud Functions for Admin Operations

#### [NEW] `functions/` directory
- `functions/package.json` — Node.js project for Cloud Functions
- `functions/tsconfig.json` — TypeScript config
- `functions/src/index.ts` — Three callable functions:
  - `addPlatform` — validates caller has `admin` claim, validates input, writes to Firestore
  - `updatePlatform` — same admin check, updates platform doc
  - `deletePlatform` — same admin check, deletes platform doc
  - `setAdminClaim` — **one-time setup** function to grant admin role (protected by a setup secret)
- `functions/src/validatePlatform.ts` — Input validation helper

---

### 4. Admin Console Rewrite

#### [MODIFY] [AdminConsole.tsx](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/components/AdminConsole.tsx)
- **Remove** hardcoded `ADMIN_KEY` completely
- **Replace** the password gate with Firebase Auth check:
  - Must be logged in
  - Must have `admin: true` custom claim (checked via `getIdTokenResult()`)
  - Shows "Access Denied" if not admin
- **Replace** direct Firestore writes with `httpsCallable()` calls to Cloud Functions
- **Replace** direct Storage upload with Cloud Function (or keep client-side with the dev-mode storage rule)

#### [MODIFY] [platformService.ts](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/services/platformService.ts)
- `addPlatform()` → calls `httpsCallable(functions, 'addPlatform')`
- `updatePlatform()` → calls `httpsCallable(functions, 'updatePlatform')`
- `deletePlatform()` → calls `httpsCallable(functions, 'deletePlatform')`
- `getPlatforms()` → stays as direct Firestore read (allowed by rules for verified users)

---

### 5. Auto-Lock Vault (Inactivity Timeout)

#### [NEW] [src/hooks/useAutoLock.ts](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/hooks/useAutoLock.ts)
- Monitors mouse/keyboard/touch events
- After **5 minutes** of inactivity, clears the encryption key and signs out
- Resets timer on any user interaction
- Shows a warning toast 30 seconds before auto-lock

#### [MODIFY] [App.tsx](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/App.tsx)
- Integrate `useAutoLock` hook when vault is unlocked
- Show auto-lock warning notification

---

### 6. Auth Rate Limiting (Exponential Backoff)

#### [NEW] [src/hooks/useLoginThrottle.ts](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/hooks/useLoginThrottle.ts)
- Tracks failed login attempts in `sessionStorage`
- After 3 failures → 10s lockout
- After 5 failures → 30s lockout
- After 8 failures → 60s lockout
- After 10+ failures → 5 min lockout
- Shows countdown timer in the UI

Answer: Please change the limiting to the below:
- Max attempt is 5.
- User can only re-login after 5-mins.
- User made another 5 failed attempts.
- System to require user to change password. Password reset email to be sent to the email address used.


#### [MODIFY] [AuthPage.tsx](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/src/components/AuthPage.tsx)
- Integrate throttle hook
- Disable submit button during lockout with countdown display

---

### 7. Security Headers

#### [MODIFY] [index.html](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/index.html)
- Add `Content-Security-Policy` meta tag
- Add `X-Content-Type-Options` meta tag

#### [MODIFY] [vercel.json](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/vercel.json)
- Add security headers:
  - `Content-Security-Policy` — restricts script/style sources
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` — prevents clickjacking
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` — disables camera, mic, geolocation
  - `Strict-Transport-Security` — enforces HTTPS

---

### 8. Firebase Project Config

#### [NEW] [firebase.json](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/firebase.json)
- Points to `firestore.rules` and `storage.rules` for deployment
- Configures Cloud Functions directory

#### [NEW] [.firebaserc](file:///c:/Users/Gerald/.gemini/antigravity/scratch/credential-manager/.firebaserc)
- Sets the default project to `fort-knox-6978d`

---

## Open Questions

> [!IMPORTANT]
> 1. **Are you on the Firebase Blaze plan?** Cloud Functions require it. If not, I can implement a lighter alternative where the admin operations stay client-side but are protected by Firestore rules checking custom claims (less secure but no Cloud Functions needed). Answer: Yes, I am.
>
> 2. **What is your Firebase user email/UID?** I need this to create the admin setup script. Alternatively, I can create a CLI command you run once to grant yourself admin. Answer: UID is NGq845EEJEMDZKKAPZMaSxznt5p2. Email address is bryankeithmayor1@gmail.com
>
> 3. **Do you have a reCAPTCHA v3 site key?** If not, I can use the Firebase App Check debug provider for development and you can set up reCAPTCHA later for production. Answer: None
>
> 4. **What is your production domain?** (e.g., `fort-knox.vercel.app`) Needed for CSP headers and API key restrictions. Answer: It's fort-knox.vercel.app but localhost: 5173 sometimes.
>
> 5. **Auto-lock timeout preference?** Default is 5 minutes. Would you prefer shorter (2 min) or longer (15 min)? Answer: Make the auto lock-out 1 hour. No auto-lockout if browser is active.

## Verification Plan

### Automated Tests
- Build the project to ensure no TypeScript errors: `npm run build`
- Verify Cloud Functions compile: `cd functions && npm run build`
- Test Firestore rules with the Firebase Emulator (if available)

### Manual Verification
- Log in as a regular user → verify credentials CRUD still works
- Navigate to `/admin-console` as a non-admin → verify "Access Denied"
- Navigate to `/admin-console` as admin → verify platform CRUD works through Cloud Functions
- Leave the app idle for 5 minutes → verify auto-lock triggers
- Fail login 5+ times → verify lockout timer appears
- View page source → confirm no hardcoded secrets
