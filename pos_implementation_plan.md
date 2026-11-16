# SaYinn Hub — POS Implementation Plan

**Product:** SaYinn Hub  
**Type:** Point of Sale (POS) for a retail shop  
**Document status:** Implementation plan (Phase 1 through production)  
**Last updated:** 5 November 2026

This plan is the build sequence for SaYinn Hub. Each phase lists the functions to implement, who can use them, the main screens and API endpoints, and the checks that mark the phase done. Later phases depend on earlier ones. Do not start a phase until the previous phase acceptance checks pass.

---

## 1. Purpose and scope

SaYinn Hub lets a shop owner run the counter and lets cashiers sell without access to money reports, user management, or sensitive settings.

**In scope**

- Owner and cashier login with role-based access
- Product catalog, pricing, tax, and barcodes
- Stock tracking and adjustments
- Counter sales: cart, hold, checkout, change, receipt
- Cash shifts (open float, close, variance)
- Multiple payment methods
- Customers, discounts, returns, voids, and refunds
- Owner dashboard, sales reports, and audit log
- Single shop, one or more registers on the same database

**Out of scope for this plan**

- Multiple shops or franchises
- Full accounting (general ledger, payroll)
- E-commerce storefront
- Hardware payment-terminal SDKs (card machines are recorded as a tender type; the terminal itself stays outside the app)
- Native mobile apps (the cashier UI is a responsive web app that can run on a tablet browser)

**Default locale assumptions**

- Currency: **MMK** (configurable in store settings)
- Time zone: **Asia/Yangon**
- Payment methods available to configure: Cash, KBZPay, Wave Money, AYA Pay, bank transfer, card
- These defaults are store settings, not hard-coded business rules

---

## 2. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + Vite + React Router | Fast cashier UI, simple routing |
| UI | Tailwind CSS + a small component set (buttons, tables, dialogs, toasts) | Consistent counter layout without a heavy design system |
| Server state | TanStack Query | Caching, refetch after sale, loading and error states |
| Forms | React Hook Form + Zod | Shared validation rules with the API |
| Backend | Node.js + Express.js | REST API, middleware for auth and roles |
| Validation | Zod (shared schemas where practical) | Same rules on client and server |
| Database | **PostgreSQL** | Transactions, stock integrity, reporting queries |
| ORM | Prisma | Schema, migrations, typed queries |
| Auth | JWT access token (short) + refresh token (httpOnly cookie) | Cashier sessions that can be revoked |
| Passwords | bcrypt | Stored hashes only |
| File storage | Local disk in development; S3-compatible bucket in production | Product images and receipt logos |
| Printing | Browser print of a receipt view; optional ESC/POS later | Phase 5 uses browser print; raw printer support is a later add-on |
| Tests | Vitest + React Testing Library; Supertest for API | Unit and endpoint coverage on money paths |

**Repository layout**

```text
sayinn-hub/
  client/                 React app
    src/
      app/                routes, providers
      features/           auth, catalog, inventory, pos, shifts, customers, reports, settings
      components/
      lib/                api client, money helpers, formatters
  server/
    src/
      modules/            auth, users, products, inventory, sales, shifts, customers, reports, settings, audit
      middleware/
      lib/
    prisma/
      schema.prisma
      migrations/
  pos_implementation_plan.md
```

**Money rule:** store amounts as integers in the smallest currency unit (MMK has no subunit in practice, so store whole kyats as integers). Never use floating-point for prices, tax, totals, or change.

---

## 3. Roles and access

Two roles only.

| Capability | Owner | Cashier |
| --- | --- | --- |
| Log in and log out | Yes | Yes |
| Change own password | Yes | Yes |
| Create, edit, disable cashier accounts | Yes | No |
| Reset a cashier password | Yes | No |
| Store profile, tax, receipt text, payment methods | Yes | No |
| Create and edit products, prices, categories | Yes | No |
| View product list and prices at the counter | Yes | Yes |
| Receive stock, adjust stock, stock count | Yes | No |
| View on-hand quantity at the counter | Yes | Yes (read only) |
| Open and close own shift | Yes | Yes |
| View all shifts and variances | Yes | Own shift only |
| Ring a sale, hold and recall, take payment, print receipt | Yes | Yes |
| Apply a preconfigured discount or promo | Yes | Yes |
| Manual price override or custom line discount | Yes | No (owner must do it, or approve it) |
| Void an open ticket | Yes | Own open ticket only, before payment |
| Refund or return a completed sale | Yes | No |
| View dashboard, profit, and all reports | Yes | No |
| View own sales for the current shift | Yes | Yes |
| Export reports | Yes | No |
| Read the audit log | Yes | No |

**Enforcement**

- Every protected API checks a valid access token **and** the role. Hiding a button is not enough.
- Owner-only routes use `requireRole("OWNER")`.
- A disabled user cannot refresh a session.
- The first account created by the setup wizard is always the owner. There is no public self-signup after setup.

