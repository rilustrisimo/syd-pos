# SYD POS - Mobile App Architecture Plan

## Overview
Split architecture: 
- **Web App** (Vercel): Back office, CRM, inventory management, reports
- **Mobile Apps** (iOS/Android): POS only (new sale, history, returns)
- **Shared API**: Single data source (Supabase)

---

## 1. Tech Stack Recommendation

### Primary Choice: React Native + Expo
**Why:**
- ✅ **Fast development**: Single codebase for iOS & Android
- ✅ **Team efficiency**: Leverage existing React knowledge
- ✅ **Stability**: Mature ecosystem (Expo is production-ready)
- ✅ **Quick iteration**: Hot reload, fast builds
- ✅ **Easy distribution**: Expo updates, EAS Build
- ✅ **Print support**: Native print modules available
- ⚠️ **Tradeoff**: Slightly larger bundle, but acceptable for internal use

### Alternative: Flutter (if you want native performance)
- 👍 Better performance, smaller bundle
- 👎 Learning curve (Dart), different team skillset
- 👎 Longer initial setup

**Recommendation: Go with React Native + Expo for speed**

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile POS App                       │
│  (React Native + Expo)                                  │
│  ├─ Sales Screen                                        │
│  ├─ History Screen                                      │
│  └─ Returns Screen                                      │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              API Client Library (@syd/api)              │
│  ├─ Auth (Supabase)                                     │
│  ├─ Products                                            │
│  ├─ Customers                                           │
│  ├─ Transactions                                        │
│  └─ Returns                                             │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│            Supabase (Single Source of Truth)            │
│  ├─ Authentication                                      │
│  ├─ RLS Policies                                        │
│  ├─ Real-time subscriptions                             │
│  └─ REST API                                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         Web App (Vercel) - Back Office                  │
│  ├─ Inventory Management                                │
│  ├─ Customer Management                                 │
│  ├─ Reports & Analytics                                 │
│  └─ Settings                                            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. API Library Design (@syd/api)

### Create a shared npm package

**Location**: `/packages/api` (monorepo structure optional)

**Key Modules**:
```typescript
// @syd/api

export { createSupabaseClient } from './supabase'
export { useProducts } from './hooks/useProducts'
export { useCustomers } from './hooks/useCustomers'
export { useTransactions } from './hooks/useTransactions'
export { useAuth } from './hooks/useAuth'

// Types
export type { Product, Customer, Transaction, TransactionLine } from './types'
```

**Responsibilities**:
- ✅ Supabase client initialization
- ✅ Authentication (login, token refresh)
- ✅ Data fetching (products, customers, transactions)
- ✅ Data mutations (create transaction, process return)
- ✅ Caching strategy (React Query)
- ✅ Error handling
- ✅ Offline support (optional, via local SQLite)

**Example structure**:
```
packages/api/
├── src/
│   ├── supabase.ts          # Client setup
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useProducts.ts
│   │   ├── useCustomers.ts
│   │   ├── useTransactions.ts
│   │   └── useReturns.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── formatting.ts
│       └── validation.ts
├── package.json
└── tsconfig.json
```

---

## 4. Mobile App Stack

### Core Dependencies
```json
{
  "dependencies": {
    "expo": "^50.0.0",
    "react": "^18.2.0",
    "react-native": "^0.73.0",
    "@react-navigation/native": "^6.x",
    "@react-navigation/bottom-tabs": "^6.x",
    "@tanstack/react-query": "^5.x",
    "@supabase/supabase-js": "^2.x",
    "zustand": "^4.x",           // State management
    "@react-native-print/print": "^0.11.x",  // Print support
    "react-native-uuid": "^2.x"
  }
}
```

### Project Structure
```
mobile-app/
├── app/
│   ├── (auth)/
│   │   └── login.tsx
│   ├── (tabs)/
│   │   ├── sales/
│   │   ├── history/
│   │   └── returns/
│   └── _layout.tsx
├── components/
│   ├── pos/
│   ├── ui/
│   └── shared/
├── hooks/
│   └── useCheckout.ts
├── store/
│   ├── auth.ts
│   └── pos.ts
├── utils/
│   └── formatting.ts
└── app.json
```

