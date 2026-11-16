import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { database } from "../server/database.js";
import { createApp } from "../server/app.js";
import { initializeProducts } from "../server/features/products.js";
let db, app, owner, cashier;
beforeEach(async () => {
  db = await database(undefined, ":memory:");
  app = await createApp(db, { demo: true });
  owner = request.agent(app);
  cashier = request.agent(app);
  await owner
    .post("/api/v1/auth/login")
    .send({ username: "owner", password: "Owner123!" })
    .expect(200);
  await cashier
    .post("/api/v1/auth/login")
    .send({ username: "cashier", password: "Cashier123!" })
    .expect(200);
  await owner.post("/api/v1/categories").send({ name: "Clothes" }).expect(201);
});
afterEach(() => db.close());
const fields = [
  {
    id: "color",
    label: "Color",
    type: "select",
    required: true,
    options: ["Red", "Blue"],
  },
  { id: "size", label: "Size", type: "text", required: true, options: [] },
];
const variant = (sku, color = "Red", size = "Small") => ({
  sku,
  price: 120,
  cost: 50,
  stock: 20,
  customFields: { color, size },
});
const create = () =>
  owner
    .post("/api/v1/product-templates/variants")
    .send({
      name: "Hoodie",
      category: "Clothes",
      fields,
      variants: [variant("RED"), variant("BLUE", "Blue", "Large")],
    })
    .expect(201);
const state = async () =>
  (await owner.get("/api/v1/workspace").expect(200)).body;
test("parent migration preserves IDs, stock and sales and is repeatable", async () => {
  const before = await db.query("SELECT * FROM products");
  const sales = await db.query("SELECT * FROM sales");
  await initializeProducts(db);
  await initializeProducts(db);
  assert.deepEqual(await db.query("SELECT * FROM products"), before);
  assert.deepEqual(await db.query("SELECT * FROM sales"), sales);
  assert.equal(
    (await db.query("SELECT * FROM product_links")).length,
    before.length,
  );
});
test("batch variants persist product-specific forms and reject duplicates atomically", async () => {
  const { templateId, ids } = (await create()).body;
  let s = await state();
  assert.equal(s.products.filter((p) => p.templateId === templateId).length, 2);
  assert.deepEqual(s.products.find((p) => p.id === ids[0]).customFields, {
    color: "Red",
    size: "Small",
  });
  await owner
    .post("/api/v1/product-templates/variants")
    .send({
      templateId,
      name: "Hoodie",
      category: "Clothes",
      variants: [
        variant("NEW", "Blue", "Small"),
        { ...variant("DUPE"), variant: "different label" },
      ],
    })
    .expect(409);
  assert.equal(
    (await state()).products.filter((p) => p.templateId === templateId).length,
    2,
  );
  await owner
    .post("/api/v1/product-templates/variants")
    .send({
      name: "Laptop",
      category: "Clothes",
      fields: [],
      variants: [{ sku: "LAP", stock: 1, price: 500 }],
    })
    .expect(201);
  assert.deepEqual(
    (await state()).productTemplates.find((t) => t.name === "Laptop").fields,
    [],
  );
  await owner
    .put("/api/v1/product-templates/" + templateId)
    .send({ name: "Hoodie", category: "Clothes", fields: [fields[0]] })
    .expect(200);
  const p = (await state()).products.find((p) => p.id === ids[0]);
  await owner
    .put("/api/v1/products/" + p.id)
    .send({ ...p, customFields: { color: "Red" } })
    .expect(200);
  assert.equal(
    (await state()).products.find((v) => v.id === p.id).customFields.color,
    "Red",
  );
  assert.equal(
    JSON.parse(
      (
        await db.query("SELECT value FROM product_fields WHERE product_id=?", [
          p.id,
        ])
      )[0].value,
    ).size,
    "Small",
  );
});
test("category rename preserves variants and blocks deletion of occupied categories", async () => {
  const { ids } = (await create()).body;
  await owner
    .put("/api/v1/categories/Clothes")
    .send({ name: "Apparel" })
    .expect(200);
  assert.equal(
    (await state()).products.find((p) => p.id === ids[0]).category,
    "Apparel",
  );
  assert.equal(
    (await state()).products.find((p) => p.id === ids[0]).customFields.color,
    "Red",
  );
  await owner.delete("/api/v1/categories/Apparel").expect(409);
  await cashier
    .post("/api/v1/categories")
    .send({ name: "Forbidden" })
    .expect(403);
  await owner.post("/api/v1/categories").send({ name: "Empty" }).expect(201);
  await owner.delete("/api/v1/categories/Empty").expect(200);
});
test("cashiers can add and edit variants but cannot administer forms or costs", async () => {
  const { templateId, ids } = (await create()).body;
  await cashier
    .put("/api/v1/product-templates/" + templateId)
    .send({ name: "Hoodie", category: "Clothes", fields: [] })
    .expect(403);
  const { cost, ...v } = variant("CASHIER", "Red", "Large");
  await cashier
    .post("/api/v1/product-templates/variants")
    .send({ templateId, name: "Hoodie", category: "Clothes", variants: [v] })
    .expect(201);
  await cashier
    .post("/api/v1/product-templates/variants")
    .send({
      templateId,
      name: "Hoodie",
      category: "Clothes",
      fields: [],
      variants: [v],
    })
    .expect(403);
  const p = (await state()).products.find((p) => p.id === ids[0]);
  delete p.cost;
  await cashier
    .put("/api/v1/products/" + p.id)
    .send({ ...p, price: 125 })
    .expect(200);
  assert.equal(
    (await state()).products.find((p) => p.id === ids[1]).price,
    120,
  );
});
test("multi-variant checkout deducts correct stock and receipts preserve option and price snapshots", async () => {
  const { templateId, ids } = (await create()).body;
  await cashier.post("/api/v1/shifts/open").send({ opening: 0 }).expect(200);
  await owner
    .put("/api/v1/settings")
    .send({
      storeName: "Test",
      currency: "MMK",
      taxBps: 0,
      receiptFooter: "Thanks",
    })
    .expect(200);
  const sale = (
    await cashier
      .post("/api/v1/sales")
      .send({
        lines: [
          { id: ids[0], qty: 3 },
          { id: ids[1], qty: 5 },
        ],
        payments: [{ method: "Cash", amount: 960 }],
        idempotency: randomUUID(),
      })
      .expect(201)
  ).body;
  assert.equal(sale.total, 960);
  assert.equal(sale.lines.length, 2);
  assert.match(
    sale.lines.find((l) => l.id === ids[0]).variant,
    /Color: Red.*Size: Small/,
  );
  let s = await state();
  assert.equal(s.products.find((p) => p.id === ids[0]).stock, 17);
  assert.equal(s.products.find((p) => p.id === ids[1]).stock, 15);
  await owner
    .put("/api/v1/product-templates/" + templateId)
    .send({ name: "Renamed hoodie", category: "Clothes", fields: [] })
    .expect(200);
  const saved = JSON.parse(
    (await db.query("SELECT lines FROM sales WHERE id=?", [sale.id]))[0].lines,
  );
  assert.equal(saved[0].name, "Hoodie");
  assert.equal(saved[0].price, 120);
  assert.ok(saved.every((l) => l.customFields.color));
  await cashier
    .post("/api/v1/sales")
    .send({
      lines: [{ id: ids[0], qty: 18 }],
      payments: [{ method: "Cash", amount: 2160 }],
      idempotency: randomUUID(),
    })
    .expect(409);
});
test("validation rejects invalid category, decimal stock, missing fields and weak passwords", async () => {
  for (const changes of [
    { category: "Missing" },
    { variants: [{ ...variant("X"), stock: 1.2 }] },
    { variants: [{ ...variant("X"), customFields: {} }] },
  ])
    await owner
      .post("/api/v1/product-templates/variants")
      .send({
        name: "Invalid",
        category: "Clothes",
        fields,
        variants: [variant("X")],
        ...changes,
      })
      .expect(400);
  assert.equal(
    (await state()).productTemplates.some((t) => t.name === "Invalid"),
    false,
  );
  await owner
    .put("/api/v1/profile/password")
    .send({ currentPassword: "Owner123!", password: "aaaaaaaaaaa" })
    .expect(400);
  await owner
    .put("/api/v1/profile/password")
    .send({
      currentPassword: "Owner123!",
      password: "Strong123456",
      confirmPassword: "Other123456",
    })
    .expect(400);
  await owner
    .put("/api/v1/profile")
    .send({ name: "Owner", username: "owner", phone: "123" })
    .expect(400);
  await owner
    .put("/api/v1/profile")
    .send({ name: "Owner", username: "owner", phone: "09 123 456 789" })
    .expect(200);
  assert.equal((await state()).user.phone, "+959123456789");
});