---

## 4. Architecture

```text
Browser (cashier tablet or owner PC)
        |
        | HTTPS  /api/v1
        v
Express API
  auth middleware -> role middleware -> module handler
        |
        v
PostgreSQL
  sales, sale_lines, payments, stock_movements in DB transactions
```

**Request rules**

- Base path: `/api/v1`
- JSON for all bodies except image upload (`multipart/form-data`)
- Errors: `{ "error": { "code": "STOCK_SHORTAGE", "message": "..." } }`
- List endpoints support `page`, `pageSize`, `q`, and module-specific filters
- Mutations that change money or stock write one audit row in the same database transaction

**Sale transaction (must be one database transaction)**

1. Lock the product rows being sold.
2. Confirm on-hand quantity (unless the product is marked non-stock).
3. Insert `sales` and `sale_lines`.
4. Insert `payments`.
5. Insert negative `stock_movements` and decrement `products.on_hand`.
6. Insert `audit_logs`.
7. Commit. Any failure rolls the whole sale back.

---

## 5. Core functions by module

Function names below are the behaviors to build. Each one maps to a UI action and an API handler.

### 5.1 Setup and authentication

| ID | Function | Role |
| --- | --- | --- |
| AUTH-01 | Run first-time setup: store name, owner name, username, password | Public, once |
| AUTH-02 | Block setup when an owner already exists | System |
| AUTH-03 | Log in with username and password | Public |
| AUTH-04 | Issue access token and refresh token | System |
| AUTH-05 | Refresh the access token | Authenticated |
| AUTH-06 | Log out and revoke the refresh token | Authenticated |
| AUTH-07 | Log out all sessions for a user | Owner (any user), or self |
| AUTH-08 | Change own password (requires current password) | Authenticated |
| AUTH-09 | Lock login after repeated failures, then allow retry | System |
| AUTH-10 | Reject login for disabled users | System |

### 5.2 Users (cashiers)

| ID | Function | Role |
| --- | --- | --- |
| USER-01 | List users with role and status | Owner |
| USER-02 | Create a cashier (name, username, temporary password) | Owner |
| USER-03 | Edit cashier display name | Owner |
| USER-04 | Disable or enable a cashier | Owner |
| USER-05 | Reset a cashier password | Owner |
| USER-06 | Prevent disabling the last active owner | System |
| USER-07 | Force password change on next login when the owner sets a temporary password | System |

### 5.3 Store settings

| ID | Function | Role |
| --- | --- | --- |
| SET-01 | Read and update store profile (name, address, phone, logo) | Owner |
| SET-02 | Set currency code and time zone | Owner |
| SET-03 | Create, edit, and disable tax rates (name, percent, inclusive or exclusive) | Owner |
| SET-04 | Set the default tax rate | Owner |
| SET-05 | Edit receipt header, footer, and whether to show cashier name | Owner |
| SET-06 | Enable or disable payment methods and mark one as default | Owner |
| SET-07 | Set low-stock threshold default | Owner |
| SET-08 | Allow or disallow selling when stock is zero | Owner |

### 5.4 Catalog

| ID | Function | Role |
| --- | --- | --- |
| CAT-01 | Create, rename, reorder, and archive categories | Owner |
| CAT-02 | Create a product (name, SKU, barcode, category, price, cost, tax, track-stock flag, image) | Owner |
| CAT-03 | Edit a product | Owner |
| CAT-04 | Archive or restore a product (archived products cannot be sold) | Owner |
| CAT-05 | Search products by name, SKU, or barcode | Owner, Cashier |
| CAT-06 | Look up exactly one product by barcode scan | Owner, Cashier |
| CAT-07 | List products with price and on-hand for the POS grid | Owner, Cashier |
| CAT-08 | Reject duplicate SKU and duplicate barcode | System |
| CAT-09 | Record price and cost changes in the audit log | System |

### 5.5 Inventory

| ID | Function | Role |
| --- | --- | --- |
| INV-01 | View on-hand, reserved (held tickets), and available quantity | Owner; cashier sees on-hand only |
| INV-02 | Receive stock (quantity, unit cost optional, note, reference) | Owner |
| INV-03 | Adjust stock up or down with a required reason | Owner |
| INV-04 | Record a stock count and post the variance as an adjustment | Owner |
| INV-05 | List stock movements for a product | Owner |
| INV-06 | Low-stock list (on-hand at or below threshold) | Owner |
| INV-07 | Decrement stock on completed sale | System |
| INV-08 | Increment stock on restocked return | System |
| INV-09 | Block sale lines that exceed available stock when negative stock is disallowed | System |

Movement types: `RECEIPT`, `ADJUSTMENT`, `COUNT`, `SALE`, `RETURN`, `VOID_RESTOCK`.

### 5.6 Shifts (register sessions)

