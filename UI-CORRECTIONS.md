# UI and functional corrections — 17 November 2026

## Implemented

- Header text-size selector: Standard, Large and Extra large. A saved preference scales existing typography throughout the UI; printed receipts retain their established size.
- Desktop sidebar toggle: icons and labels when expanded, icons with tooltips when collapsed, smooth width/content adjustment and saved preference. Mobile uses an off-canvas menu with a close button and backdrop; selecting a page closes it.
- Searchable User Guide: ten English/Myanmar sections covering setup, shops, categories, products/variants, inventory, cart, sales, receipts, settings and roles. Owner-only topics are omitted for cashiers; product instructions reflect their permissions.
- POS cards now say Add to cart and open the existing variant/quantity picker. Product-management cards retain View variants. Existing cart option editing and separate variant lines remain intact.
- Payment methods: new shops receive Cash, Bank transfer, Mobile Payment and Card. Existing shops retain their legacy providers. Owners can add and rename custom methods, enable/disable methods, limit cashier access and delete unused custom methods. The API validates permissions and checkout availability. Used methods cannot be deleted, including renamed legacy methods. Recorded names and method identities preserve historical payments and idempotent checkout retries.
- Categories is a separate owner sidebar entry using the existing category editor and database. Selecting a category opens its filtered product catalog.

## Main modified files

- `client/src/App.jsx`, `components/DisplayControls.jsx`, `corrections.css`, `main.jsx`: navigation and display preferences.
- Existing CSS files: font declarations now use a shared text-scale variable, preserving their default sizes.
- `client/src/features/UserGuide.jsx`, `i18n/en.json`, `i18n/my.json`: searchable bilingual help and new labels.
- `client/src/features/catalog.jsx`, `products/ProductGroups.jsx`, `pos.jsx`, `sales.jsx`: category filtering, contextual cart action and payment selection/history filtering.
- `client/src/features/settings/PaymentMethods.jsx`, `ShopSettings.jsx`: owner payment configuration.
- `server/features/payments.js`, `server/app.js`: configuration persistence in the existing settings record, defaults, authorization and checkout validation. No new database tables.
- `tests/payments.test.js`, `tests/api.test.js`, `tests/language.test.js`: payment lifecycle, default methods, permission and translation coverage.

## Verification

- `npm test`: 57 passed, zero failed.
- `npm run build`: passed.
- Prettier check and `git diff --check`: passed. No separate lint or type-check scripts are configured.
- Browser checks: desktop collapse/expand, text-size and sidebar persistence after reload, English/Myanmar guide search, 390-pixel phone navigation, category-to-product filtering, variant quantity added to cart, enabled checkout methods and owner payment settings. No browser console errors observed.
- No real sale was submitted during browser verification; payment transactions were tested in isolated in-memory databases.
- PostgreSQL and physical receipt printers were not exercised. No hosting deployment was performed.
