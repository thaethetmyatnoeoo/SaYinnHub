import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { database } from "../server/database.js";
import { createApp } from "../server/app.js";

let db, app, owner, cashier, product;
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
  product = (await db.query("SELECT * FROM products ORDER BY sku"))[0];
});
afterEach(async () => {
  await db.close();
});
const open = (agent) =>
  agent.post("/api/v1/shifts/open").send({ opening: 50000 }).expect(200);
const payload = (qty = 1) => ({
  lines: [{ id: product.id, qty }],
  payments: [{ method: "Cash", amount: product.price * qty }],
  idempotency: randomUUID(),
});
const workspace = async (agent) =>
  (await agent.get("/api/v1/workspace").expect(200)).body;

test("setup is one-time and unauthenticated requests are rejected", async () => {
  await request(app).get("/api/v1/workspace").expect(401);
  await request(app)
    .post("/api/v1/setup")
    .send({
      storeName: "Other shop",
      name: "A",
      username: "other",
      password: "Secure12345",
    })
    .expect(409);
  assert.equal((await db.query("SELECT * FROM users")).length, 2);
});
test("first run creates a real owner without sample credentials", async () => {
  const fresh = await database(undefined, ":memory:");
  try {
    const a = await createApp(fresh);
    const client = request.agent(a);
    assert.equal((await client.get("/api/v1/status")).body.setup, true);
    await client
      .post("/api/v1/setup")
      .send({
        storeName: "New Shop",
        name: "Owner",
        username: "new",
        password: "Secure12345",
      })
      .expect(201);
    await client
      .post("/api/v1/auth/login")
      .send({ username: "owner", password: "Owner123!" })
      .expect(401);
    const login = await client
      .post("/api/v1/auth/login")
      .send({ username: "new", password: "Secure12345" })
      .expect(200);
    assert.match(login.headers["set-cookie"][0], /HttpOnly/);
    assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    assert.equal(
      (await client.get("/api/v1/workspace")).body.products.length,
      0,
    );
  } finally {
    await fresh.close();
  }
});
test("cashier permissions are enforced by the API and cost prices are private", async () => {
  for (const url of ["/team"])
    await cashier
      .post("/api/v1" + url)
      .send({})
      .expect(403);
  await cashier.put("/api/v1/settings").send({}).expect(403);
  const data = await workspace(cashier);
  assert.equal(data.team.length, 0);
  assert.equal(data.audit.length, 0);
  assert.equal("cost" in data.products[0], false);
  assert.equal(data.sales.length, 0);
});
test("checkout requires a shift and never mutates stock without one", async () => {
  await owner.post("/api/v1/sales").send(payload()).expect(400);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    product.stock,
  );
});
test("split tender checkout uses server prices, commits stock and audit together", async () => {
  await open(owner);
  const input = payload(2);
  input.lines[0].price = 1;
  input.payments = [
    { method: "KBZPay", amount: 1000 },
    { method: "Cash", amount: product.price * 2 },
  ];
  const sale = (await owner.post("/api/v1/sales").send(input).expect(201)).body;
  assert.equal(sale.total, product.price * 2);
  assert.equal(sale.change_amount, 1000);
  assert.match(sale.receipt, /^SY-\d{8}-\d{4}$/);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    product.stock - 2,
  );
  assert.equal(
    (await db.query("SELECT * FROM movements WHERE product_id=?", [product.id]))
      .length,
    1,
  );
  assert.equal(
    (await db.query("SELECT * FROM audit WHERE action=?", ["Sale completed"]))
      .length,
    1,
  );
});
test("underpayment rolls back every stock, sale, and audit mutation", async () => {
  await open(owner);
  const input = payload();
  input.payments[0].amount = 1;
  const before = (await db.query("SELECT id FROM sales")).length;
  await owner.post("/api/v1/sales").send(input).expect(400);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    product.stock,
  );
  assert.equal((await db.query("SELECT id FROM sales")).length, before);
  assert.equal((await db.query("SELECT * FROM movements")).length, 0);
});
test("repeated checkout is idempotent and rejects changed payloads", async () => {
  await open(owner);
  const input = payload();
  const first = (await owner.post("/api/v1/sales").send(input).expect(201))
    .body;
  const second = (await owner.post("/api/v1/sales").send(input).expect(201))
    .body;
  assert.equal(first.id, second.id);
  input.lines[0].qty = 2;
  await owner.post("/api/v1/sales").send(input).expect(409);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    product.stock - 1,
  );
});
test("concurrent checkouts cannot oversell the last item", async () => {
  await open(owner);
  await open(cashier);
  await db.query("UPDATE products SET stock=1 WHERE id=?", [product.id]);
  const results = await Promise.all([
    owner.post("/api/v1/sales").send(payload()),
    cashier.post("/api/v1/sales").send(payload()),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    0,
  );
});
test("checkout rejects duplicate lines, non-cash overpayment and cashier custom discounts", async () => {
  await open(cashier);
  const dup = payload();
  dup.lines.push({ ...dup.lines[0] });
  await cashier.post("/api/v1/sales").send(dup).expect(400);
  const noncash = payload();
  noncash.payments = [{ method: "Card", amount: product.price + 1 }];
  await cashier.post("/api/v1/sales").send(noncash).expect(400);
  await cashier
    .post("/api/v1/sales")
    .send({ ...payload(), discount: 100 })
    .expect(403);
});
test("discount and tax round to whole kyats and line snapshots survive price edits", async () => {
  await open(owner);
  await owner
    .put("/api/v1/settings")
    .send({
      storeName: "Shop",
      currency: "MMK",
      taxBps: 500,
      receiptFooter: "Thanks",
    })
    .expect(200);
  const input = {
    ...payload(),
    discount: 111,
    payments: [{ method: "Cash", amount: 100000 }],
  };
  const s = (await owner.post("/api/v1/sales").send(input).expect(201)).body;
  assert.equal(s.tax, Math.floor(((product.price - 111) * 500 + 5000) / 10000));
  await db.query("UPDATE products SET price=1,cost=1 WHERE id=?", [product.id]);
  const stored = JSON.parse(
    (await db.query("SELECT lines FROM sales WHERE id=?", [s.id]))[0].lines,
  );
  assert.equal(stored[0].price, product.price);
  assert.equal(stored[0].cost, product.cost);
});
test("partial refunds sum exactly to discounted total and cannot exceed sold units", async () => {
  await open(owner);
  const s = (
    await owner
      .post("/api/v1/sales")
      .send({ ...payload(3), discount: 101 })
      .expect(201)
  ).body;
  const initial = product.stock - 3;
  for (let i = 0; i < 3; i++)
    await owner
      .post("/api/v1/sales/" + s.id + "/refund")
      .send({
        productId: product.id,
        qty: 1,
        restock: true,
        reason: "Returned",
      })
      .expect(200);
  const stored = (
    await db.query("SELECT refunds FROM sales WHERE id=?", [s.id])
  )[0];
  const refunds = JSON.parse(stored.refunds);
  assert.equal(
    refunds.reduce((n, r) => n + r.amount, 0),
    s.total,
  );
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    initial + 3,
  );
  await owner
    .post("/api/v1/sales/" + s.id + "/refund")
    .send({ productId: product.id, qty: 1, restock: true, reason: "Again" })
    .expect(400);
});
test("a later-shift refund changes the receiving shift without rewriting closed cash", async () => {
  await open(owner);
  const s = (await owner.post("/api/v1/sales").send(payload()).expect(201))
    .body;
  await owner
    .post("/api/v1/shifts/close")
    .send({ counted: 50000 + product.price, note: "" })
    .expect(200);
  await open(owner);
  await owner
    .post("/api/v1/sales/" + s.id + "/refund")
    .send({
      productId: product.id,
      qty: 1,
      restock: false,
      reason: "Return next day",
    })
    .expect(200);
  const closing = (
    await owner
      .post("/api/v1/shifts/close")
      .send({ counted: 50000 - product.price, note: "" })
      .expect(200)
  ).body;
  assert.equal(closing.expected, 50000 - product.price);
  assert.equal(closing.variance, 0);
  const shifts = await db.query("SELECT expected FROM shifts WHERE note=?", [
    "",
  ]);
  assert.equal(shifts[0].expected, 50000 + product.price);
});
test("cash change and split tenders yield correct expected cash on close", async () => {
  await open(owner);
  const input = payload();
  input.payments = [
    { method: "Cash", amount: product.price },
    { method: "KBZPay", amount: 1000 },
  ];
  await owner.post("/api/v1/sales").send(input).expect(201);
  const expected = 50000 + product.price - 1000;
  const close = (
    await owner
      .post("/api/v1/shifts/close")
      .send({ counted: expected, note: "Balanced" })
      .expect(200)
  ).body;
  assert.equal(close.expected, expected);
  assert.equal(close.variance, 0);
  await owner.post("/api/v1/sales").send(payload()).expect(400);
});
test("disabled cashier sessions are immediately revoked", async () => {
  const user = (
    await db.query("SELECT id FROM users WHERE username=?", ["cashier"])
  )[0];
  await owner
    .patch("/api/v1/team/" + user.id)
    .send({ active: false })
    .expect(200);
  await cashier.get("/api/v1/workspace").expect(401);
  await cashier
    .post("/api/v1/auth/login")
    .send({ username: "cashier", password: "Cashier123!" })
    .expect(401);
});
test("held tickets are scoped to their creator", async () => {
  const held = (
    await owner
      .post("/api/v1/holds")
      .send({ label: "A customer", lines: [{ id: product.id, qty: 1 }] })
      .expect(201)
  ).body;
  assert.equal((await workspace(cashier)).holds.length, 0);
  await cashier.delete("/api/v1/holds/" + held.id).expect(200);
  assert.equal((await workspace(owner)).holds.length, 1);
});
test("invalid stock changes and cross-origin mutations are blocked", async () => {
  await owner
    .post("/api/v1/inventory/" + product.id)
    .send({ delta: -product.stock - 1, reason: "Invalid" })
    .expect(400);
  await owner
    .post("/api/v1/inventory/" + product.id)
    .send({ delta: 2, reason: "" })
    .expect(400);
  await owner
    .post("/api/v1/inventory/" + product.id)
    .set("Origin", "https://untrusted.example")
    .send({ delta: 2, reason: "Other site" })
    .expect(403);
});
test("logout invalidates server-side sessions", async () => {
  await owner.post("/api/v1/auth/logout").send({}).expect(200);
  await owner.get("/api/v1/workspace").expect(401);
});

