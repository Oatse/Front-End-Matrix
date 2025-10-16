# 📊 Token System Visual Guide - FutureGuide Frontend

## 🎨 Architecture Diagrams

### 1. Token Types & Storage

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER localStorage                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🔑 Firebase ID Token (Auth V2)                                  │
│  ├─ authV2_idToken: "eyJhbGc..."                                │
│  ├─ token: "eyJhbGc..." (fallback)                              │
│  └─ auth_token: "eyJhbGc..." (fallback)                         │
│                                                                   │
│  🔄 Firebase Refresh Token                                       │
│  └─ authV2_refreshToken: "AMf-vBz..."                           │
│                                                                   │
│  📝 Token Metadata                                               │
│  ├─ authV2_tokenIssuedAt: "1704844800"                          │
│  ├─ authV2_userId: "firebase-uid-123"                           │
│  └─ auth_version: "v2"                                          │
│                                                                   │
│  👤 User Data                                                    │
│  ├─ user: '{"id":"...","email":"...","name":"..."}'             │
│  └─ (Additional user fields)                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         │ Also stored in:
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER Cookie                                │
├─────────────────────────────────────────────────────────────────┤
│  token=eyJhbGc...; path=/; max-age=3600; SameSite=Lax          │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. Token Lifecycle Timeline

```
Token Age (minutes)
│
0  ────────────────────────────────────── 50 ────── 60
│                                          │         │
│                                          │         │
Login                                   REFRESH   EXPIRE
│                                          │         │
│                                          │         │
▼                                          ▼         ▼

┌──────────────────────────────────────────────────────────────┐
│  Phase 1: Fresh Token (0-49 minutes)                         │
│  ✓ Token valid                                               │
│  ✓ All API calls work                                        │
│  ✓ No action needed                                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Phase 2: Near Expiry (50-59 minutes)                        │
│  ⚠️ Token about to expire                                     │
│  🔄 Auto-refresh triggered                                    │
│  ✓ Get new ID Token + Refresh Token                          │
│  ✓ Update all storage locations                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Phase 3: Expired (60+ minutes)                              │
│  ❌ Token expired (should never reach here)                   │
│  ❌ API calls return 401                                      │
│  🔄 Emergency refresh or logout                               │
└──────────────────────────────────────────────────────────────┘


Auto-Check Points (every 5 minutes):
    5    10   15   20   25   30   35   40   45   50   55
    ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓
   OK   OK   OK   OK   OK   OK   OK   OK   OK  🔄  OK
                                            REFRESH!
```

---

### 3. Login & Token Storage Flow

```
┌─────────┐
│  USER   │
└────┬────┘
     │ 1. Enter email & password
     ▼
┌─────────────────┐
│  Login Form     │
│  (Frontend)     │
└────┬────────────┘
     │ 2. POST /api/auth/v2/login
     │    { email, password }
     ▼
┌─────────────────┐
│ authV2Service   │
│ (Auth API)      │
└────┬────────────┘
     │ 3. Validate credentials
     ▼
┌─────────────────┐
│  Backend API    │
│  (Firebase)     │
└────┬────────────┘
     │ 4. Return tokens
     │    {
     │      idToken: "ey...",
     │      refreshToken: "AM...",
     │      uid: "user-123",
     │      email: "user@example.com"
     │    }
     ▼
┌─────────────────┐
│  tokenService   │
│  storeTokens()  │
└────┬────────────┘
     │ 5. Store in multiple locations
     ├──────────────────────────────┐
     │                              │
     ▼                              ▼
┌──────────────┐           ┌──────────────┐
│ localStorage │           │   Cookie     │
│              │           │              │
│ authV2_      │           │ token=ey...  │
│ idToken      │           │              │
│              │           └──────────────┘
│ authV2_      │
│ refreshToken │
│              │
│ token (v1)   │
│              │
│ auth_token   │
└──────────────┘
     │
     │ 6. Notify AuthContext
     ▼
┌─────────────────┐
│  AuthContext    │
│  setUser()      │
│  setToken()     │
│  setAuthVersion │
└────┬────────────┘
     │ 7. Start auto-refresh
     ▼
┌─────────────────┐
│ useTokenRefresh │
│ startTimer()    │
└─────────────────┘
```

---

### 4. Auto-Refresh Mechanism