test("automatic variant codes are unique and edits preserve codes", async () => {
  const result = await owner
    .post("/api/v1/product-templates/variants")
    .send({
      name: "Auto Hoodie",
      category: "Clothes",
      fields,
      variants: [
        { ...variant(undefined), sku: undefined },
        { ...variant(undefined, "Blue", "Large"), sku: "" },
      ],
    })
    .expect(201);
  const products = (await state()).products.filter(
    (p) => p.templateId === result.body.templateId,
  );
  assert.equal(new Set(products.map((p) => p.sku)).size, 2);
  for (const p of products) assert.match(p.sku, /^SH-[A-F0-9]{12}$/);
  const p = products[0];
  await owner
    .put("/api/v1/products/" + p.id)
    .send({ ...p, price: 135 })
    .expect(200);
  assert.equal((await state()).products.find((v) => v.id === p.id).sku, p.sku);
  await owner
    .post("/api/v1/products")
    .send({
      name: "New item",
      variant: "",
      category: "Clothes",
      price: 10,
      stock: 1,
      threshold: 1,
    })
    .expect(201);
  assert.match(
    (await state()).products.find((p) => p.name === "New item").sku,
    /^SH-[A-F0-9]{12}$/,
  );
});

test("generated SKU collision retries and database rejects duplicate inventory codes", async () => {
  const { generatedSku } = await import("../server/features/products.js");
  await owner
    .post("/api/v1/products")
    .send({
      name: "Collision",
      variant: "",
      sku: "SH-010101010101",
      category: "Clothes",
      price: 10,
      stock: 1,
      threshold: 1,
    })
    .expect(201);
  let calls = 0;
  const sku = await db.transaction((tx) =>
    generatedSku(tx, () => Buffer.alloc(6, ++calls === 1 ? 1 : 2)),
  );
  assert.equal(sku, "SH-020202020202");
  assert.equal(calls, 2);
  await owner
    .post("/api/v1/products")
    .send({
      name: "Duplicate",
      variant: "",
      sku: "SH-010101010101",
      category: "Clothes",
      price: 10,
      stock: 1,
      threshold: 1,
    })
    .expect(409);
});