---

## 5. Thermal Printer Solution (Multi-Device Support)

### Problem: CORS in Web App
- Browser → USB/Network Printer blocked by browser security
- Current workaround: Local Node.js server fragile

### Solution for Mobile Apps
✅ **Native APIs support multiple printer types!**

#### Supported Printer Types

| Type | iOS | Android | Primary Use Case |
|------|-----|---------|------------------|
| **AirPrint (Network)** | ✅ Native | ✅ Native | Recommended, works out-of-box |
| **VOZY G80 Network** | ✅ Via IPP | ✅ Via IPP | Primary device |
| **USB (Thermal)** | ❌ No direct | ✅ android-usb-printer | Android only |
| **Bluetooth** | ✅ react-native-ble | ✅ react-native-ble | For mobile thermal printers |

#### Implementation Strategy

**Phase 1: Network Printers (VOZY G80 via WiFi)**
```typescript
// Both iOS & Android - Works great
import * as Print from 'expo-print'  // iOS
import { RNPrint } from 'react-native-print'  // Android

const handlePrint = async (receiptHTML: string) => {
  if (Platform.OS === 'ios') {
    await Print.printAsync({
      html: receiptHTML,
      printerUrl: 'ipp://192.168.1.100:631/ipp/print',  // VOZY G80 IP
      markupFormatterIOS: 'html',
    })
  } else {
    await RNPrint.print({
      html: receiptHTML,
      jobName: 'Receipt',
      printerUrl: 'ipp://192.168.1.100:631/ipp/print',
    })
  }
}
```

**Phase 2: Bluetooth Printers (if needed)**
```typescript
import { BleManager } from 'react-native-ble-plx'

// Scan & pair Bluetooth thermal printers
// Send ESC/POS commands directly
```

**Phase 3: USB Printers (Android only)**
```typescript
// android-usb-printer module
// Direct USB access for Android tablets
```

#### Printer Configuration

```typescript
// Store printer settings in app
type PrinterConfig = {
  id: string
  name: string
  type: 'airprint' | 'manual_ip' | 'bluetooth' | 'usb'
  address: string  // IP, Bluetooth MAC, or USB path
  port?: number
  isDefault: boolean
}

// UI: Settings screen to select/add printers
// Auto-discover: Show nearby AirPrint/Bluetooth printers
```

#### Recommendation
**Start Phase 1 only**: Network printing via AirPrint/IPP
- Works with VOZY G80 out-of-the-box
- No additional dependencies
- Simplest to test
- Add Bluetooth/USB in Phase 2+ if needed

---

## 6. Development Phases

### Phase 1: Setup & API Library (Week 1)
- ✅ Create `@syd/api` package
- ✅ Expose Supabase queries
- ✅ Setup authentication
- ✅ Create React Query hooks
- ✅ TypeScript type definitions

**Deliverable**: Functional API library with tests

### Phase 2: Mobile App Core (Week 2-3)
- ✅ Set up Expo project (iOS + Android)
- ✅ Implement authentication screen
- ✅ Create bottom tab navigation
- ✅ Integrate API library
- ✅ Setup Zustand stores (auth, POS, offline)
- ✅ Build basic UI components
- ✅ Inventory caching with 5-min refresh
- ✅ Network status monitoring
- ✅ AsyncStorage setup for offline queue

**Deliverable**: App structure with offline infrastructure

### Phase 3: POS Functionality (Week 3-4)
- ✅ Sales screen: product search, cart, checkout
- ✅ Payment methods
- ✅ Customer selection
- ✅ Transaction creation (with offline queue)
- ✅ Sync pending transactions when online

**Deliverable**: Can create transactions in app, offline-capable

### Phase 3.5: Offline Sync & Returns (End of Week 4)
- ✅ Implement transaction sync queue
- ✅ Handle conflicts & retry logic
- ✅ Return/refund functionality (both mobile & web)
- ✅ Allow returns from offline transactions
- ✅ Background sync while using app

**Deliverable**: App works fully offline