| ID | Function | Role |
| --- | --- | --- |
| SHF-01 | Open a shift with opening cash amount and register name | Owner, Cashier |
| SHF-02 | Prevent a second open shift for the same user | System |
| SHF-03 | Show the current open shift on the POS screen | Owner, Cashier |
| SHF-04 | Block checkout when the user has no open shift | System |
| SHF-05 | Close a shift: count cash, compute expected cash, store variance and note | Owner, Cashier (own shift) |
| SHF-06 | List shifts with totals by payment method | Owner; cashier sees own shifts |
| SHF-07 | Cashier cannot edit a shift after it is closed | System |
| SHF-08 | Owner can add a note on a closed shift, not rewrite the count | Owner |

Expected cash = opening cash + cash sales − cash refunds.

### 5.7 Point of sale (counter)

| ID | Function | Role |
| --- | --- | --- |
| POS-01 | Open the sell screen only with an open shift | Owner, Cashier |
| POS-02 | Add a product to the cart by search, grid tap, or barcode | Owner, Cashier |
| POS-03 | Increase, decrease, or set line quantity | Owner, Cashier |
| POS-04 | Remove a line | Owner, Cashier |
| POS-05 | Show line total, tax, discount, and grand total as the cart changes | Owner, Cashier |
| POS-06 | Clear the cart with confirmation | Owner, Cashier |
| POS-07 | Hold the current cart with a label (customer name or note) | Owner, Cashier |
| POS-08 | List and recall held carts for this register | Owner, Cashier |
| POS-09 | Discard a held cart | Owner; cashier only if they created it |
| POS-10 | Apply a cart-level percent or fixed discount from an active promo | Owner, Cashier |
| POS-11 | Apply an owner-only custom discount or price override, with reason | Owner |
| POS-12 | Attach a customer to the ticket (optional) | Owner, Cashier |
| POS-13 | Take payment: one or more tenders (split payment) | Owner, Cashier |
| POS-14 | Compute change for cash; reject underpayment | System |
| POS-15 | Complete the sale, assign receipt number, update stock, close the cart | System |
| POS-16 | Show a paid confirmation with receipt actions | Owner, Cashier |
| POS-17 | Start the next sale immediately after completion | Owner, Cashier |
| POS-18 | Void the open unpaid ticket (no stock change if nothing was committed) | Owner; cashier for own open ticket |

**Cart math (exclusive tax, default)**

- Line net = round(unit price × quantity − line discount)
- Tax = round(line net × tax rate) when tax is exclusive
- If tax is inclusive, unit price already contains tax; show tax as the extracted portion and do not add it again
- Grand total = sum of line nets + exclusive tax − cart discount
- Rounding: half away from zero to the nearest kyat, per line, then sum

**Receipt number format:** `SY-YYYYMMDD-####` (daily sequence, unique).

### 5.8 Payments

| ID | Function | Role |
| --- | --- | --- |
| PAY-01 | Record each tender: method, amount, optional reference (transaction id) | Owner, Cashier |
| PAY-02 | Allow split tender until the balance due is zero | Owner, Cashier |
| PAY-03 | For cash, amount tendered may exceed the total; store change given | System |
| PAY-04 | Non-cash tenders cannot exceed the remaining balance | System |
| PAY-05 | List payments on a sale and on a shift | Owner; cashier on own sales |

No card data is stored. A card or wallet payment stores only the method, amount, and an optional reference string.

### 5.9 Receipts

| ID | Function | Role |
| --- | --- | --- |
| RCP-01 | Render a receipt: store info, receipt number, date, cashier, lines, tax, discounts, payments, change | Owner, Cashier |
| RCP-02 | Print the receipt with the browser print dialog | Owner, Cashier |
| RCP-03 | Reprint a past receipt | Owner; cashier for sales inside their open shift |
| RCP-04 | Mark reprint on the receipt ("REPRINT") | System |

### 5.10 Customers

| ID | Function | Role |
| --- | --- | --- |
| CUS-01 | Quick-create a customer (name, phone) from the POS | Owner, Cashier |
| CUS-02 | Search customers by name or phone | Owner, Cashier |
| CUS-03 | Edit customer name, phone, and note | Owner |
| CUS-04 | View a customer’s sales history and total spend | Owner |
| CUS-05 | Attach or detach a customer before payment | Owner, Cashier |

### 5.11 Discounts and promos

| ID | Function | Role |
| --- | --- | --- |
| DIS-01 | Create a promo: name, code optional, percent or fixed, start and end, active flag | Owner |
| DIS-02 | Limit a promo to selected categories or products | Owner |
| DIS-03 | Disable a promo | Owner |
| DIS-04 | Apply a promo by code or by picking it on the cart | Owner, Cashier |
| DIS-05 | Reject expired, inactive, or non-matching promos | System |
| DIS-06 | One cart-level promo at a time in v1 | System |

### 5.12 Returns, refunds, and voids