test("product edits retain stock and archived products cannot be sold", async () => {
  const edit = {
    ...product,
    variant: "Updated variant",
    price: 18000,
    stock: 999,
  };
  await owner
    .put("/api/v1/products/" + product.id)
    .send(edit)
    .expect(200);
  assert.equal(
    (await db.query("SELECT stock FROM products WHERE id=?", [product.id]))[0]
      .stock,
    product.stock,
  );
  await cashier
    .put("/api/v1/products/" + product.id)
    .send(edit)
    .expect(403);
  await owner
    .patch("/api/v1/products/" + product.id)
    .send({ archived: true })
    .expect(200);
  assert.equal(
    (await workspace(owner)).products.some((p) => p.id === product.id),
    false,
  );
  await open(owner);
  await owner.post("/api/v1/sales").send(payload()).expect(409);
  const archived = (await owner.get("/api/v1/products/archived").expect(200))
    .body;
  assert.equal(archived.length, 1);
  await owner
    .patch("/api/v1/products/" + product.id)
    .send({ archived: false })
    .expect(200);
  assert.equal(
    (await workspace(owner)).products.some((p) => p.id === product.id),
    true,
  );
});
test("audit rows reject update and deletion at the database boundary", async () => {
  await assert.rejects(
    db.query("UPDATE audit SET action=?", ["Changed"]),
    /insert-only/,
  );
  await assert.rejects(db.query("DELETE FROM audit"), /insert-only/);
  assert.ok((await db.query("SELECT * FROM audit")).length > 0);
});

