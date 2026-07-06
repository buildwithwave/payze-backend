# Payze Backend — API Reference (as implemented)

The contract the backend actually serves, endpoint by endpoint, with request/response shapes ready to drop into the frontend's service layer. Interactive Swagger lives at `/docs`.

**Base URL:** `http://localhost:8000/api` (`NEXT_PUBLIC_API_URL`)

---

## 1. Conventions

### Auth

Every endpoint except `/auth/login`, `/auth/register`, `/auth/check-email`, and `/health` requires:

```
Authorization: Bearer <session.access_token>
```

A `401` means the token is missing/expired — the frontend should clear it and redirect to `/login`.

### Store scoping

The user can own multiple stores. Every catalog/sales/wallet resource is scoped with the **`?storeId=<uuid>` query param** (we picked the query param over the `X-Store-Id` header). Passing a store the user doesn't own returns `404 { "message": "Store not found" }`.

`POST` endpoints take `storeId` in the **body** instead (`/sales/checkout`, `/products`, `/wallet/withdraw`).

### Errors

Read `message` first, then `error`:

```json
{ "success": false, "message": "Only 3 of Peak Milk Tin 170g available" }
```

Messages are human-readable and safe to show in toasts.

### Data formats

| Thing      | Format                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| IDs        | uuid strings                                                                                            |
| Dates      | ISO 8601 (`2026-07-03T14:20:00Z`)                                                                       |
| Money      | number in Naira, 2dp max — not kobo                                                                     |
| Pagination | `?page=1&limit=20` → `{ "data": [...], "total": 123, "page": 1, "limit": 20 }` (limit is capped at 100) |

```ts
interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

---

## 2. Auth

### POST `/auth/check-email`

```ts
// Request
{
  email: string;
}
// 200
{
  exists: boolean;
}
```

### POST `/auth/register`

```ts
// Request
{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
  phone: string;
}
// 201
{
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    businessName: string;
    phone: string;
    createdAt: string;
  }
}
```

### POST `/auth/login`

```ts
// Request
{
  email: string;
  password: string;
}
// 200 — the bearer token is session.access_token
{
  message: string;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user: SupabaseUser; // raw Supabase user object
  }
}
// 401
{
  error: string;
}
```

### GET `/auth/users/me`

```ts
// 200 — raw Supabase user; profile fields live in user_metadata
{
  user: {
    id: string;
    email: string;
    user_metadata: {
      first_name: string;
      last_name: string;
      business_name: string;
      phone: string;
    }
    // ...other Supabase fields
  }
}
```

### PATCH `/auth/users/me`

```ts
// Request — all fields optional, at least one required
{ firstName?: string; lastName?: string; businessName?: string; phone?: string }
// 200 — flat camelCase user
{ id: string; email: string; firstName: string; lastName: string; businessName: string; phone: string }
```

### POST `/auth/change-password`

```ts
// Request
{
  currentPassword: string;
  newPassword: string;
} // newPassword min 8 chars
// 200
{
  message: "Password changed successfully";
}
// 400
{
  message: "Current password is incorrect";
}
```

> ⚠️ A successful password change **revokes the current session** — re-login (or redirect to `/login`) afterwards.

---

## 3. Stores

```ts
interface Store {
  id: string;
  name: string;
  createdAt: string;
}
```

| Method | Path          | Request            | Response                       |
| ------ | ------------- | ------------------ | ------------------------------ |
| GET    | `/stores`     | —                  | `200` `Store[]` (oldest first) |
| POST   | `/stores`     | `{ name: string }` | `201` `Store`                  |
| GET    | `/stores/:id` | —                  | `200` `Store`                  |
| PATCH  | `/stores/:id` | `{ name: string }` | `200` `Store`                  |

---

## 4. Products

```ts
interface Product {
  id: string;
  name: string;
  category: string; // free text, e.g. "Groceries"
  price: number; // selling price, > 0
  costPrice?: number; // omitted when not set
  stock: number; // integer ≥ 0
  lowStockThreshold: number; // default 5
  barcode: string; // unique per store; auto-generated if empty
  image?: string; // URL, omitted when not set
  createdAt: string;
  updatedAt: string;
}
```

### GET `/products?storeId=...&search=&category=&page=&limit=`

`search` matches **name and barcode** (partial, case-insensitive). `category` is an exact match. Newest first.

→ `200` `Paginated<Product>`

### POST `/products`

```ts
// Request
{
  storeId: string;
  name: string;              // required
  category: string;          // required
  price: number;             // required, > 0
  stock: number;             // required, integer ≥ 0
  costPrice?: number;
  lowStockThreshold?: number; // defaults to 5
  barcode?: string;          // empty/omitted → server generates unique 13-digit code
  image?: string;            // URL from POST /uploads
}
```

→ `201` `Product`
→ `400` validation (`"Product name is required"`, `"Price must be greater than 0"`, …)
→ `409` `{ "message": "A product with this barcode already exists" }`

### PATCH `/products/:id?storeId=...`

Partial body — any subset of the POST fields (minus `storeId`). Same validation and `409` rules.
→ `200` `Product` · `404` if not found in that store

### DELETE `/products/:id?storeId=...`

→ `204` (no body). Historical invoices are unaffected — they keep name/price snapshots.

### GET `/products/barcode/:code?storeId=...`

Exact barcode lookup for the POS scanner.
→ `200` `Product` · `404` `{ "message": "No product matches this barcode" }`

### POST `/uploads`

Multipart form-data, any field name, image ≤ 5 MB.
→ `201` `{ url: string }` — put it in `product.image`.

_(Also available: `POST /products/:id/image?storeId=...` with field `image` — uploads and attaches in one call, returns the updated `Product`.)_

---

## 5. POS Checkout + Invoices

```ts
interface Invoice {
  id: string;
  number: string; // sequential per store: "INV-0001"
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number; // subtotal - discount, floor 0
  paymentMethod: "cash" | "nomba";
  amountTendered?: number; // cash only (null/omitted otherwise)
  change?: number; // cash only: amountTendered - total
  customerName?: string;
  createdAt: string;
}