| ID | Function | Role |
| --- | --- | --- |
| RET-01 | Find a completed sale by receipt number or recent list | Owner |
| RET-02 | Return all or some units of a line | Owner |
| RET-03 | Choose restock or do-not-restock per returned line | Owner |
| RET-04 | Refund by original method when possible; otherwise record the refund tender | Owner |
| RET-05 | Partial returns until returned quantity equals sold quantity | Owner |
| RET-06 | Block return of an already fully returned line | System |
| RET-07 | Update stock, shift totals, and customer spend | System |
| RET-08 | Void is only for an unpaid open ticket; completed sales use return/refund | System |

### 5.13 Reports and dashboard (owner)

| ID | Function | Role |
| --- | --- | --- |
| RPT-01 | Today summary: sales total, receipt count, average ticket, refunds | Owner |
| RPT-02 | Sales over a date range (day, week, month, custom) | Owner |
| RPT-03 | Sales by payment method | Owner |
| RPT-04 | Sales by category and by product (qty, revenue, estimated profit) | Owner |
| RPT-05 | Sales by cashier | Owner |
| RPT-06 | Shift report: opening, cash in, cash refunds, expected, counted, variance | Owner |
| RPT-07 | Low-stock and inventory valuation (on-hand × cost) | Owner |
| RPT-08 | Export the current report to CSV | Owner |
| RPT-09 | Cashier “my shift” strip: receipt count and sales total, no profit | Cashier |

Estimated profit = revenue − (quantity × unit cost at time of sale). Store `unit_cost` on the sale line so later cost edits do not rewrite history.

### 5.14 Audit

| ID | Function | Role |
| --- | --- | --- |
| AUD-01 | Write an audit row for: login failure lock, user create/disable, password reset, price change, stock movement, refund, void, settings change, shift close | System |
| AUD-02 | Filter the audit log by date, actor, and action | Owner |
| AUD-03 | Audit rows are insert-only | System |

### 5.15 Notifications inside the app

| ID | Function | Role |
| --- | --- | --- |
| NTF-01 | Badge on the owner nav when any tracked product is at or below its low-stock threshold | Owner |
| NTF-02 | Toast on success or failure of payment, hold, and refund | Owner, Cashier |

No email or SMS in this plan.

---

## 6. Data model

Prisma models to create. Names are singular in the database via `@@map` if you prefer snake_case tables.

**User** — id, name, username (unique), passwordHash, role (`OWNER` | `CASHIER`), status (`ACTIVE` | `DISABLED`), mustChangePassword, createdAt, updatedAt

**RefreshToken** — id, userId, tokenHash, expiresAt, revokedAt, createdAt

**StoreSetting** — singleton row: storeName, address, phone, logoUrl, currency, timeZone, receiptHeader, receiptFooter, showCashierOnReceipt, defaultTaxRateId, allowNegativeStock, defaultLowStockThreshold

**TaxRate** — id, name, rateBps (basis points, 500 = 5%), inclusive (bool), active

**PaymentMethod** — id, code, name, active, isCash (bool), sortOrder

**Category** — id, name, sortOrder, archivedAt

**Product** — id, categoryId, name, sku (unique), barcode (unique, nullable), price, cost, taxRateId, trackStock (bool), onHand, lowStockThreshold (nullable), imageUrl, archivedAt

**StockMovement** — id, productId, type, quantity (signed), unitCost (nullable), note, refType, refId, actorId, createdAt

**Customer** — id, name, phone, note, createdAt

**Promo** — id, name, code (unique, nullable), kind (`PERCENT` | `FIXED`), value, startsAt, endsAt, active

**PromoTarget** — promoId, productId nullable, categoryId nullable

**Shift** — id, userId, registerName, openedAt, closedAt, openingCash, countedCash, expectedCash, variance, closeNote

**Sale** — id, receiptNo (unique), shiftId, cashierId, customerId nullable, status (`COMPLETED` | `REFUNDED` | `PARTIALLY_REFUNDED`), subtotal, discountTotal, taxTotal, grandTotal, promoId nullable, note, createdAt

**SaleLine** — id, saleId, productId, nameSnapshot, skuSnapshot, qty, unitPrice, unitCost, discount, tax, lineTotal, returnedQty

**HeldCart** — id, shiftId, userId, label, payload (JSON cart), createdAt

**Payment** — id, saleId, shiftId, methodId, direction (`IN` | `OUT`), amount, reference, createdAt

**Refund** — id, saleId, shiftId, actorId, reason, total, createdAt

**RefundLine** — id, refundId, saleLineId, qty, restock (bool), amount

**AuditLog** — id, actorId nullable, action, entityType, entityId, metadata (JSON), createdAt

**ReceiptSequence** — date, lastNumber (row lock when issuing the next receipt number)

