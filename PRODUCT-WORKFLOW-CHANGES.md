# Product workflow update — 10 November 2026

## Running locally

Install Node.js 22.13 or newer. Open PowerShell and run:

```powershell
cd "C:\Users\Vivobook\Documents\ChatGPT\SaYinnHub"
npm install
npm run dev
```

Open http://127.0.0.1:5173. Keep the terminal open. Ctrl+C stops the application. Subsequent starts only require `npm run dev`; dependency installation is only needed on first setup or after dependency changes. The existing SQLite files stay in `data/`. Localhost is accessible only on this computer; permanent hosting is not yet configured.

## Implemented

- Categories: create, rename, select to filter products, and confirmed removal. Categories containing any inventory (including archived records) cannot be deleted. Renaming updates linked records transactionally.
- Product templates own their custom field definitions. Existing inventory IDs are retained and linked to parents by existing category/name. Legacy category definitions are copied during enrollment; later category changes do not alter a product's saved form.
- Add Product selects a category and existing parent or creates a parent. Add Field configures text, integer, decimal, dropdown, checkbox, date and image fields; required flags and numeric ranges are supported. Add More creates independent variants with shared prices prefilled. The full batch saves in one transaction.
- Each variant retains its own SKU, image, stock, price and field values. Duplicate active combinations are rejected. Product detail forms expose variant editing, stock adjustments, archival and reusable form configuration. Removed field values remain stored.
- Catalog and POS share grouped product cards, price ranges, variant summaries and photo carousels. Carousels have manual navigation, a pause control and reduced-motion support.
- POS selects an available combination and quantity, keeps separate cart lines for variants, checks available stock and uses the existing transactional checkout.
- Sale lines now snapshot custom field definitions and values, and readable option labels. Receipt preview and the existing print layout show those labels. Shop logos and subtle Sayinn Hub watermark behavior are retained.
- Manual shop codes and existing membership requests remain in the current shop/team system. Owners can explicitly reject requests; decisions record reviewer, requested/decided timestamps and status. The shop selector refreshes membership statuses; users with no approved membership receive their current pending/rejected status at sign-in.
- Password changes and registration require 10–128 characters including letters and numbers, with confirmation checked when provided. Myanmar mobile and international phone formats are checked and normalized. Existing password hashing and session revocation remain in place.
- Cashiers retain product/variant creation, editing, image and stock access. Category and product form administration remain owner-only; cost-price restrictions are preserved.

## Files

Backend: `server/features/products.js` (new), `server/features/validation.js` (new), `server/features/workspace.js`, `server/features/registration.js`, `server/app.js`, `server/hub.js`, `server/database.js`.

Frontend: `client/src/features/products/AddVariants.jsx`, `ProductDetails.jsx`, `ProductGroups.jsx`, `TemplateFields.jsx` (new); `CategoryFields.jsx`, `ProductForm.jsx`; `client/src/features/catalog.jsx`, `pos.jsx`; `client/src/features/account/validation.js` (new), `Auth.jsx`, `Profile.jsx`, `ShopSwitcher.jsx`, `Landing.jsx`; `client/src/App.jsx`, `components/ui.jsx`, `features.css`.

Tests: `tests/variants.test.js` (new), `tests/api.test.js`, `tests/registration.test.js`.

## Verification and limits

- 42 API integration tests pass, including additive migration, transactional batch rollback, duplicate protection, category safeguards, cashier permissions, independent variant edits, multi-variant checkout, historical receipt snapshots, validation and request rejection.
- Production build passes. The project is JavaScript/JSX and has no separate TypeScript check.
- Browser verification used a disposable in-memory shop: created a category, configured Color/Size fields, saved two variants, sold quantities 3 and 5 for 960 Ks, inspected the generated receipt, replaced a variant photo and changed its price independently. No test sales were entered into the user's shop.
- Physical thermal printing and live PostgreSQL deployment have not been verified. Existing MMK whole-kyat prices remain; decimal custom attributes are supported but fractional MMK prices are not.
- Request status is shown in the application/sign-in response; no email or SMS notification service was added.
- Product removal archives inventory instead of deleting sales-linked rows. Existing historical receipt data cannot be retroactively supplied with custom fields that were never recorded.
