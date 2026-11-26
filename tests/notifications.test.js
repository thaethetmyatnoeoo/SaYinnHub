import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { database } from "../server/database.js";
import { createApp } from "../server/app.js";

test("notification read, unread and deletion persist per user without changing inventory", async () => {
  const db = await database(undefined, ":memory:");
  try {
    const app = await createApp(db, { demo: true });
    const owner = request.agent(app),
      cashier = request.agent(app);
    await owner
      .post("/api/v1/auth/login")
      .send({ username: "owner", password: "Owner123!" })
      .expect(200);
    await cashier
      .post("/api/v1/auth/login")
      .send({ username: "cashier", password: "Cashier123!" })
      .expect(200);
    const [product] = await db.query("SELECT id FROM products LIMIT 1");
    await db.query("UPDATE products SET stock=2,threshold=5 WHERE id=?", [
      product.id,
    ]);
    const list = async (agent = owner) =>
      (await agent.get("/api/v1/workspace").expect(200)).body.notifications;
    const item = (await list()).find((n) => n.id === product.id);
    assert.equal(item.status, "unread");
    const update = (status, items = [item]) =>
      owner.put("/api/v1/notifications").send({ items, status }).expect(200);
    await update("read");
    assert.equal((await list()).find((n) => n.id === item.id).status, "read");
    assert.equal(
      (await list(cashier)).find((n) => n.id === item.id).status,
      "unread",
    );
    await update("unread");
    assert.equal((await list()).find((n) => n.id === item.id).status, "unread");
    await update("read", await list());
    assert.ok((await list()).every((n) => n.status === "read"));
    await update("deleted");
    assert.ok(!(await list()).some((n) => n.id === item.id));
    assert.equal(
      (await db.query("SELECT stock FROM products WHERE id=?", [item.id]))[0]
        .stock,
      2,
    );
    await db.query("UPDATE products SET stock=1 WHERE id=?", [item.id]);
    assert.equal((await list()).find((n) => n.id === item.id).status, "unread");
    await update("deleted"); // A stale request must not hide a newer stock alert.
    assert.ok((await list()).some((n) => n.id === item.id));
    await owner
      .put("/api/v1/notifications")
      .send({ items: [item], status: "invalid" })
      .expect(400);
    await request(app)
      .put("/api/v1/notifications")
      .send({ items: [item], status: "read" })
      .expect(401);
  } finally {
    await db.close();
  }
});
