import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { database } from "../server/database.js";
import { createHub } from "../server/hub.js";
import { emailVerification } from "../server/features/email-verification.js";

test("email codes are bound, hashed, single-use, expiring and attempt-limited", async () => {
  const db = await database(undefined, ":memory:");
  let delivered;
  const v = await emailVerification(db, async (email, code) => {
    delivered = code;
  });
  try {
    const first = await v.request("Owner@example.com");
    assert.match(delivered, /^\d{6}$/);
    const [row] = await db.query("SELECT * FROM email_challenges");
    assert.notEqual(row.digest, delivered);
    await assert.rejects(v.request("owner@example.com"), /60 seconds/);
    await assert.rejects(
      v.consume("other@example.com", first.challengeId, delivered),
      /invalid/,
    );
    await v.consume("owner@example.com", first.challengeId, delivered);
    await assert.rejects(
      v.consume("owner@example.com", first.challengeId, delivered),
      /invalid/,
    );
    await db.query("UPDATE email_challenges SET sent=''");
    const next = await v.request("owner@example.com");
    await assert.rejects(
      v.consume("owner@example.com", first.challengeId, delivered),
      /invalid/,
    );
    const wrong = delivered === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        v.consume("owner@example.com", next.challengeId, wrong),
        /invalid/,
      );
    await assert.rejects(
      v.consume("owner@example.com", next.challengeId, delivered),
      /invalid/,
    );
    await db.query("UPDATE email_challenges SET sent=''");
    const expired = await v.request("owner@example.com");
    await db.query(
      "UPDATE email_challenges SET expires='2000-01-01T00:00:00.000Z'",
    );
    await assert.rejects(
      v.consume("owner@example.com", expired.challengeId, delivered),
      /expired/,
    );
  } finally {
    await db.close();
  }
});

test("registration cannot bypass email verification; delivery failure is not success", async () => {
  const db = await database(undefined, ":memory:");
  const app = await createHub(db, {
    sendEmail: async () => {
      throw Object.assign(new Error("Delivery unavailable"), { status: 503 });
    },
  });
  try {
    await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Test Owner",
        username: "owner",
        email: "test@example.com",
        phone: "09912345678",
        password: "StrongPassword123!",
        role: "OWNER",
        storeName: "Test",
      })
      .expect(400);
    assert.equal((await db.query("SELECT * FROM shops")).length, 0);
    await request(app)
      .post("/api/v1/auth/email-code")
      .send({ email: "test@example.com" })
      .expect(503);
    assert.equal(
      (await db.query("SELECT ready FROM email_challenges"))[0].ready,
      0,
    );
  } finally {
    await app.closeShops();
    await db.close();
  }
});
