import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { database } from "../server/database.js";
import { createApp } from "../server/app.js";
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
});
afterEach(() => db.close());
const workspace = async (agent = owner) =>
  (await agent.get("/api/v1/workspace").expect(200)).body;
const save = async (methods) =>
  (await owner.put("/api/v1/payment-methods").send(methods).expect(200)).body;
async function cart(agent, method) {
  const data = await workspace(agent),
    product = data.products.find((p) => p.stock > 2 && p.price > 0);
  await agent.post("/api/v1/shifts/open").send({ opening: 0 }).expect(200);
  return {
    lines: [{ id: product.id, qty: 1 }],
    payments: [{ method, amount: product.price }],
    idempotency: randomUUID(),
  };
}
test("only owners configure methods; defaults and legacy providers remain available", async () => {
  const data = await workspace();
  for (const name of [
    "Cash",
    "Bank transfer",
    "Mobile Payment",
    "Card",
    "KBZPay",
  ])
    assert.ok(data.paymentMethods.some((m) => m.name === name));
  await cashier
    .put("/api/v1/payment-methods")
    .send(data.paymentMethods)
    .expect(403);
  await owner
    .put("/api/v1/payment-methods")
    .send(data.paymentMethods.filter((m) => m.id !== "Cash"))
    .expect(400);
  await owner
    .put("/api/v1/payment-methods")
    .send(data.paymentMethods.map((m) => ({ ...m, cashier: false })))
    .expect(400);
});
test("custom methods record immutable names, preserve idempotency and cannot be deleted after use or rename", async () => {
  let methods = await save([
    ...(await workspace()).paymentMethods,
    { name: "Local Wallet", enabled: true, cashier: true },
  ]);
  const custom = methods.find((m) => m.name === "Local Wallet"),
    body = await cart(cashier, custom.id);
  const sale = (await cashier.post("/api/v1/sales").send(body).expect(201))
    .body;
  assert.equal(sale.payments[0].method, "Local Wallet");
  assert.equal(sale.payments[0].methodId, custom.id);
  methods = await save(
    methods.map((m) =>
      m.id === custom.id ? { ...m, name: "Renamed Wallet", enabled: false } : m,
    ),
  );
  const replay = await cashier.post("/api/v1/sales").send(body).expect(201);
  assert.equal(replay.body.id, sale.id);
  assert.equal(replay.body.payments[0].method, "Local Wallet");
  await cashier
    .post("/api/v1/sales")
    .send({ ...body, idempotency: randomUUID() })
    .expect(400);
  await owner
    .put("/api/v1/payment-methods")
    .send(methods.filter((m) => m.id !== custom.id))
    .expect(400);
  assert.equal(
    (await workspace()).sales.find((s) => s.id === sale.id).payments[0].method,
    "Local Wallet",
  );
});
test("owner-only methods reject cashier checkout and unused methods can be deleted", async () => {
  const original = (await workspace()).paymentMethods;
  const methods = await save([
    ...original,
    { name: "Owner terminal", enabled: true, cashier: false },
  ]);
  const custom = methods.find((m) => m.name === "Owner terminal");
  assert.ok(
    !(await workspace(cashier)).paymentMethods.some((m) => m.id === custom.id),
  );
  const body = await cart(cashier, custom.id);
  const before = (await workspace()).products.find(
    (p) => p.id === body.lines[0].id,
  ).stock;
  await cashier.post("/api/v1/sales").send(body).expect(400);
  assert.equal(
    (await workspace()).products.find((p) => p.id === body.lines[0].id).stock,
    before,
  );
  await save(original);
  assert.ok(
    !(await workspace()).paymentMethods.some((m) => m.id === custom.id),
  );
});
test("renaming a previously used legacy method cannot bypass deletion protection", async () => {
  const body = await cart(owner, "KBZPay");
  const sale = (await owner.post("/api/v1/sales").send(body).expect(201)).body;
  // Simulate a pre-upgrade payment snapshot without an identity field.
  await db.query("UPDATE sales SET payments=? WHERE id=?", [
    JSON.stringify([{ method: "KBZPay", amount: sale.total }]),
    sale.id,
  ]);
  let methods = (await workspace()).paymentMethods;
  methods = await save(
    methods.map((m) =>
      m.id === "KBZPay" ? { ...m, name: "New Wallet Name" } : m,
    ),
  );
  await owner
    .put("/api/v1/payment-methods")
    .send(methods.filter((m) => m.id !== "KBZPay"))
    .expect(400);
});