Indexes: `Product.barcode`, `Product.sku`, `Product.name`, `Sale.receiptNo`, `Sale.createdAt`, `Shift.userId + closedAt`, `Customer.phone`, `AuditLog.createdAt`.

---

## 7. API map

All routes except setup and login require `Authorization: Bearer <accessToken>`.

### Auth

- `POST /api/v1/setup` — AUTH-01
- `POST /api/v1/auth/login` — AUTH-03
- `POST /api/v1/auth/refresh` — AUTH-05
- `POST /api/v1/auth/logout` — AUTH-06
- `POST /api/v1/auth/change-password` — AUTH-08

### Users (owner)

- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `POST /api/v1/users/:id/reset-password`
- `POST /api/v1/users/:id/sessions/revoke`

### Settings (owner)

- `GET /api/v1/settings`
- `PATCH /api/v1/settings`
- `GET|POST /api/v1/tax-rates`
- `PATCH /api/v1/tax-rates/:id`
- `GET|POST /api/v1/payment-methods`
- `PATCH /api/v1/payment-methods/:id`

### Catalog

- `GET|POST /api/v1/categories` (write: owner)
- `PATCH /api/v1/categories/:id`
- `GET|POST /api/v1/products`
- `GET /api/v1/products/barcode/:code`
- `PATCH /api/v1/products/:id`
- `POST /api/v1/products/:id/image`

### Inventory (owner write)

- `GET /api/v1/inventory/low-stock`
- `GET /api/v1/products/:id/movements`
- `POST /api/v1/inventory/receipts`
- `POST /api/v1/inventory/adjustments`
- `POST /api/v1/inventory/counts`

### Customers

- `GET|POST /api/v1/customers`
- `PATCH /api/v1/customers/:id` (owner)
- `GET /api/v1/customers/:id/sales` (owner)

### Promos (owner write, both roles read active)

- `GET|POST /api/v1/promos`
- `PATCH /api/v1/promos/:id`

### Shifts

- `POST /api/v1/shifts/open`
- `GET /api/v1/shifts/current`
- `POST /api/v1/shifts/:id/close`
- `GET /api/v1/shifts`
- `GET /api/v1/shifts/:id`

### Sales

- `POST /api/v1/sales` — complete checkout body: lines, discounts, customerId, payments
- `GET /api/v1/sales`
- `GET /api/v1/sales/:id`
- `POST /api/v1/sales/:id/refund` (owner)
- `GET|POST /api/v1/held-carts`
- `DELETE /api/v1/held-carts/:id`

### Reports (owner)

- `GET /api/v1/reports/summary?from=&to=`
- `GET /api/v1/reports/sales`
- `GET /api/v1/reports/products`
- `GET /api/v1/reports/cashiers`
- `GET /api/v1/reports/payments`
- `GET /api/v1/reports/inventory`
- `GET /api/v1/reports/:name/export` — CSV

### Audit (owner)

- `GET /api/v1/audit-logs`

---

## 8. Screens

| Route | Screen | Role |
| --- | --- | --- |
| `/setup` | First-run wizard | Public, once |
| `/login` | Login | Public |
| `/pos` | Sell: search, cart, pay | Both (needs open shift) |
| `/pos/held` | Held tickets | Both |
| `/shift/open` | Open shift | Both |
| `/shift/close` | Close shift | Both |
| `/receipts/:id` | Receipt preview | Both, scoped |
| `/products` | Product list | Owner |
| `/products/new`, `/products/:id` | Product form | Owner |
| `/categories` | Categories | Owner |
| `/inventory` | Stock list, receive, adjust, count | Owner |
| `/customers` | Customer list and history | Owner; cashier gets search inside POS only |
| `/promos` | Promos | Owner |
| `/team` | Cashiers | Owner |
| `/reports` | Dashboard and report tabs | Owner |
| `/settings` | Store, tax, receipt, payments | Owner |
| `/audit` | Audit log | Owner |
| `/account` | Change password | Both |

Cashier navigation shows: Sell, Held, Shift, Account. Owner navigation adds Products, Inventory, Customers, Promos, Team, Reports, Settings, Audit.

---

## 9. Phases

Each phase has a goal, the functions to finish, build tasks, and acceptance checks. Ship in order.

### Phase 1 — Foundation, setup, and authentication

**Goal:** A deployed-locally app where the owner can create the shop, sign in, and create a cashier who can sign in and see only cashier pages.

**Functions:** AUTH-01 through AUTH-10, USER-01 through USER-07.

**Build**