```
┌─────────────────────────────────────────────────────────────┐
│         useTokenRefresh Hook (Background Timer)              │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Interval: Every 5 minutes
                           ▼
                 ┌──────────────────┐
                 │  Check Token Age │
                 └────────┬─────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
  ┌─────────────┐                  ┌─────────────┐
  │ Age < 50min │                  │ Age >= 50min│
  │             │                  │             │
  │ ✓ Still OK  │                  │ ⚠️ Need     │
  │             │                  │   Refresh   │
  └─────┬───────┘                  └─────┬───────┘
        │                                │
        │ Wait 5 more minutes            │
        │                                ▼
        │                     ┌──────────────────┐
        │                     │ tokenService.    │
        │                     │ refreshAuthToken │
        │                     └────────┬─────────┘
        │                              │
        │                              │ Check: Is refresh
        │                              │ already in progress?
        │                              │
        │              ┌───────────────┴───────────────┐
        │              │                               │
        │              ▼                               ▼
        │    ┌──────────────────┐          ┌──────────────────┐
        │    │ Yes: Reuse       │          │ No: Start new    │
        │    │ existing promise │          │ refresh request  │
        │    └──────────────────┘          └────────┬─────────┘
        │                                           │
        │                                           ▼
        │                               ┌──────────────────────┐
        │                               │ POST /api/auth/v2/   │
        │                               │ refresh              │
        │                               │ { refreshToken }     │
        │                               └────────┬─────────────┘
        │                                        │
        │                                        │ Response:
        │                                        │ { idToken,
        │                                        │   refreshToken }
        │                                        ▼
        │                               ┌──────────────────────┐
        │                               │ Update localStorage  │
        │                               │ + Cookie             │
        │                               └────────┬─────────────┘
        │                                        │
        │                                        ▼
        │                               ┌──────────────────────┐
        │                               │ ✅ Success           │
        │                               │ Reset token age to 0 │
        │                               └──────────────────────┘
        │                                        │
        └────────────────────────────────────────┘
                                                 │
                                                 │ Continue loop
                                                 ▼
                                    [Wait 5 minutes, repeat]
```

---

### 5. API Request with Token

```
┌──────────────┐
│  Component   │  (e.g., Dashboard, Profile, Assessment)
└──────┬───────┘
       │ 1. Make API call
       │    getProfile()
       ▼
┌──────────────┐
│  API Service │  (apiService, assessmentService, etc.)
└──────┬───────┘
       │ 2. Get token
       │    tokenService.getIdToken()
       ▼
┌──────────────────────────────────────────────┐
│  tokenService.getIdToken()                   │
│                                              │
│  Priority Check:                             │
│  1. authV2_idToken ────────────┐            │
│  2. token (fallback)           │            │
│  3. auth_token (fallback)      │            │
└───────────────────┬────────────┘            │
                    │                          │
                    │ Return token             │
                    ▼                          │
            ┌────────────────┐                │
            │ Add to header: │                │
            │ Authorization: │                │
            │ Bearer ey...   │                │
            └───────┬────────┘                │
                    │                          │
                    │ 3. Send request          │
                    ▼                          │
            ┌──────────────┐                  │
            │  Backend API │                  │
            └───────┬──────┘                  │
                    │                          │
        ┌───────────┴───────────┐            │
        │                       │            │
        ▼                       ▼            │
┌──────────────┐        ┌──────────────┐    │
│ 200 Success  │        │ 401 Expired  │    │
│              │        │              │    │
│ Return data  │        │ Token expired│    │
└──────┬───────┘        └──────┬───────┘    │
       │                       │             │
       │                       │ 4. Refresh? │
       │                       ▼             │
       │              ┌──────────────────┐   │
       │              │ Auto-refresh     │   │
       │              │ or redirect to   │   │
       │              │ login            │   │
       │              └──────────────────┘   │
       │                                     │
       ▼                                     │
┌──────────────┐                            │
│  Component   │                            │
│  receives    │                            │
│  data        │                            │
└──────────────┘                            │
```

---

### 6. Race Condition Protection