interface InvoiceItem {
  productId: string | null; // null if the product was later deleted
  name: string; // snapshot at time of sale
  price: number; // snapshot at time of sale
  quantity: number;
}
```

### POST `/sales/checkout`

Atomic: validates stock, decrements it, numbers and creates the invoice — all-or-nothing. Prices always come from the DB, never the client. Duplicate `productId` lines are merged.

```ts
// Request
{
  storeId: string;
  items: { productId: string; quantity: number }[];  // quantity ≥ 1
  discount?: number;                                  // ≥ 0, default 0
  paymentMethod: "cash" | "nomba";
  amountTendered?: number;                            // required when cash
  customerName?: string;
}
```

→ `201` `Invoice`

| Failure                        | Status | Body                                                      |
| ------------------------------ | ------ | --------------------------------------------------------- |
| Insufficient stock             | `409`  | `{ "message": "Only 3 of Peak Milk Tin 170g available" }` |
| Empty cart                     | `400`  | `{ "message": "Cart is empty" }`                          |
| Cash under-tendered            | `400`  | `{ "message": "Amount tendered is less than the total" }` |
| Unknown product / bad quantity | `400`  | human-readable `message`                                  |

### GET `/invoices?storeId=...&search=&page=&limit=`

`search` matches invoice number, customer name, **and item names**. Newest first.
→ `200` `Paginated<Invoice>`

### GET `/invoices/:id`

→ `200` `Invoice` · `404` if not found / not yours

---

## 6. Dashboard Metrics

### GET `/metrics/overview?storeId=...`

```ts
// 200
{
  products: number;
  orders: number;
  stores: number;
  invoices: number;
}
```

### GET `/metrics/sales-trend?storeId=...&range=1Y`

`range` ∈ `7D | 1M | 3M | 6M | 1Y` (default `1Y`). Buckets: daily for `7D`/`1M`, monthly for `3M`/`6M`/`1Y`. Only **paid** invoices count.

```ts
// 200
{
  range: "7D" | "1M" | "3M" | "6M" | "1Y";
  points: {
    label: string;
    date: string;
    sales: number;
  }
  [];
  // 7D labels: "Mon".. · 1M labels: "Jun 5" · monthly labels: "Jan"..
}
```

---

## 7. Wallet

### GET `/wallet?storeId=...`

```ts
// 200
{
  balance: number; // from the transactions ledger
  currency: "NGN";
  accountNumber: string | null; // null until the virtual account is provisioned
  bankName: string | null;
  accountName: string;
}
```

The virtual account is provisioned via Nomba on first call; if Nomba is unreachable you get `null` account fields and it retries on the next call — render a "setting up your account" state for `null`.

### GET `/wallet/summary?storeId=...&period=week`

`period` ∈ `day | week | month` (default `week`). Compares against the previous equal period.

```ts
// 200
{
  total: number;
  changePercent: number;
  period: "day" | "week" | "month";
}
```

### GET `/banks`

```ts
// 200
{
  name: string;
  code: string;
}
[];
```

### POST `/wallet/resolve-account`

```ts
// Request
{ bankCode: string; accountNumber: string }
// 200
{ accountName: string }
// 400
{ "message": "Could not resolve account name" }
```

### POST `/wallet/withdraw`

```ts
// Request
{
  storeId: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
}
```

→ `201` `Transaction` (see §8)
→ `400` `{ "message": "Insufficient wallet balance" }` (and other validation messages)
→ `502` if the bank transfer is rejected by the provider

---

## 8. Transactions

```ts
interface Transaction {
  id: string;
  type: "credit" | "debit";
  channel: "nomba" | "withdrawal";
  amount: number;
  reference: string;
  counterparty?: string; // payer name / "Account Name · 0123456789"
  status: "pending" | "successful" | "failed";
  createdAt: string;
}
```

### GET `/transactions?storeId=...&type=&page=&limit=`

`type` ∈ `credit | debit` (optional). Newest first.
→ `200` `Paginated<Transaction>`

Credits are created automatically by Nomba webhook payments; debits by withdrawals.

---

## 9. Status code cheat sheet

| Code | Meaning here                                               |
| ---- | ---------------------------------------------------------- |
| 200  | OK                                                         |
| 201  | Created (stores, products, checkout, withdraw, uploads)    |
| 204  | Deleted (product delete — no body)                         |
| 400  | Validation / bad input — show `message`                    |
| 401  | Invalid/expired session only — clear token, go to `/login` |
| 404  | Not found or not your store/resource                       |
| 409  | Conflict: duplicate barcode, insufficient stock            |
| 502  | Upstream provider (Nomba) rejected the operation           |
