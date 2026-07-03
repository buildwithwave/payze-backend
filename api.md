# Payze Web — Backend API Specification

Everything the dashboard frontend needs, page by page. The frontend already has TypeScript types and a mock data layer for all of this (`services/catalog.ts`, `services/auth.ts`) — if the backend matches these shapes exactly, integration is a drop-in swap.

**Frontend consumer:** Next.js app, axios client at `lib/axios.ts`
**Base URL:** `NEXT_PUBLIC_API_URL` (currently `http://localhost:8000/api`)

---

## 1. Conventions

### Auth
- Bearer token: `Authorization: Bearer <token>` on every request except `/auth/*`.
- On `401` (outside `/auth/*`) the frontend clears the token and redirects to `/login` — so never return 401 for anything other than an actually invalid/expired session.

### Errors
The frontend reads `message` first, then `error`:

```json
{ "message": "A product with this barcode already exists" }
```

Use human-readable messages — they are shown directly in toasts.

### Data formats
| Thing | Format |
|---|---|
| IDs | string (uuid) |
| Dates | ISO 8601 strings (`2026-07-03T14:20:00Z`) |
| Money | number in Naira, 2dp max (e.g. `1850`, `2450000.5`) — **not kobo** |
| Pagination | `?page=1&limit=20` → `{ "data": [...], "total": 123, "page": 1, "limit": 20 }` |

### Store scoping
The user can own multiple stores (store switcher in the sidebar). Every catalog/sales resource belongs to a store. Scope via query param `?storeId=<id>` (or a `X-Store-Id` header — pick one and tell us).

---

## 2. Auth — already integrated ✅

These exist and the frontend already calls them. Listed for completeness.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ token, ... }` |
| POST | `/auth/check-email` | `{ email }` | `{ exists: boolean }` |
| POST | `/auth/register` | `{ email, firstName, lastName, businessName, phone, password }` | `{ token, ... }` |
| GET | `/auth/users/me` | — | `User` |

```ts
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phone: string;
}
```

---

## 3. Stores — sidebar store switcher

**UI:** dropdown listing the user's stores, switch active store, create a new store.

| Method | Path | Description |
|---|---|---|
| GET | `/stores` | List the user's stores |
| POST | `/stores` | Create store `{ name }` |
| PATCH | `/stores/:id` | Rename / update store |

```ts
interface Store {
  id: string;
  name: string;          // "Onigbinde Stores"
  createdAt: string;
}
```

---

## 4. Wallet — dashboard home (`/dashboard`)

**UI:** balance with show/hide, virtual account number + bank for receiving transfers, "earned this week" summary with % change, and Receive / Send / Withdraw actions.

### GET `/wallet`
```json
{
  "balance": 2450000.00,
  "currency": "NGN",
  "accountNumber": "8012345678",
  "bankName": "Nomba MFB",
  "accountName": "Onigbinde Stores"
}
```

### GET `/wallet/summary?period=week`
Powers the "Earned this week" tile.
```json
{
  "total": 639000,
  "changePercent": 18,
  "period": "week"
}
```

### POST `/wallet/withdraw`
```json
{ "amount": 50000, "bankCode": "058", "accountNumber": "0123456789" }
```
Response: the created transaction (see §8). Will also need:
- GET `/banks` — list of banks for the withdraw form
- POST `/wallet/resolve-account` — `{ bankCode, accountNumber }` → `{ accountName }` (name enquiry before withdraw)

*(Send/transfer out can share the withdraw shape; Receive is just displaying the virtual account — no endpoint needed beyond GET `/wallet`.)*

---

## 5. Dashboard metrics — home (`/dashboard`)

### GET `/metrics/overview?storeId=...`
Powers the four stat cards.
```json
{
  "products": 128,
  "orders": 342,
  "stores": 2,
  "invoices": 342
}
```

### GET `/metrics/sales-trend?storeId=...&range=1Y`
Powers the sales line chart. `range` ∈ `7D | 1M | 3M | 6M | 1Y`.
Return buckets appropriate to the range (days for 7D/1M, months for 6M/1Y):
```json
{
  "range": "1Y",
  "points": [
    { "label": "Jan", "date": "2026-01-01", "sales": 120000 },
    { "label": "Feb", "date": "2026-02-01", "sales": 340000 }
  ]
}
```

---

## 6. Products — catalogue (`/dashboard/products`)

**UI:** searchable/filterable product table, add/edit form (name, category, selling price, cost price, stock, low-stock threshold, barcode with auto-generate, optional photo), delete with confirmation. Category filter chips are derived from the products' categories.

```ts
interface Product {
  id: string;
  name: string;
  category: string;          // free text, e.g. "Groceries"
  price: number;             // selling price, > 0
  costPrice?: number;        // optional
  stock: number;             // integer ≥ 0
  lowStockThreshold: number; // for "low stock" indicator
  barcode: string;           // unique per store
  image?: string;            // URL after upload
  createdAt: string;
  updatedAt: string;
}
```

| Method | Path | Notes |
|---|---|---|
| GET | `/products?storeId=...&search=&category=&page=&limit=` | `search` matches name **and** barcode. Sort newest first by default. |
| POST | `/products` | Body = all fields except `id/createdAt/updatedAt`. If `barcode` empty, server generates one (13-digit, unique). |
| PATCH | `/products/:id` | Partial update |
| DELETE | `/products/:id` | Must **not** break existing invoices (invoices store denormalized name/price — see §7) |
| GET | `/products/barcode/:code?storeId=...` | Exact barcode lookup for the POS scanner. 404 if no match. |

**Validation (server-side, mirrors the form):**
- `name` required, non-empty
- `category` required
- `price` > 0
- `stock` ≥ 0
- `barcode` unique **per store** → `409` with `{ "message": "A product with this barcode already exists" }`

### Product images
POST `/uploads` (multipart) → `{ "url": "https://..." }`, then the URL goes in `product.image`. Frontend downsizes to ~160px before upload, so files are small.

---

## 7. Point of Sale + Invoices (`/dashboard/pos`, `/dashboard/invoices`)

**UI flow:** cashier builds a cart (tap or barcode scan) → optional customer name + discount → picks payment method (cash / transfer / card) → for cash, enters amount received and we show change → sale completes → printable receipt. Invoices page lists every past sale and re-opens receipts.

### POST `/sales/checkout`
The critical endpoint. Must be **atomic**: validate stock, decrement stock, create invoice, all-or-nothing.

Request:
```json
{
  "storeId": "…",
  "items": [
    { "productId": "…", "quantity": 2 }
  ],
  "discount": 500,
  "paymentMethod": "cash",          // "cash" | "transfer" | "card"
  "amountTendered": 5000,           // required when paymentMethod = "cash"
  "customerName": "Ada"             // optional
}
```

Server computes prices from the DB (never trust client prices), then responds with the full invoice:

```ts
interface Invoice {
  id: string;
  number: string;            // sequential per store: "INV-0001"
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;             // subtotal - discount, floor 0
  paymentMethod: "cash" | "transfer" | "card";
  amountTendered?: number;   // cash only
  change?: number;           // cash only: amountTendered - total
  customerName?: string;
  createdAt: string;
}