```
Multiple Components Making Concurrent Requests:

Component A          Component B          Component C
    │                    │                    │
    │ API Request        │ API Request        │ API Request
    │ (needs token)      │ (needs token)      │ (needs token)
    ▼                    ▼                    ▼
┌────────────────────────────────────────────────────┐
│         tokenService.refreshAuthToken()            │
│                                                    │
│  ┌──────────────────────────────────────┐        │
│  │  if (this.refreshPromise) {           │        │
│  │    return this.refreshPromise;  <───────────┐ │
│  │  }                                   │       │ │
│  │                                      │       │ │
│  │  this.refreshPromise = (async () => {│       │ │
│  │    // Perform refresh once          │       │ │
│  │  })();                              │       │ │
│  │                                      │       │ │
│  │  return this.refreshPromise;        │       │ │
│  └──────────────────────────────────────┘       │ │
│           │                                      │ │
│           │ First call: Start refresh           │ │
│           │                                      │ │
│           ▼                                      │ │
│  ┌──────────────────────┐                       │ │
│  │ POST /api/auth/v2/   │                       │ │
│  │ refresh              │                       │ │
│  └──────────┬───────────┘                       │ │
│             │                                    │ │
│             │ During refresh...                 │ │
│             │                                    │ │
│             │ Second call: ─────────────────────┘ │
│             │ Reuse same promise                  │
│             │                                     │
│             │ Third call: ────────────────────────┘
│             │ Reuse same promise
│             │
│             ▼
│  ┌──────────────────────┐
│  │ Refresh completes    │
│  │ New token stored     │
│  └──────────┬───────────┘
│             │
│             │ All callers get same result
│             ▼
└──────────────────────────────────────────────────┘
    │                    │                    │
    │ Same token         │ Same token         │ Same token
    ▼                    ▼                    ▼
Component A          Component B          Component C
(proceed)            (proceed)            (proceed)


✅ Benefits:
• Only 1 API call instead of 3
• No race conditions
• Consistent token across components
• Reduced server load
```

---

### 7. Cross-Tab Synchronization

```
Tab 1                          localStorage                    Tab 2
─────                          ────────────                    ─────

┌──────────┐                                              ┌──────────┐
│  User    │                                              │  User    │
│  logs in │                                              │  idle    │
└────┬─────┘                                              └──────────┘
     │                                                          │
     │ Login success                                            │
     ▼                                                          │
┌──────────┐                                                   │
│ Store    │─────────────────────────────────────────┐         │
│ new      │  localStorage.setItem('token', ...)     │         │
│ token    │                                         │         │
└──────────┘                                         │         │
                                                     ▼         │
                           ┌────────────────────────────┐     │
                           │  Storage Event Fired       │     │
                           │  (cross-tab notification)  │     │
                           └────────────┬───────────────┘     │
                                        │                     │
                                        │ Event detected      │
                                        └─────────────────────▼
                                                        ┌──────────┐
                                                        │ Listen   │
                                                        │ storage  │
                                                        │ event    │
                                                        └────┬─────┘
                                                             │
                                    ┌────────────────────────┴─────────────────┐
                                    │                                          │
                                    ▼                                          ▼
                          ┌──────────────────┐                      ┌──────────────────┐
                          │ Token removed?   │                      │ Token changed?   │
                          │ (logout)         │                      │ (different user) │
                          └────────┬─────────┘                      └────────┬─────────┘
                                   │                                         │
                                   │ Yes                                     │ Yes
                                   ▼                                         ▼
                          ┌──────────────────┐                      ┌──────────────────┐
                          │ Clear user data  │                      │ Update user data │
                          │ Redirect to /auth│                      │ Sync state       │
                          └──────────────────┘                      └──────────────────┘


Scenario 1: Logout in Tab 1
─────────────────────────────
Tab 1: User clicks logout
→ localStorage.removeItem('token')
→ Storage event fired
→ Tab 2: Detects token removal
→ Tab 2: Auto-logout + redirect


Scenario 2: Different User Login in Tab 1
──────────────────────────────────────────
Tab 1: User A logs out, User B logs in
→ localStorage.setItem('token', 'new-token-for-user-b')
→ Storage event fired
→ Tab 2: Detects different token
→ Tab 2: Clear SWR cache
→ Tab 2: Update state to User B
→ Tab 2: Refresh data


✅ Benefits:
• Consistent state across tabs
• Automatic logout sync
• Prevents cross-user data leakage
• No manual refresh needed
```

---

### 8. Configuration Impact Visualization

```
Current Configuration:
────────────────────────

tokenExpiry = 3600s (60 minutes)
refreshBeforeExpiry = 600s (10 minutes)

Token Refresh Trigger: 3600 - 600 = 3000s = 50 minutes

Timeline:
0 min ──────────────────────────────── 50 min ─── 60 min
│                                      │          │
Login                                REFRESH    EXPIRE
                                     TRIGGERED



Alternative: 30-Minute Refresh (if changed):
─────────────────────────────────────────────

tokenExpiry = 3600s (60 minutes)
refreshBeforeExpiry = 1800s (30 minutes)  ← Changed

Token Refresh Trigger: 3600 - 1800 = 1800s = 30 minutes

Timeline:
0 min ───────────── 30 min ──────────────────── 60 min
│                   │                           │
Login             REFRESH                     EXPIRE
                  TRIGGERED


Comparison:
───────────

Current (50 min):
✓ 1 refresh per hour
✓ Less API calls
✓ 10-min safety buffer
✗ Not exactly 30 min as expected

Alternative (30 min):
✓ More frequent refresh
✓ 30-min safety buffer
✓ Matches expectation
✗ 2 refreshes per hour
✗ More API calls
```