- Initialize `client` (Vite, React, Router, Tailwind, TanStack Query) and `server` (Express, Prisma, PostgreSQL).
- Add environment files: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`.
- Prisma models: User, RefreshToken. Migration and seed script that does **not** create users (setup wizard does).
- Middleware: `requireAuth`, `requireRole`, error handler, login rate limit.
- Setup wizard and login, logout, refresh, change password.
- Owner team screen: create, edit, disable, reset password.
- App shell with role-based navigation.
- Shared money and date formatters (MMK, Asia/Yangon).

**Acceptance**

- Second call to setup returns “already initialized”.
- Cashier token receives 403 on `POST /api/v1/users`.
- Disabled cashier cannot log in or refresh.
- Wrong password locks after 5 attempts for 15 minutes.
- Temporary password forces the change-password screen before any other page.

---

### Phase 2 — Store settings and catalog

**Goal:** Owner can configure the shop and maintain the products cashiers will sell.

**Functions:** SET-01 through SET-08, CAT-01 through CAT-09.

**Build**

- Models: StoreSetting, TaxRate, PaymentMethod, Category, Product.
- Seed default payment methods (Cash, KBZPay, Wave Money, AYA Pay, bank transfer, card) and a 0% tax rate. Cash is the default and cannot be disabled while it is the only active method.
- Settings screens and product/category CRUD.
- Image upload for product and logo (size and type limits).
- POS-facing read APIs: product search and barcode lookup (UI grid comes in Phase 4).
- Audit price and cost changes.

**Acceptance**

- Duplicate SKU or barcode is rejected.
- Archived product does not appear in search used by the sell screen.
- Cashier can `GET` products and cannot `POST` or `PATCH` them.
- Changing a price writes an audit row with old and new values.

---

### Phase 3 — Inventory

**Goal:** On-hand quantities stay correct before sales start, and the owner can receive and correct stock.

**Functions:** INV-01 through INV-06. INV-07 through INV-09 are completed in Phase 4 and Phase 7; add the movement writer now so those phases call it.

**Build**

- Model: StockMovement.
- Receive, adjust (reason required), and stock-count screens.
- Movement history per product.
- Low-stock list using product threshold or the store default.
- Available quantity = onHand − quantity sitting on held carts (held carts arrive in Phase 6; until then available = onHand).

**Acceptance**

- Two concurrent receipts do not lose updates (row lock or `UPDATE ... SET on_hand = on_hand + $qty`).
- Adjustment of −100 on a product with 5 on hand is rejected when negative stock is off.
- Every change creates a movement row with the actor.
- Cashier cannot post receipts, adjustments, or counts.

---

### Phase 4 — Core counter sale (cash only)

**Goal:** A cashier with an open shift can sell stocked products for cash and get a receipt number. This is the first usable POS.

**Functions:** SHF-01 through SHF-04, POS-01 through POS-06, POS-13 through POS-17 (cash only, single tender), PAY-01, PAY-03, INV-07, INV-09, RCP-01 (on-screen, print in Phase 5).

**Build**

- Models: Shift, Sale, SaleLine, Payment, ReceiptSequence.
- Open-shift gate on `/pos`.
- Sell screen: category filter, search, barcode input that adds on Enter, cart editor, totals.
- Tax calculation using the product tax rate and the inclusive/exclusive flag.
- `POST /api/v1/sales` as one database transaction (section 4).
- Receipt number generator with a per-day row lock.
- Snapshot product name, SKU, unit price, and unit cost onto the line.
- Success panel with receipt number and “new sale”.

**Acceptance**

- Checkout with no open shift returns 409.
- Selling 2 units reduces on-hand by 2.
- Selling more than on-hand returns `STOCK_SHORTAGE` and leaves stock unchanged when negative stock is off.
- Grand total matches the documented rounding rule on a fixture of at least 10 carts (including a tax-inclusive product).
- Receipt numbers are unique under two parallel checkouts.
- Cashier completes a sale without seeing cost or profit.

---

### Phase 5 — Shifts, split payments, and printing

**Goal:** End-of-day cash-up works, and a sale can be paid with more than one method. Receipts print.

**Functions:** SHF-05 through SHF-08, PAY-02, PAY-04, PAY-05, RCP-02 through RCP-04, RPT-09.

**Build**

- Close-shift screen: denomination-free single counted-cash field, expected cash, variance, note.
- Split payment UI: add tender rows until balance due is 0; cash change row.
- Reference field for wallet and bank payments.
- Printable receipt layout using store header, footer, and logo.
- Reprint flag.
- Cashier shift strip (receipt count and sales total).

**Acceptance**

- Expected cash equals opening + cash in − cash refunds (refunds stay 0 until Phase 7; test with cash sales only).
- A 10,000 MMK sale paid as 4,000 cash + 6,000 KBZPay stores two payment rows and change 0.
- Cash tendered 10,000 on a 7,500 sale stores change 2,500 and rejects a second tender.
- Non-cash tender above the remaining balance is rejected.
- Closed shift rejects new sales.
- Cashier cannot open another user’s shift report.

---

### Phase 6 — Holds, customers, discounts, and tax admin

**Goal:** The counter can park a sale, attach a customer, and apply owner-defined promos.

**Functions:** POS-07 through POS-12, CUS-01 through CUS-05, DIS-01 through DIS-06, SET-03 and SET-04 if not already polished in Phase 2.

**Build**

- Held cart save, list, recall, discard. Recalling removes the hold and restores the cart. Held quantities reduce **available** stock but do not reduce on-hand until checkout.
- Customer quick-add and search on the sell screen. Owner customer book with sales history.
- Promo CRUD and cart apply. Custom owner discount with a reason stored on the sale.
- Show discount and tax breakdown on the cart and the receipt.

**Acceptance**

- Holding a cart frees the sell screen for a new cart; recall restores lines and quantities.
- Two holds cannot push available stock below zero when negative stock is off.
- Expired promo code is rejected.
- Cashier token cannot set a custom price; owner can, and the audit log records the reason.
- Customer spend on the owner history matches completed sale totals.

---

### Phase 7 — Returns, refunds, and voids

**Goal:** Mistakes and returns correct stock, shift cash, and sale status without editing history in place.

**Functions:** POS-18, RET-01 through RET-08, INV-08.

**Build**

- Void open unpaid ticket (client cart only, plus delete held cart if it was recalled). Nothing is posted until checkout, so void does not create a sale row.
- Owner return screen: search receipt, pick quantities, restock toggle, refund tenders, reason.
- Models: Refund, RefundLine. Original sale lines keep `returnedQty`.
- Refund payments use direction `OUT` and attach to the **current** open shift of the owner processing the refund, so that shift’s expected cash stays correct.
- Sale status moves to `PARTIALLY_REFUNDED` or `REFUNDED`.

**Acceptance**

- Cannot return more units than sold minus already returned.
- Restock increases on-hand; do-not-restock leaves on-hand unchanged and still writes a movement of type `RETURN` with quantity 0 and a note, or a movement flagged non-stock — pick one and test it. Preferred: write a `RETURN` movement only when restock is true.
- Cash refund reduces expected cash on the shift that is open now.
- A fully refunded sale cannot be refunded again.
- Cashier receives 403 on the refund endpoint.

---

### Phase 8 — Owner dashboard, reports, and audit viewer

**Goal:** The owner can run the shop from numbers: today, range, product, cashier, payments, stock value, and an audit trail.

**Functions:** RPT-01 through RPT-08, AUD-01, AUD-02, AUD-03, NTF-01, NTF-02.

**Build**

- Dashboard cards for today, plus date-range filters.
- Tables for product, category, cashier, and payment breakdown.
- Profit uses `SaleLine.unitCost`, not the current product cost.
- Inventory valuation report.
- CSV export with the same filters as the on-screen report.
- Audit log screen.
- Low-stock badge in the owner navigation.
- Confirm every earlier mutation still writes audit rows; fill any gaps (shift close, refund, settings, user changes).

**Acceptance**

- A known fixture day matches hand-calculated totals for revenue, tax, discount, refunds, and profit.
- Changing a product cost after the sale does not change that sale’s profit.
- CSV columns match the on-screen table.
- Cashier cannot open `/reports` or `/audit` (route and API).
- Low-stock badge appears when a tracked product is at the threshold and clears when stock is received above it.

---

### Phase 9 — Daily operations polish

**Goal:** The counter is fast and safe for a real shop day: empty states, keyboard flow, backup, and a written cashier routine.

**Functions:** no new business functions. Harden the ones above.

**Build**

- Keyboard path: focus barcode field, Enter to add, F2 pay, Esc to clear selection. Show the keys on screen.
- Empty states: no products, no shift, no search hits, printer cancelled.
- Confirmation dialogs: clear cart, discard hold, close shift with non-zero variance, refund.
- Server-side request logging with request id, without logging passwords or tokens.
- Database backup script (daily `pg_dump`) and a restore drill documented in `server/README.md`.
- Owner “how to open and close” and cashier “how to sell” one-page guides in `/docs`.
- Loading and error toasts on every mutation.
- Pagination on products, sales, customers, audit.

**Acceptance**

- A cashier can complete a three-item cash sale without a mouse.
- Restore drill: dump the database, drop it, restore, and the last receipt is still searchable.
- Variance close requires a note when variance is not zero.

---

### Phase 10 — Production release

**Goal:** SaYinn Hub runs for the shop on a real machine with HTTPS, locked-down defaults, and a rollback path.

**Build**

- Production build of the client served by the Express app, or by a reverse proxy in front of both.
- HTTPS, secure cookie flags, strict CORS origin, helmet, body size limits.
- Secrets only in the environment, not in the repo.
- Process manager (for example Node under a Windows service or PM2) so the API restarts on failure.
- Health check `GET /api/v1/health` (database ping).
- Migration command documented: `prisma migrate deploy` on release, never `db push` in production.
- Smoke test script that logs in as owner and cashier, creates a product, opens a shift, sells, and closes the shift against a scratch database.
- Tag the release `v1.0.0` when the smoke test and Phase 4–8 acceptance fixtures pass.

**Acceptance**

- Fresh production setup: run migrations, open the site, complete the wizard, sell one cash item, print the receipt, close the shift, see the sale on the owner dashboard.
- Cashier account cannot reach owner APIs (repeat the 403 checks from Phase 1 and Phase 8 on the production build).
- Health check fails when Postgres is stopped, and the process manager restarts the API after a crash.

---

## 10. Cross-cutting rules

**Security**

- bcrypt cost factor 12.
- Access token lifetime 15 minutes. Refresh token lifetime 14 days, rotated on use, revoked on logout.
- Bind refresh tokens to a hash in the database.
- Rate-limit login and setup.
- Server recomputes every total from catalog prices and promos. The client total is display-only. Owner price override is an explicit field the server accepts only for `OWNER`.
- Cashier list endpoints that return sales must filter `cashierId = current user` unless the role is owner.

**Integrity**

- Do not update or delete `Sale`, `SaleLine`, or `Payment` rows after insert. Corrections are refunds.
- Store snapshots on sale lines.
- Stock changes only through `StockMovement`.

**UX**

- Sell screen first for cashiers after login (after shift open).
- Large tap targets, high contrast totals, sticky pay bar.
- Prices formatted as `1,500 MMK`.
- Errors in plain language (“Not enough stock for Soap (on hand 2)”).

**Performance targets (single shop, local network)**

- Product search under 200 ms for 5,000 SKUs.
- Checkout under 500 ms on the LAN.
- Dashboard summary under 1 second for a 31-day range.

---

## 11. Test plan

**Automated**

- Auth: setup once, lockout, role 403, disabled user.
- Money fixtures: exclusive tax, inclusive tax, percent promo, fixed promo, split tender, change, partial refund.
- Stock: parallel sale of the last unit (one succeeds, one returns `STOCK_SHORTAGE`).
- Receipt sequence under parallel requests.

**Manual, once per phase**

- Owner path and cashier path on the same sale day.
- Browser print preview shows shop name, lines, total, and payment.
- Tablet-width viewport (768 px) for the sell screen: cart and pay still usable.

**Fixture to keep**

Keep one seed script, `server/prisma/seed-demo.ts`, that builds a demo shop, two cashiers, 20 products, and 15 sales. Use it for report checks. Do not run it against production.

---

## 12. Suggested build order inside a phase

1. Prisma model and migration.
2. Server handler and role check, with Supertest.
3. React screen wired to the real API.
4. Acceptance checks from that phase.

Do not mock the sale transaction in the UI and “connect later”. Checkout, stock, and reports need the real database from Phase 4 onward.

---

## 13. Risks and responses

| Risk | Response |
| --- | --- |
| Double-submit on pay creates two sales | Disable the pay button on submit; server idempotency key header `Idempotency-Key` stored on the sale for 24 hours |
| Last item sold twice | Row lock on product inside the sale transaction |
| Cashier learns owner URLs | `requireRole` on every owner route; test 403s in Phase 1 and again in Phase 10 |
| Printer missing | Sale still completes; receipt stays reprintable on screen |
| Cost edited later, profit “changes” | Profit reads `SaleLine.unitCost` snapshot |
| Held carts hide stock forever | Held carts expire at shift close: recall-or-discard is required before close, or auto-discard with an audit row. Choose auto-discard on shift close and show the count in the close dialog |

---

## 14. Phase checklist

| Phase | Outcome | Depends on |
| --- | --- | --- |
| 1 | Owner and cashier can sign in; cashier is locked out of user admin | — |
| 2 | Shop profile, tax, payments, categories, products | 1 |
| 3 | Receive, adjust, count, low stock | 2 |
| 4 | Cash sale updates stock and issues a receipt number | 1–3 |
| 5 | Split pay, print, close shift with variance | 4 |
| 6 | Hold, customer, promo, owner override | 4 |
| 7 | Partial refund and restock | 5, 6 |
| 8 | Dashboard, CSV, audit viewer, low-stock badge | 7 |
| 9 | Keyboard selling, backup and restore proven | 8 |
| 10 | HTTPS production install, smoke test, v1.0.0 | 9 |

Phase 6 can start in parallel with Phase 5 after Phase 4, but Phase 7 needs both, because refunds must hit shift cash totals and promo-aware line amounts.

---

## 15. Definition of done for v1.0.0

SaYinn Hub v1 is done when an owner can:

1. Create the shop and a cashier.
2. Add categories, products, prices, tax, and opening stock.
3. Let the cashier open a shift, sell with barcode, split a payment, print a receipt, park a sale, and close the shift.
4. Refund part of a sale and see stock and expected cash update.
5. Read today’s sales, profit, payment mix, and low stock, and export a CSV.
6. See who changed a price, adjusted stock, or issued a refund.

And a cashier cannot do steps that the role table reserves for the owner, even by calling the API directly.