interface InvoiceItem {
  productId: string;
  name: string;              // denormalized snapshot at time of sale
  price: number;             // denormalized snapshot at time of sale
  quantity: number;
}
```

**Failure cases:**
- Insufficient stock → `409` `{ "message": "Only 3 of Peak Milk Tin 170g available" }`
- Empty cart → `400` `{ "message": "Cart is empty" }`
- Cash with `amountTendered < total` → `400`

**Important:** items snapshot `name` and `price` at sale time, so editing/deleting a product later never changes historical invoices.

### Invoices
| Method | Path | Notes |
|---|---|---|
| GET | `/invoices?storeId=...&search=&page=&limit=` | `search` matches invoice number, customer name, and item names. Newest first. |
| GET | `/invoices/:id` | Single invoice (receipt view) |

---

## 8. Payments (`/dashboard/payments`)

Page not built yet — this is the planned shape so it can be designed together. It will list wallet transactions (transfers in from customers, withdrawals out, POS card settlements).

### GET `/transactions?storeId=...&type=&page=&limit=`
```ts
interface Transaction {
  id: string;
  type: "credit" | "debit";
  channel: "transfer" | "card" | "withdrawal";
  amount: number;
  reference: string;
  counterparty?: string;     // payer name / destination account
  status: "pending" | "successful" | "failed";
  createdAt: string;
}
```

*(If transfers into the virtual account should auto-confirm POS "transfer" payments later, we'll also want a webhook/event we can subscribe to — flagging for discussion, not needed for v1.)*

---

## 9. Settings (`/dashboard/settings`)

Minimal for now:

| Method | Path | Body |
|---|---|---|
| PATCH | `/auth/users/me` | `{ firstName?, lastName?, businessName?, phone? }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` |

---

## 10. Suggested build order (what unblocks the frontend fastest)

1. **Stores** (§3) — everything else is scoped to a store
2. **Products CRUD + barcode lookup** (§6) — catalogue page is fully built and waiting
3. **Checkout + invoices** (§7) — POS and invoices pages are fully built and waiting
4. **Metrics** (§5) — dashboard stat cards + chart
5. **Wallet** (§4) — balance/summary first; withdraw + name enquiry after
6. Uploads (§6), transactions (§8), settings (§9)

The frontend currently runs all of §5–§7 against a localStorage mock with these exact shapes, so anything delivered in this contract can be wired up same-day.