const productInput = (p = product) => ({
  name: p.name,
  variant: p.variant,
  sku: p.sku,
  category: p.category,
  price: p.price,
  threshold: p.threshold,
  image: p.image,
});
test("cashiers can create and edit products and adjust inventory without administrative access", async () => {
  const created = await cashier
    .post("/api/v1/products")
    .send({
      ...productInput(),
      name: "Cashier item",
      sku: "CASH-NEW",
      stock: 4,
    })
    .expect(201);
  const id = created.body.id;
  await cashier
    .put("/api/v1/products/" + id)
    .send({ ...productInput(), sku: "CASH-NEW", name: "Updated", price: 1200 })
    .expect(200);
  await cashier
    .post("/api/v1/inventory/" + id)
    .send({ delta: 3, reason: "Delivery" })
    .expect(200);
  const p = (await workspace(cashier)).products.find((p) => p.id === id);
  assert.equal(p.stock, 7);
  assert.equal(p.name, "Updated");
  assert.equal(p.price, 1200);
  assert.equal("cost" in p, false);
  await cashier
    .put("/api/v1/products/" + id)
    .send({ ...productInput(), cost: 1 })
    .expect(403);
  await cashier
    .patch("/api/v1/products/" + id)
    .send({ archived: true })
    .expect(403);
  await cashier.get("/api/v1/products/archived").expect(403);
  await cashier
    .put("/api/v1/categories/X/fields")
    .send({ fields: [] })
    .expect(403);
  assert.equal(
    (await cashier.get("/api/v1/inventory/" + id + "/movements").expect(200))
      .body.length,
    2,
  );
  await cashier
    .post("/api/v1/inventory/" + id)
    .send({ delta: -8, reason: "Invalid" })
    .expect(400);
});
test("category field definitions validate and persist typed values without destroying removed values", async () => {
  const fields = [
    {
      id: "material",
      label: "Material",
      type: "select",
      required: true,
      options: ["Cotton", "Silk"],
    },
    { id: "weight", label: "Weight", type: "number", required: false },
    { id: "organic", label: "Organic", type: "checkbox", required: false },
    { id: "expiry", label: "Expiry", type: "date", required: false },
  ];
  await owner
    .put("/api/v1/categories/Textiles/fields")
    .send({ fields })
    .expect(200);
  const input = {
    ...productInput(),
    sku: "CUSTOM-1",
    category: "Textiles",
    stock: 1,
    customFields: {
      material: "Silk",
      weight: 12,
      organic: true,
      expiry: "2027-02-28",
    },
  };
  const id = (await cashier.post("/api/v1/products").send(input).expect(201))
    .body.id;
  assert.deepEqual(
    (await workspace(owner)).products.find((p) => p.id === id).customFields,
    input.customFields,
  );
  for (const values of [
    {},
    { material: "Invalid" },
    { material: "Cotton", weight: "a" },
    { material: "Cotton", expiry: "2027-02-30" },
    { material: "Cotton", unknown: "x" },
  ])
    await cashier
      .put("/api/v1/products/" + id)
      .send({ ...input, customFields: values })
      .expect(400);
  const template = (await workspace(owner)).productTemplates.find(
    (t) => t.name === input.name && t.category === input.category,
  );
  await owner
    .put("/api/v1/product-templates/" + template.id)
    .send({ name: input.name, category: input.category, fields: [fields[0]] })
    .expect(200);
  await cashier
    .put("/api/v1/products/" + id)
    .send({ ...input, customFields: { material: "Cotton" } })
    .expect(200);
  const row = JSON.parse(
    (
      await db.query("SELECT value FROM product_fields WHERE product_id=?", [
        id,
      ])
    )[0].value,
  );
  assert.equal(row.weight, 12);
  assert.equal(row.material, "Cotton");
  await owner
    .put("/api/v1/categories/Textiles/fields")
    .send({ fields: [] })
    .expect(200);
  assert.equal(
    (await workspace(owner)).categories.find((c) => c.name === "Textiles")
      .fields.length,
    0,
  );
});
test("invalid field definitions and duplicate field keys are rejected", async () => {
  const field = { id: "size", label: "Size", type: "select", options: [] };
  await owner
    .put("/api/v1/categories/Test/fields")
    .send({ fields: [field] })
    .expect(400);
  await owner
    .put("/api/v1/categories/Test/fields")
    .send({
      fields: [
        { ...field, options: ["A"] },
        { ...field, options: ["B"] },
      ],
    })
    .expect(400);
});
async function upload(agent, purpose = "product") {
  const { default: sharp } = await import("sharp");
  const image = await sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: { r: 251, g: 129, b: 118, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return (
    await agent
      .post("/api/v1/images")
      .send({
        purpose,
        data: "data:image/png;base64," + image.toString("base64"),
      })
      .expect(201)
  ).body.url;
}
test("uploads are authenticated, decoded, purpose checked and used for products", async () => {
  await request(app).post("/api/v1/images").send({}).expect(401);
  await cashier
    .post("/api/v1/images")
    .send({ purpose: "shop", data: "fake" })
    .expect(403);
  for (const data of [
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJj",
  ])
    await owner
      .post("/api/v1/images")
      .send({ purpose: "product", data })
      .expect(400);
  const url = await upload(cashier);
  await cashier
    .get(url)
    .expect(200)
    .expect("Content-Type", /image\/png/);
  await request(app).get(url).expect(401);
  await cashier
    .put("/api/v1/products/" + product.id)
    .send({ ...productInput(), image: url })
    .expect(200);
  assert.equal(
    (await workspace(owner)).products.find((p) => p.id === product.id).image,
    url,
  );
  const replacement = await upload(cashier);
  await cashier
    .put("/api/v1/products/" + product.id)
    .send({ ...productInput(), image: replacement })
    .expect(200);
  assert.equal(
    (await workspace(owner)).products.find((p) => p.id === product.id).image,
    replacement,
  );
  const settings = (await workspace(owner)).settings;
  await owner
    .put("/api/v1/settings")
    .send({ ...settings, shopLogo: url })
    .expect(400);
});
test("shop logo persists, replaces and removes while preserving settings", async () => {
  const original = (await workspace(owner)).settings;
  const logo = await upload(owner, "shop");
  await owner
    .put("/api/v1/settings")
    .send({ ...original, shopLogo: logo })
    .expect(200);
  assert.equal((await workspace(cashier)).settings.shopLogo, logo);
  await owner
    .put("/api/v1/settings")
    .send({ ...original, receiptFooter: "Thanks again" })
    .expect(200);
  assert.equal((await workspace(owner)).settings.shopLogo, logo);
  await owner
    .put("/api/v1/settings")
    .send({ ...original, shopLogo: "" })
    .expect(200);
  assert.equal((await workspace(owner)).settings.shopLogo, "");
});
test("profile changes persist, reject invalid data and cannot escalate roles", async () => {
  const image = await upload(cashier, "profile");
  await cashier
    .put("/api/v1/profile")
    .send({
      name: "Updated Cashier",
      username: "cashier-new",
      email: "cashier@example.com",
      phone: "09123456789",
      image,
      role: "OWNER",
    })
    .expect(200);
  const user = (await workspace(cashier)).user;
  assert.equal(user.name, "Updated Cashier");
  assert.equal(user.image, image);
  assert.equal(user.role, "CASHIER");
  await owner
    .put("/api/v1/profile")
    .send({ name: "Owner", username: "owner", image })
    .expect(400);
  await cashier
    .put("/api/v1/profile")
    .send({ name: "Updated", username: "owner" })
    .expect(409);
  await cashier
    .put("/api/v1/profile")
    .send({ name: "Updated", username: "cashier-new", email: "not-an-email" })
    .expect(400);
});
test("password change requires old password and revokes other sessions", async () => {
  const other = request.agent(app);
  await other
    .post("/api/v1/auth/login")
    .send({ username: "cashier", password: "Cashier123!" })
    .expect(200);
  await cashier
    .put("/api/v1/profile/password")
    .send({ currentPassword: "wrong", password: "NewSecure123!" })
    .expect(400);
  await cashier
    .put("/api/v1/profile/password")
    .send({ currentPassword: "Cashier123!", password: "short" })
    .expect(400);
  await cashier
    .put("/api/v1/profile/password")
    .send({ currentPassword: "Cashier123!", password: "NewSecure123!" })
    .expect(200);
  await other.get("/api/v1/workspace").expect(401);
  await cashier.get("/api/v1/workspace").expect(200);
  await request(app)
    .post("/api/v1/auth/login")
    .send({ username: "cashier", password: "Cashier123!" })
    .expect(401);
  await request(app)
    .post("/api/v1/auth/login")
    .send({ username: "cashier", password: "NewSecure123!" })
    .expect(200);
  assert.equal(
    JSON.stringify(await db.query("SELECT * FROM audit")).includes(
      "NewSecure123!",
    ),
    false,
  );
});

test("additive tables preserve an existing shop across database reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "sayinn-migration-"));
  let persistent;
  try {
    const file = join(dir, "shop.sqlite");
    persistent = await database(undefined, file);
    const first = await createApp(persistent, { demo: true });
    const client = request.agent(first);
    await client
      .post("/api/v1/auth/login")
      .send({ username: "owner", password: "Owner123!" })
      .expect(200);
    const before = (await client.get("/api/v1/workspace")).body;
    await persistent.query("DROP TABLE product_fields");
    await persistent.query("DROP TABLE category_fields");
    await persistent.query("DROP TABLE images");
    await persistent.query("DROP TABLE profiles");
    await persistent.close();
    persistent = await database(undefined, file);
    const second = await createApp(persistent, { demo: true });
    const renewed = request.agent(second);
    await renewed
      .post("/api/v1/auth/login")
      .send({ username: "owner", password: "Owner123!" })
      .expect(200);
    const after = (await renewed.get("/api/v1/workspace").expect(200)).body;
    assert.equal(after.products.length, before.products.length);
    assert.equal(after.sales.length, before.sales.length);
    assert.equal(after.user.id, before.user.id);
    await renewed
      .put("/api/v1/categories/Persisted/fields")
      .send({ fields: [{ id: "size", label: "Size", type: "text" }] })
      .expect(200);
    await persistent.close();
    persistent = await database(undefined, file);
    assert.equal(
      (await persistent.query("SELECT name FROM category_fields"))[0].name,
      "Persisted",
    );
  } finally {
    await persistent?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
