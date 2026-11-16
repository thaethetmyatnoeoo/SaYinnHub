# Product variants, codes, logos and languages

Implemented in the existing project; existing shop codes, product SKUs and transaction records are preserved.

## Changes and main files

- Dynamic valid variant dropdowns, exact price/stock/SKU/image, owner-only cost display and stock-aware quantities: `client/src/features/products/variantSelection.js`, `ProductGroups.jsx`, `ProductDetails.jsx`.
- POS cart option editing restores choices and quantity, supports separate variant lines, and merges matching combinations: `client/src/features/pos.jsx`.
- Secure random shop codes with database collision handling, automatic product/variant SKUs, existing approval flow retained: `server/hub.js`, `server/features/registration.js`, `server/features/products.js`, `server/app.js`; registration/shop/product forms updated.
- Immediate logo preview, authenticated shop-specific image URLs, non-stale caching, sidebar and receipt display, shop-name fallback and print readiness: `client/src/api.js`, `client/src/components/ImageUpload.jsx`, `ui.jsx`, `client/src/App.jsx`, `server/features/workspace.js`.
- Persisted English/Myanmar switching, separate translation resources, validation and interface translations, Unicode font and responsive text styling: `client/src/i18n/`, `client/src/main.jsx`, `client/src/features.css`, application page components, `package.json` and lockfile.

## Verification

- Full automated suite: 52 passed, zero failures.
- Final production build: passed.
- After final dialog-label fixes: five language/variant tests passed.
- Browser: changing size invalidated incompatible color; selected variant price, SKU, stock and image updated. Cart editing restored options and quantity. Language preference survived reload. Open receipt switched English/Myanmar in both directions while preserving transaction values and user-entered product options.
- API tests cover generated-code collisions and uniqueness, stable SKUs on edits, logo persistence and shop isolation, variant stock deduction and receipt snapshots.
- No lint or type-check scripts are configured.

## Verification limits

Tests used SQLite; PostgreSQL was not exercised. No physical receipt printer was available. Receipt preview and Unicode rendering were inspected, and printing waits for images and fonts. Browser locale date formatting can use English date names depending on Intl support. Unknown server messages fall back to English; user-entered names, custom fields and receipt footer text intentionally remain unchanged.

Preview while the development server is running: http://127.0.0.1:5173
