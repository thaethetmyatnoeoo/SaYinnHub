# SaYinn Hub

A rebuilt retail POS with a responsive React interface and an authenticated Express API. The supplied implementation plan is preserved in `pos_implementation_plan.md` as a requirements reference; this README describes what is actually implemented.

## Run it

Requires Node.js **22.13 or newer** and npm.

```sh
npm ci
npm run demo
```

Open **http://127.0.0.1:5173** and choose **Open sample workspace**. Sample owner: `owner` / `Owner123!`; cashier: `cashier` / `Cashier123!`. Demo mode is local development only. Its clearly labeled fixtures and subsequent transactions persist in `data/demo.sqlite`.

For a real, empty local workspace, stop the demo server and run:

```sh
npm run dev
```

Choose Register → Owner to create a separate shop. Choose Member to request access to an existing shop using its shop code. Normal mode has no default accounts or demo shortcuts. The original workspace remains in `data/sayinn.sqlite` under shop code `main`. Both modes use a real backend; business records are not stored in browser local storage.

## What works

- Owner dashboard with period filters, daily revenue, recent receipts, best sellers, and low-stock alerts.
- Search products by name, variant, or SKU. Press Enter on an exact SKU to add it at the counter.
- Cart quantities, optional customer, owner custom discount, store-level exclusive tax, and live totals.
- Open/close cash shifts; prevent checkout without an open shift; record expected cash, counted cash, and variance.
- Cash and split tenders: Cash, KBZPay, Wave Money, AYA Pay, card, and bank transfer. Record payments only; no payment gateway or money transfer takes place.
- Transactional checkout, server-calculated prices, atomic stock checks, daily receipt sequences, idempotency, and printable receipts.
- Hold/recall a ticket, scoped to its creator. Held carts do not reserve stock; availability is checked again at checkout.
- Product creation/editing, archive/restore, catalog browsing, stock receipt/adjustment with reason, movement history, and low-stock thresholds.
- Customer creation/search, owner-visible spend and visits, cashier creation, enabling/disabling access, and immediate session revocation on disable.
- Owner partial returns, optional restock, pro-rated discount/tax refunds, and cash refunds recorded against the currently open shift, including returns of older sales.
- Revenue/profit summaries, payment mix, CSV exports, store name, tax, receipt footer, and audit history.
- Responsive layouts, accessible native dialogs, keyboard focus, loading/empty/error states, locally bundled fonts, and original product artwork.

## Backend design

The API uses `/api/v1`. Server-side, revocable opaque sessions are stored as SHA-256 token hashes; cookies are HTTP-only and SameSite=Strict, expire after eight hours, and require Secure in production. Passwords use salted scrypt. Login/setup are rate limited. Mutations reject foreign Origins; Helmet sets response security headers. Owner-only APIs enforce roles independently of the UI. Cashier responses omit unit costs, team, and audit data, and restrict sale history to their own sales.

Every checkout commits its receipt, price/cost snapshots, payment records, stock movements, and audit event in one transaction. Product updates use conditional stock checks, and product IDs are processed in a stable order. PostgreSQL transactions retain one dedicated connection. Local SQLite operations are serialized around transactions so concurrent asynchronous requests cannot enter another request's transaction. Refunds allocate whole-kyat amounts cumulatively so a full return equals the original discounted, taxed total exactly.

All prices and amounts are whole MMK integers. Tax and refund allocation use integer/BigInt arithmetic. Payment and receipt history retain original line prices and costs. SQL statements use bound parameters. The database has foreign keys, unique SKUs/receipts, non-negative stock constraints, and a unique open shift per user.

## PostgreSQL and deployment

SQLite is the zero-install development default. The same schema and transaction adapter support PostgreSQL when `DATABASE_URL` is set. PostgreSQL uses BIGINT money columns and converts results to safe JavaScript integers. An actual PostgreSQL server was not available in the implementation environment; additional integration verification against a disposable PostgreSQL database is required before production adoption. The included automated suite currently exercises SQLite.

For a local PostgreSQL server, set `POSTGRES_PASSWORD` and run `docker compose up -d`. Set a matching database URL in a copy of `.env.example` saved as `.env`:

```dotenv
DATABASE_URL=postgresql://sayinn:YOUR_PASSWORD@localhost:5432/sayinn
APP_ORIGIN=https://pos.example.com
NODE_ENV=production
PORT=3001
DEMO=false
```

```sh
npm run build
npm start
```