### Phase 4: Printing & Polish (Week 5)
- ✅ Native print integration (AirPrint/IPP)
- ✅ Printer selection configuration
- ✅ Handle print failures gracefully
- ✅ Print from offline queue
- ✅ Multi-printer support (USB, Bluetooth)

**Deliverable**: Printing works, printer selection working

### Phase 5: Testing & Distribution (Week 5)
- ✅ iOS TestFlight setup
- ✅ Android Firebase App Distribution
- ✅ Internal testing
- ✅ Bug fixes

**Deliverable**: Ready for deployment

**Total Timeline**: ~5 weeks for MVP

---

## 7. Distribution Strategy

### Not going to App Store (internal only)

#### Option A: Expo Updates (Best for rapid iteration)
```bash
eas update --channel production
```
- Push JavaScript updates without rebuilding
- 99% of changes don't need rebuild
- Super fast iteration

#### Option B: Direct Installation

**iOS**:
- TestFlight (easiest, no need to be registered)
- Alternatively: AdHoc provisioning profile

**Android**:
- Firebase App Distribution
- Or: Direct APK via Google Drive

#### Recommended Workflow
```
1. Develop locally with Expo Go
2. For TestFlight/Distribution:
   eas build --platform ios --profile production
   eas build --platform android --profile production
3. Upload to TestFlight / Firebase App Distribution
4. Share invite link via email/Drive
```

---

## 8. Security & Authentication

### Current State (Web)
- ✅ Supabase Auth already configured
- ✅ RLS policies already in place

### For Mobile App (Minimal changes needed)
- ✅ Reuse same Supabase project
- ✅ Same auth policies apply
- ✅ Token refresh handled by Supabase SDK
- ✅ Offline queue includes user_id for audit

### Extensible Role System (For Future)

**Current**: All staff have same POS permissions

**Future**: Add role-based access
```sql
-- Already extensible in existing RLS
CREATE POLICY "staff_can_create_transactions"
ON transactions
FOR INSERT
TO authenticated
USING (
  -- Currently: all authenticated users
  auth.uid() IS NOT NULL

  -- Future: role-based
  -- auth.jwt() ->> 'role' = 'pos_operator'
  -- OR auth.jwt() ->> 'role' = 'manager'
);
```

**Design**: Add `user_role` to mobile app during login, use for frontend checks (actual enforcement at RLS level)

---

## 9. Offline Capability (REQUIRED - Phase 2)

### Offline-First Architecture

**Problem**: Retail environment has intermittent connectivity

**Solution**: Queue system + cached inventory

#### Implementation

```typescript
// Local queue storage (AsyncStorage)
type QueuedTransaction = {
  id: string                    // local uuid
  status: 'pending' | 'synced'
  transaction_data: TransactionInput
  created_at: timestamp
  synced_at?: timestamp
  server_id?: string            // once synced
}

// Offline flow:
1. Create transaction → Save to local queue
2. Attempt sync immediately
3. If offline → Retry periodically (every 10s)
4. When online → Sync all pending
5. Mark as synced, get server ID
```

#### Inventory Caching Strategy

```typescript
// Cache as of every 5 minutes OR on app launch
type CachedInventory = {
  products: Product[]
  cached_at: timestamp
  is_stale: boolean
}

// When offline:
// - Show cached data with "Last updated: X mins ago"
// - Disable checkout if cache > 30 mins old (safety)
// - Auto-refresh when network returns

// When online:
// - Fresh fetch every 5 mins
// - Update cache
// - Background sync
```

#### Storage Solution

**Option A: AsyncStorage + JSON** (Simple, sufficient)
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'