---

### 9. Error Handling Flow

```
┌─────────────────┐
│  API Request    │
└────────┬────────┘
         │
         │ Include token in header
         ▼
┌─────────────────┐
│  Backend API    │
└────────┬────────┘
         │
    ┌────┴────────────────────────┐
    │                             │
    ▼                             ▼
┌─────────┐                  ┌─────────┐
│ Success │                  │  Error  │
│ 200 OK  │                  │         │
└─────────┘                  └────┬────┘
                                  │
                     ┌────────────┼────────────┐
                     │            │            │
                     ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │401 Token │ │ 403      │ │ 500      │
              │ Expired  │ │Forbidden │ │ Server   │
              │          │ │          │ │ Error    │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │            │            │
                   ▼            ▼            ▼
         ┌──────────────┐ ┌──────────┐ ┌──────────┐
         │ Try refresh  │ │ Show     │ │ Retry    │
         │ token        │ │ error    │ │ with     │
         │              │ │          │ │ backoff  │
         └──────┬───────┘ └──────────┘ └──────────┘
                │
    ┌───────────┴────────────┐
    │                        │
    ▼                        ▼
┌────────────┐         ┌────────────┐
│ Refresh    │         │ Refresh    │
│ Success    │         │ Failed     │
│            │         │            │
│ Retry      │         │ Clear      │
│ original   │         │ tokens     │
│ request    │         │ Redirect   │
│            │         │ to login   │
└────────────┘         └────────────┘
```

---

### 10. Memory Management & Cleanup

```
Component Lifecycle:
────────────────────

MOUNT:
┌──────────────┐
│  Component   │
│  mounts      │
└──────┬───────┘
       │
       │ useEffect(() => {
       ▼
┌──────────────────────┐
│ useTokenRefresh      │
│ startRefreshTimer()  │
└──────┬───────────────┘
       │
       │ Set interval ID
       ▼
┌──────────────────────┐
│ intervalRef.current  │
│ = setInterval(...)   │
└──────────────────────┘


ACTIVE:
┌──────────────────────┐
│ Timer running        │
│ Check every 5 min    │
│ Memory: ~1KB         │
└──────────────────────┘


UNMOUNT:
┌──────────────┐
│  Component   │
│  unmounts    │
└──────┬───────┘
       │
       │ useEffect cleanup
       ▼
┌──────────────────────┐
│ useTokenRefresh      │
│ stopRefreshTimer()   │
└──────┬───────────────┘
       │
       │ Clear interval
       ▼
┌──────────────────────┐
│ clearInterval(       │
│   intervalRef.current│
│ )                    │
└──────┬───────────────┘
       │
       │ Set to null
       ▼
┌──────────────────────┐
│ intervalRef.current  │
│ = null               │
└──────────────────────┘


✅ Memory Leak Prevention:
• Interval cleared on unmount
• References set to null
• No dangling timers
• No memory leaks
```

---

## 📝 Quick Reference Card

```
╔════════════════════════════════════════════════════════════╗
║              TOKEN SYSTEM QUICK REFERENCE                  ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📦 STORAGE LOCATIONS:                                     ║
║  • authV2_idToken       (primary)                         ║
║  • token                (fallback v1)                     ║
║  • auth_token           (fallback v2)                     ║
║  • authV2_refreshToken  (refresh)                         ║
║                                                            ║
║  ⏱️ TIMING:                                                ║
║  • Token expiry:        60 minutes                        ║
║  • Refresh trigger:     50 minutes                        ║
║  • Check interval:      5 minutes                         ║
║  • Safety buffer:       10 minutes                        ║
║                                                            ║
║  🔄 AUTO-REFRESH:                                          ║
║  • Hook: useTokenRefresh.ts                               ║
║  • Config: auth-v2-config.js                              ║
║  • Service: tokenService.js                               ║
║                                                            ║
║  🛡️ SECURITY:                                              ║
║  • ✅ Race condition protection                            ║
║  • ✅ Cross-tab synchronization                            ║
║  • ✅ Request cancellation on logout                       ║
║  • ✅ Auto token clearance on 401                          ║
║                                                            ║
║  📁 KEY FILES:                                             ║
║  • src/services/tokenService.js                           ║
║  • src/hooks/useTokenRefresh.ts                           ║
║  • src/contexts/AuthContext.tsx                           ║
║  • src/config/auth-v2-config.js                           ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

**Visual Guide Version:** 1.0  
**Last Updated:** January 9, 2025  
**See Also:** `TOKEN_SYSTEM_COMPREHENSIVE_AUDIT.md`, `TOKEN_SYSTEM_QUICK_SUMMARY.md`