The Express server serves `dist/` and the API together. It binds to `127.0.0.1`; put an HTTPS reverse proxy in front of it that preserves the Host header. `APP_ORIGIN` is the exact public origin for proxy deployments. Never expose the database publicly. Production startup rejects SQLite or demo mode. Take encrypted database backups, test restores, and manage secrets through the hosting environment. This project has not been deployed to a public service.

## Verification

```sh
npm test
npm run build
```

The API integration suite uses independent in-memory SQLite databases and temporary localhost HTTP servers. Tests cover first-run setup, cookie properties, role enforcement, cost privacy, shifts, payment/stock rollback, split tenders, idempotency, concurrent overselling, tax rounding, cost snapshots, exact partial refunds, cross-shift refunds, disabled sessions, held-ticket ownership, cross-origin protection, and logout.

## Remaining scope from the supplied plan

This is a working full-stack foundation, not completion of every production phase in the supplied plan. Remaining work includes dedicated barcode fields, stock counts, held-stock reservations, configurable/inclusive per-product tax, promo codes and owner approval workflows, password resets and forced temporary-password rotation, customer editing, register-specific ticket sharing, configurable payment methods, date-range report APIs with pagination beyond the latest 1,000 sales, receipt reprint marking, database migration versioning, backup/restore automation, hardware printing, and deployment/monitoring. Audit triggers reject row updates/deletes, but production should also use a database role with minimal privileges. The old demo's courier/COD-delivery workflow is not implemented in this POS build.

Frontend: `client/src/`; backend: `server/`; transaction/security tests: `tests/api.test.js`; original reference artwork: `client/public/`.

## Brand and interactive design

The supplied original logo is used throughout. Current brand tokens are Cream #FFF7ED, Coral #F97360, Peach #FDBA74, and Espresso #431C16. Surfaces, borders and shadows derive from these four colors. Gradients and shadows provide depth using these colors.

The CSS 3D shopping display supports dragging and rotation buttons. Product illustrations, raised surfaces, and pointer tilt add depth without WebGL. The Motion toggle persists a presentation preference and respects reduced-motion settings. Product sculptures are illustrative representations; original product artwork remains in client/public/.

Glass edition: translucent cream panels, backdrop blur, coral separators, a floating navigation surface, and reflective CSS 3D objects. Styling lives in client/src/glass.css, with mobile and reduced-motion support inherited from the spatial components.

## November 2026 workspace update

The existing application was modified in place. Branding and the updated cream/coral/peach/espresso palette are applied. Shared typography and form controls are larger. Overview no longer displays rotation controls or the date range bar; its 7/30-day chart tabs remain. Customers are available from the POS customer controls instead of a separate sidebar menu.

Products now share a create/edit form with authenticated image upload, preview and replacement. Owners configure per-category text, number, date, select and checkbox fields, including required fields and select options. Selecting a category displays its fields automatically. Removed definitions retain historical database values. The catalog sales-period selector controls displayed sold-unit counts; these are based on the existing latest-1,000-sales workspace feed (cashiers see their own sales).

Cashiers can view products/inventory, create/edit products, upload product images and adjust stock with a reason. Unit costs remain owner-only: cashier-created products start with zero cost, which an owner can later set. Archive/restore, category configuration, shop settings, reports, team and audits retain owner restrictions.

Public Landing, Login and Register views are separate from the authenticated workspace. Registration now supports Owner and Member roles. Each Owner creates a separate shop; Members request access to a shop and wait for its owner to approve them in Team. Owners can also create cashier accounts directly in Team.

Shop Settings accepts an uploaded shop logo. Receipts place it above the shop name, with SaYinn Hub as a small footer watermark. Without a logo, the shop name is the heading. The print stylesheet supports 80mm receipts. Profile supports name, username, email, phone, photo and password updates. Changing a password requires the current password and revokes other sessions.

Uploads accept PNG/JPEG/WebP up to 2MB, decode and validate up to 16 megapixels, strip metadata and re-encode resized PNG images. Images are stored in the database and served only to signed-in users. Old uploads are retained so existing references remain valid.

### Organization and database changes

The reference video could not be retrieved, so a modest feature-based organization was used without replacing the existing architecture:
- client/src/features/account/: Landing, Auth and Profile.
- client/src/features/products/: shared ProductForm and CategoryFields.
- client/src/features/settings/: ShopSettings.
- client/src/components/ImageUpload.jsx: shared validated upload UI.
- client/src/features.css: shared readability, responsive feature layouts and print overrides.
- server/features/workspace.js: custom fields, uploads and profile endpoints.
- server/database.js: additive category_fields, product_fields, images and profiles tables.
- tests/api.test.js: existing checkout tests plus feature/security/migration coverage.