await AsyncStorage.setItem('pending_transactions', JSON.stringify(queue))
await AsyncStorage.setItem('inventory_cache', JSON.stringify(products))
```

**Option B: WatermelonDB** (If complex queries needed later)
- Better for large datasets
- Can defer to Phase 2+

**Recommendation**: Start with AsyncStorage, migrate to WatermelonDB if needed

#### Sync Queue Implementation

```typescript
// useOfflineQueue.ts
export const useOfflineQueue = () => {
  const queryClient = useQueryClient()
  const [queue, setQueue] = useState<QueuedTransaction[]>([])
  const [isOnline, setIsOnline] = useState(true)

  // Monitor network
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected)
      if (state.isConnected) {
        syncQueue()  // Auto-sync when online
      }
    })
    return unsubscribe
  }, [])

  const syncQueue = async () => {
    const pending = queue.filter(t => t.status !== 'synced')
    for (const txn of pending) {
      try {
        const response = await createTransaction(txn.transaction_data)
        // Mark as synced, save server ID
        // Update local queue
        // Invalidate transaction cache
      } catch (error) {
        // Retry on next online
      }
    }
  }

  return { queue, isOnline, syncQueue }
}
```

#### Inventory Cache

```typescript
// useInventoryCache.ts
export const useInventoryCache = () => {
  const [cacheAge, setCacheAge] = useState<number>(0)
  const [isStale, setIsStale] = useState(false)

  const { data: products, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 5 * 60 * 1000,        // 5 mins
    gcTime: 30 * 60 * 1000,           // Keep 30 mins in cache
    retry: 3,
    retryDelay: 1000,
  })

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 5 * 60 * 1000)  // Every 5 mins

    return () => clearInterval(interval)
  }, [])

  return { products, cacheAge, isStale }
}
```

---

## 10. Comparison: Current Setup vs New Setup

### Before (Current)
```
Browser → Web POS ─────────┐
                           │
                    ┌──────▼─────────┐
                    │   Supabase     │
                    └────────────────┘
                           │
                    ┌──────▼─────────┐
                    │ CUPS/Printer   │ ← CORS issues
                    └────────────────┘
```

### After (New)
```
┌─────────────────┬──────────────────────┐
│                 │                      │
│  Native iOS App │  Native Android App  │
│  (React Native) │  (React Native)      │
│  + Native Print │  + Native Print      │
│                 │                      │
└────────┬────────┴──────────┬───────────┘
         │                   │
         └───────────────────┘
                   │
            ┌──────▼────────┐
            │   Supabase    │
            └───────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
 Printer      Web Back Office   CRM
(Native APIs)   (Vercel)
```

**Benefits:**
- ✅ No printer CORS issues (native APIs)
- ✅ Much better UX for POS (mobile-first)
- ✅ Faster development (code sharing)
- ✅ Easier to distribute internally
- ✅ Web app stays clean for back office

---

## 11. Implementation Checklist

### Week 1: API Library
- [ ] Create `@syd/api` package structure
- [ ] Export Supabase client
- [ ] Create hooks for products, customers, transactions, returns
- [ ] Setup TypeScript types
- [ ] Add React Query providers
- [ ] Write basic tests
- [ ] Publish to npm (private) or local file

### Week 2-3: Mobile App Core
- [ ] `expo init syd-pos-mobile`
- [ ] Setup authentication flow
- [ ] Create tab navigation layout
- [ ] Integrate @syd/api
- [ ] Setup Zustand stores (auth, POS, offline queue)
- [ ] Build product search component
- [ ] Build cart management
- [ ] Build checkout flow
- [ ] Implement AsyncStorage for offline queue
- [ ] Setup network monitoring (NetInfo)
- [ ] Implement inventory cache (5-min refresh)

### Week 3-4: POS & Returns (both mobile & web)
- [ ] Sales transaction creation
- [ ] Transaction creation with offline queue
- [ ] Return/refund dialog (mobile)
- [ ] Return/refund dialog (web - already exists, just reuse)
- [ ] Sync pending transactions when online
- [ ] Handle sync conflicts & retries
- [ ] Transaction history with offline data support
- [ ] Print from offline queue

### Week 5: Printing & Distribution
- [ ] Native print setup (expo-print iOS, RNPrint Android)
- [ ] Printer configuration screen
- [ ] Network printer discovery (AirPrint/IPP)
- [ ] Print receipt from sale
- [ ] Print receipt from history
- [ ] Handle print errors gracefully
- [ ] Setup EAS Build
- [ ] Setup TestFlight distribution
- [ ] Setup Firebase App Distribution
- [ ] Internal testing & bug fixes

---

## 12. Quick Start Command Reference

```bash
# API Library
npm create vite@latest @syd/api -- --template react-ts
cd @syd/api && npm install
# Add: @supabase/supabase-js, @tanstack/react-query, typescript