Existing tables and business records are preserved. Back up the database before updating a deployed installation; the application adds missing tables automatically at startup. PostgreSQL live integration and physical receipt-printer testing remain outstanding. There is no separate TypeScript check because this project uses JavaScript/JSX.

Validation: all 27 API integration tests pass and the Vite production build passes. Browser checks verified category configuration, automatic product fields and persisted values, product upload, shop logo preview/receipt rendering, profile save and avatar updates. Test edits were made only in an isolated in-memory database.

## Owner and Member registration

Register collects full name, email, phone, username and a confirmed password. Owners also enter a shop name and choose a unique shop code. After registration, the confirmation screen carries the shop code into Login. Usernames are unique within a shop, so different shop owners may use the same username.

Members enter the owner's shop code. Registration saves an inactive CASHIER account and a pending membership request. The owner reviews name, email and phone in Team and selects Approve member; until approved, the account cannot log in. Members never receive owner privileges. Shop codes are visible in Team and Shop Settings. Codes identify shops; they are not credentials. Login requires the shop code plus that shop's username and password. Existing demo credentials use shop code main.

Implementation: server/hub.js routes each shop to the existing application. SQLite shops have separate files in data/shops/ (data/shops-demo/ in demo mode); the root database stores a shops directory. PostgreSQL shops use separate generated schemas and connection pools, with no public-schema fallback in their search path. The PostgreSQL application role needs CREATE permission on the database to provision schemas. Existing main-shop records are unchanged. Backups must include the root database AND all shop databases/schemas. Failed provisioning reservations stay unavailable rather than exposing a partially created shop; operational recovery is manual.

New files: server/hub.js, server/http.js, server/features/registration.js, tests/registration.test.js. Updated files: server/index.js, server/database.js, server/app.js, client/src/features/account/Auth.jsx, client/src/App.jsx, client/src/features/settings/ShopSettings.jsx and client/src/features.css.

Validation: 32 integration tests cover existing POS behavior plus owner registration, saved personal details, separate-shop data/session isolation, member approval and permissions, invalid/duplicate input, cross-origin rejection, failed-login session preservation and registration persistence across SQLite restart. Production build passes. Live PostgreSQL provisioning is not yet verified. Email/phone verification and self-service account recovery are not implemented.

## One account, multiple shops

The sidebar shop selector now lists all shops belonging to an account. Create a shop adds a new owned workspace without creating another login. Join another shop requests CASHIER membership in a different owner's shop; its owner must approve it in Team. A person can own multiple shops and be a member of others. Owner permissions apply only inside shops they own. Membership disablement takes effect immediately, and the account can still switch to another approved shop.

Accounts keep their original sign-in shop code to disambiguate legacy accounts with identical usernames. Sign in once with that code, username and password, then switch shops without signing in again. Profile information and password now belong to the account and follow it across shops. A password change revokes other account sessions across shops. Existing authenticated shop sessions are upgraded and existing users are enrolled on login without deleting shop records or automatically merging people with matching names/usernames.

Additive root tables accounts, memberships and account_sessions map identities to shop-local users. Shop databases remain isolated. The active shop is stored in the server session; changing the routing cookie cannot grant access. Shop-specific mutations include X-Shop-Code to reject stale-tab requests after a switch. Unsaved POS carts must be held or cleared before switching. Pending and disabled memberships are visible in the selector.

The new theme.css applies the corrected palette, dimensional shop cards, raised surfaces, orbiting decorative highlights, floating accents, staggered dashboard entrances and hover motion. Existing motion preferences and reduced-motion settings are respected. Checkout controls remain stable. Additional multi-shop, role-isolation, profile/password and legacy-session integration coverage is in tests/registration.test.js. Live PostgreSQL remains unverified.

Latest verification: all 35 integration tests pass; production build passes. Browser checks confirm same-session switching, empty/new shop data, shop creation and the updated palette. Shop picker test records were created only in an isolated in-memory preview.

Page design update: FeatureScene.jsx and depth.css add distinct CSS 3D storefront, terminal, carton, receipt, chart, activity and people scenes, plus live page metrics and contextual actions. Guides can be hidden. Empty catalog/inventory/POS states now offer clear next steps. Motion-off disables decorative animations; reduced-motion preferences are respected. The accepted four-color palette is unchanged.

Layout correction: restored Overview's shopping-bag/receipt scene. Page scenes now use dedicated grid cells and paint clipping so transformed layers cannot cover category controls or content. Mobile artwork uses its own row above guide text. Desktop scene bounds checked across Products, Inventory, Sales, Reports, Team, Activity and Settings; product category controls and mobile overflow checked in the browser.