# Mobile App
npx create-expo-app syd-pos-mobile
cd syd-pos-mobile
npx expo install react-native-print
npx expo install expo-print
npm install @tanstack/react-query zustand

# Build for testing
eas build --platform ios --profile preview
eas build --platform android --profile preview

# TestFlight / Firebase Distribution
# Follow Expo docs for setup
```

---

## 13. Cost & Requirements

### Infrastructure (Already covered)
- ✅ Supabase (existing)
- ✅ Vercel (web app)

### New
- ⚠️ EAS Build (Expo): ~$10-20/month if building frequently (or free for occasional builds)
- ⚠️ Apple Developer: $99/year (if using TestFlight)
- ⚠️ Google Play: $25 (one-time, but not needed for internal distribution)

### Development
- Estimated: 3-4 weeks full-time developer
- 1 person team can do this

---

## 14. Updated Architecture with Offline Support

```
┌──────────────────────────┬──────────────────────────┐
│     iOS POS App          │    Android POS App       │
│  (React Native + Expo)   │  (React Native + Expo)   │
│                          │                          │
│  ├─ Sales (offline ✓)    │  ├─ Sales (offline ✓)   │
│  ├─ History              │  ├─ History              │
│  ├─ Returns (both)       │  ├─ Returns (both)       │
│  └─ Print (native)       │  └─ Print (native)       │
│     - AirPrint/IPP       │     - AirPrint/IPP       │
│     - Bluetooth          │     - USB/Bluetooth      │
│     - Network            │     - Network            │
│                          │                          │
│  ┌────────────────────┐  │  ┌────────────────────┐  │
│  │ AsyncStorage       │  │  │ AsyncStorage       │  │
│  │ ├─ Pending Queue   │  │  │ ├─ Pending Queue   │  │
│  │ ├─ Inv. Cache     │  │  │ ├─ Inv. Cache     │  │
│  │ └─ Auth Token      │  │  │ └─ Auth Token      │  │
│  └────────────────────┘  │  └────────────────────┘  │
└──────────┬───────────────┴──────────┬────────────────┘
           │ (Auto-sync when online)  │
           └────────────┬─────────────┘
                        │
              ┌─────────▼─────────┐
              │    Supabase       │
              │ ├─ Auth           │
              │ ├─ Products       │
              │ ├─ Customers      │
              │ ├─ Transactions   │
              │ ├─ Returns        │
              │ └─ RLS Policies   │
              └────────┬──────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
   ┌───▼──┐    ┌───────▼───────┐   ┌──▼──────┐
   │Print │    │ Web Back      │   │Thermal  │
   │APIs  │    │ Office (Ver)  │   │Printers │
   │ iOS  │    │ ├─ Customers  │   │         │
   │ Andr │    │ ├─ Inventory  │   │ VOZY    │
   │      │    │ ├─ Reports    │   │ G80+    │
   │      │    │ └─ Settings   │   │         │
   └──────┘    └───────────────┘   └─────────┘
```

## 15. Next Steps - Ready to Start Phase 1

1. **Create `@syd/api` package**
   - Setup npm package structure
   - Export Supabase client & auth hooks
   - Create React Query hooks for data fetching
   - Add TypeScript types from existing web app
   - Test with existing web app first

2. **Scaffold mobile app with Expo**
   - Create Expo project
   - Setup tab navigation (Sales / History / Returns)
   - Setup Zustand stores for state
   - Integrate `@syd/api` package

3. **Implement offline-first from the start**
   - AsyncStorage setup + migration strategy
   - Network monitoring (NetInfo)
   - Queue system for pending transactions
   - Inventory cache with 5-min refresh

4. **Build core POS flows**
   - Product search & cart
   - Checkout with offline queue
   - Auto-sync when network returns

5. **Add returns & printing**
   - Native print integration (AirPrint/IPP)
   - Printer management
   - Return flow in both apps

**Estimated timeline**: 5 weeks with 1 full-time developer

