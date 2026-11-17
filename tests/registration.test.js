import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { database } from "../server/database.js";
import { createHub } from "../server/hub.js";

let root, hub;
let delivered;
let codes;
beforeEach(async () => {
  codes = {};
  delivered = new Map();
  root = await database(undefined, ":memory:");
  hub = await createHub(root, {
    demo: true,
    sendEmail: async (email, code) => delivered.set(email, code),
    openShop: () => database(undefined, ":memory:"),
  });
});
afterEach(async () => {
  await hub.closeShops();
  await root.close();
});
const details = {
  name: "New Owner",
  username: "owner",
  password: "StrongPassword123!",
  email: "owner@example.com",
  phone: "+959123456789",
};
async function proof(app, db, email) {
  if (!email.includes("@")) return {};
  await db.query("UPDATE email_challenges SET sent='' WHERE email=?", [
    email.toLowerCase(),
  ]);
  const response = await request(app)
    .post("/api/v1/auth/email-code")
    .send({ email })
    .expect(200);
  return {
    challengeId: response.body.challengeId,
    verificationCode: delivered.get(email.toLowerCase()),
  };
}
const register = (code, overrides = {}) => ({
  async expect(status) {
    const verification = await proof(
      hub,
      root,
      overrides.email || details.email,
    );
    const res = await request(hub)
      .post("/api/v1/auth/register")
      .send({
        ...details,
        role: "OWNER",
        shopCode: overrides.role === "MEMBER" ? codes[code] || code : code,
        storeName: code,
        ...overrides,
        ...verification,
      })
      .expect(status);
    if (res.status === 201 && !res.body.pending)
      codes[code] = res.body.shopCode;
    return res;
  },
});
const login = async (
  code,
  username = details.username,
  password = details.password,
) => {
  const client = request.agent(hub);
  await client
    .post("/api/v1/auth/login")
    .send({ shopCode: codes[code] || code, username, password })
    .expect(200);
  return client;
};
const workspace = async (client) =>
  (await client.get("/api/v1/workspace").expect(200)).body;

test("manual shop requests are owner reviewed, rejected explicitly and audited", async () => {
  await register("host-shop").expect(201);
  await register("guest-shop").expect(201);
  const host = await login("host-shop"),
    guest = await login("guest-shop");
  await guest
    .post("/api/v1/account/shops/join")
    .send({ shopCode: codes["host-shop"] || "host-shop" })
    .expect(201);
  await guest
    .post("/api/v1/account/shops/join")
    .send({ shopCode: codes["host-shop"] || "host-shop" })
    .expect(409);
  const member = (await workspace(host)).team.find((u) => u.pending);
  await guest
    .patch("/api/v1/team/" + member.id)
    .send({ active: true })
    .expect(404);
  await host
    .patch("/api/v1/team/" + member.id)
    .send({ active: false, decision: "rejected" })
    .expect(200);
  const shops = (await guest.get("/api/v1/account/shops").expect(200)).body
    .shops;
  assert.equal(
    shops.find((s) => s.code === codes["host-shop"]).status,
    "rejected",
  );
  assert.equal(shops.find((s) => s.code === codes["host-shop"]).pending, false);
  await guest
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["host-shop"] || "host-shop" })
    .expect(403);
  assert.equal(
    (await workspace(host)).team.find((u) => u.id === member.id).requestStatus,
    "rejected",
  );
});

test("owners create separate shops with saved profiles and isolated sessions/data", async () => {
  await register("shop-one").expect(201);
  await register("shop-two").expect(201);
  const one = await login("shop-one"),
    two = await login("shop-two");
  const first = await workspace(one);
  assert.equal(first.settings.storeName, "shop-one");
  assert.equal(first.shopCode, codes["shop-one"]);
  assert.equal(first.user.email, details.email);
  assert.equal(first.user.phone, details.phone);
  assert.equal(first.user.role, "OWNER");
  assert.equal(first.products.length, 0);
  assert.equal(first.sales.length, 0);
  await one.post("/api/v1/categories").send({ name: "Private" }).expect(201);
  const p = await one
    .post("/api/v1/products")
    .send({
      name: "Private product",
      variant: "",
      sku: "SAME-SKU",
      category: "Private",
      price: 100,
      cost: 40,
      stock: 5,
      threshold: 1,
    })
    .expect(201);
  assert.equal((await workspace(two)).products.length, 0);
  await two
    .put("/api/v1/products/" + p.body.id)
    .send({
      name: "Intrusion",
      variant: "",
      sku: "SAME-SKU",
      category: "Private",
      price: 100,
      cost: 40,
      stock: 5,
      threshold: 1,
    })
    .expect(404);
  const cookies = (
    await request(hub)
      .post("/api/v1/auth/login")
      .send({ ...details, shopCode: codes["shop-one"] || "shop-one" })
  ).headers["set-cookie"];
  const session = cookies
    .find((c) => c.startsWith("sayinn_session="))
    .split(";")[0];
  const tampered = await request(hub)
    .get("/api/v1/workspace")
    .set("Cookie", [session, "sayinn_shop=shop-two"])
    .expect(200);
  assert.equal(tampered.body.shopCode, codes["shop-one"]);
  await one
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["shop-two"] || "shop-two" })
    .expect(403);
  const original = await login("main", "owner", "Owner123!");
  assert.equal((await workspace(original)).products.length, 8);
});

test("member registration requires owner approval and never grants owner access", async () => {
  await register("team-shop").expect(201);
  await register("team-shop", {
    role: "MEMBER",
    username: "member",
    name: "New Member",
  }).expect(201);
  await request(hub)
    .post("/api/v1/auth/login")
    .send({
      ...details,
      username: "member",
      shopCode: codes["team-shop"] || "team-shop",
    })
    .expect(401);
  const owner = await login("team-shop");
  const member = (await workspace(owner)).team.find(
    (u) => u.username === "member",
  );
  assert.equal(member.active, 0);
  assert.equal(member.role, "CASHIER");
  assert.ok(member.pending);
  assert.equal(member.email, details.email);
  await owner
    .patch("/api/v1/team/" + member.id)
    .send({ active: true })
    .expect(200);
  const client = await login("team-shop", "member");
  assert.equal((await workspace(client)).user.role, "CASHIER");
  await client.post("/api/v1/team").send({}).expect(403);
  await client.put("/api/v1/settings").send({}).expect(403);
  assert.equal(
    (await workspace(owner)).team.find((u) => u.id === member.id).pending,
    null,
  );
});

test("registration rejects invalid roles, personal details, unsafe codes and duplicates", async () => {
  await register("valid-shop", { role: "ADMIN" }).expect(400);
  await register("../unsafe").expect(400);
  await register("bad-email", { email: "invalid" }).expect(400);
  await register("bad-phone", { phone: "letters" }).expect(400);
  await register("bad-password", { password: "short" }).expect(400);
  await register("no-name", { storeName: "" }).expect(400);

  await register("missing-shop", { role: "MEMBER" }).expect(404);
  await register("valid-shop").expect(201);
  const next = await register("valid-shop").expect(201);
  assert.match(next.body.shopCode, /^sh-[a-f0-9]{16}$/);
  await register("valid-shop", { role: "MEMBER" }).expect(409);
  assert.equal(
    (await root.query("SELECT * FROM shops WHERE ready=1")).length,
    2,
  );
});

test("failed login preserves the existing shop session and foreign origins cannot register", async () => {
  await register("origin-shop").expect(201);
  const client = await login("origin-shop");
  await client
    .post("/api/v1/auth/login")
    .send({ shopCode: "main", username: "owner", password: "wrong" })
    .expect(401);
  assert.equal((await workspace(client)).shopCode, codes["origin-shop"]);
  await request(hub)
    .post("/api/v1/auth/register")
    .set("Origin", "https://untrusted.example")
    .send({ ...details, role: "OWNER", shopCode: "other", storeName: "Other" })
    .expect(403);
});

test("shop registrations survive a server restart with separate SQLite files", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "sayinn-registration-"));
  let mainDb, app;
  const boot = async () => {
    mainDb = await database(undefined, path.join(folder, "main.sqlite"));
    app = await createHub(mainDb, {
      sendEmail: async (email, code) => delivered.set(email, code),
      openShop: (code) =>
        database(undefined, path.join(folder, code + ".sqlite")),
    });
  };
  try {
    await boot();
    const created = await request(app)
      .post("/api/v1/auth/register")
      .send({
        ...details,
        role: "OWNER",
        shopCode: "persistent",
        storeName: "Persistent Shop",
        ...(await proof(app, mainDb, details.email)),
      })
      .expect(201);
    await app.closeShops();
    await mainDb.close();
    app = null;
    mainDb = null;
    await boot();
    const client = request.agent(app);
    await client
      .post("/api/v1/auth/login")
      .send({ ...details, shopCode: created.body.shopCode })
      .expect(200);
    assert.equal(
      (await workspace(client)).settings.storeName,
      "Persistent Shop",
    );
  } finally {
    if (app) await app.closeShops();
    if (mainDb) await mainDb.close();
    assert.ok(
      path
        .resolve(folder)
        .startsWith(path.join(path.resolve(tmpdir()), "sayinn-registration-")),
    );
    await rm(folder, { recursive: true, force: true });
  }
});

test("one account owns multiple shops and can be a member elsewhere without inheriting owner access", async () => {
  await register("home-shop").expect(201);
  await register("other-owner").expect(201);
  const user = await login("home-shop"),
    other = await login("other-owner");
  await user
    .post("/api/v1/account/shops")
    .send({
      shopCode: codes["second-shop"] || "second-shop",
      storeName: "Second Shop",
    })
    .expect(201)
    .expect((res) => {
      codes["second-shop"] = res.body.shopCode;
    });
  const shops = (await user.get("/api/v1/account/shops").expect(200)).body;
  assert.deepEqual(
    shops.shops.map((s) => s.code),
    [codes["home-shop"], codes["second-shop"]].sort(),
  );
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["second-shop"] || "second-shop" })
    .expect(200);
  assert.equal((await workspace(user)).user.role, "OWNER");
  assert.equal((await workspace(user)).settings.storeName, "Second Shop");
  await user
    .post("/api/v1/products")
    .set("X-Shop-Code", codes["home-shop"])
    .send({})
    .expect(409);
  await user
    .post("/api/v1/account/shops/join")
    .send({ shopCode: codes["other-owner"] || "other-owner" })
    .expect(201);
  await user
    .post("/api/v1/account/shops/join")
    .send({ shopCode: codes["other-owner"] || "other-owner" })
    .expect(409);
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["other-owner"] || "other-owner" })
    .expect(403);
  const member = (await workspace(other)).team.find((u) => u.pending);
  assert.equal(member.name, details.name);
  await other
    .patch("/api/v1/team/" + member.id)
    .send({ active: true })
    .expect(200);
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["other-owner"] || "other-owner" })
    .expect(200);
  assert.equal((await workspace(user)).user.role, "CASHIER");
  await user.put("/api/v1/settings").send({}).expect(403);
  await user.post("/api/v1/team").send({}).expect(403);
  // An account's right to create its own shop is separate from its current membership.
  await user
    .post("/api/v1/account/shops")
    .send({
      shopCode: codes["third-shop"] || "third-shop",
      storeName: "Third Shop",
    })
    .expect(201)
    .expect((res) => {
      codes["third-shop"] = res.body.shopCode;
    });
  await other
    .patch("/api/v1/team/" + member.id)
    .send({ active: false })
    .expect(200);
  await user.get("/api/v1/workspace").expect(403);
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["home-shop"] || "home-shop" })
    .expect(200);
  assert.equal((await workspace(user)).user.role, "OWNER");
  await user.post("/api/v1/auth/logout").send({}).expect(200);
  await user.get("/api/v1/account/shops").expect(401);
  assert.equal(
    (await (await login("home-shop")).get("/api/v1/account/shops")).body.shops
      .length,
    4,
  );
});

test("global profile and password changes follow the account across shops", async () => {
  await register("profile-home").expect(201);
  const user = await login("profile-home"),
    older = await login("profile-home");
  await user
    .post("/api/v1/account/shops")
    .send({
      shopCode: codes["profile-second"] || "profile-second",
      storeName: "Second",
    })
    .expect(201)
    .expect((res) => {
      codes["profile-second"] = res.body.shopCode;
    });
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["profile-second"] || "profile-second" })
    .expect(200);
  await user
    .put("/api/v1/profile")
    .send({
      name: "Updated Account",
      username: "updated",
      email: "updated@example.com",
      phone: "091234567",
      image: "",
    })
    .expect(200);
  assert.equal((await workspace(user)).user.name, "Updated Account");
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: codes["profile-home"] || "profile-home" })
    .expect(200);
  assert.equal((await workspace(user)).user.email, "updated@example.com");
  await user
    .put("/api/v1/profile/password")
    .send({ currentPassword: "wrong", password: "AnotherPassword123!" })
    .expect(400);
  await user
    .put("/api/v1/profile/password")
    .send({
      currentPassword: details.password,
      password: "AnotherPassword123!",
    })
    .expect(200);
  await older.get("/api/v1/workspace").expect(401);
  await request(hub)
    .post("/api/v1/auth/login")
    .send({ ...details, shopCode: codes["profile-home"] || "profile-home" })
    .expect(401);
  const fresh = await login("profile-home", "updated", "AnotherPassword123!");
  assert.equal((await fresh.get("/api/v1/account/shops")).body.shops.length, 2);
});

test("legacy shop sessions upgrade without losing existing data", async () => {
  // Simulate a session issued before account memberships were introduced.
  const { createApp } = await import("../server/app.js");
  const legacy = await createApp(root);
  const result = await request(legacy)
    .post("/api/v1/auth/login")
    .send({ username: "owner", password: "Owner123!" })
    .expect(200);
  const cookie = result.headers["set-cookie"][0].split(";")[0];
  const migrated = await request(hub)
    .get("/api/v1/workspace")
    .set("Cookie", cookie)
    .expect(200);
  assert.equal(migrated.body.products.length, 8);
  assert.equal((await root.query("SELECT * FROM accounts")).length, 1);
  assert.equal((await root.query("SELECT * FROM sessions")).length, 0);
  await request(hub)
    .post("/api/v1/auth/logout")
    .set("Cookie", cookie)
    .send({})
    .expect(200);
  await request(hub).get("/api/v1/workspace").set("Cookie", cookie).expect(401);
});

test("shop codes are generated without input and cannot be chosen by the client", async () => {
  const first = await register(undefined, { storeName: "Random shop" }).expect(
    201,
  );
  const second = await register("chosen-code", {
    storeName: "Random shop",
  }).expect(201);
  assert.match(first.body.shopCode, /^sh-[a-f0-9]{16}$/);
  assert.notEqual(second.body.shopCode, "chosen-code");
  assert.notEqual(first.body.shopCode, second.body.shopCode);
  const user = await login(first.body.shopCode);
  const created = await user
    .post("/api/v1/account/shops")
    .send({ storeName: "Another" })
    .expect(201);
  assert.match(created.body.shopCode, /^sh-[a-f0-9]{16}$/);
  assert.equal((await workspace(user)).shopCode, first.body.shopCode);
  await request(hub)
    .post("/api/v1/auth/register")
    .send({ ...details, role: "MEMBER" })
    .expect(400);
});

test("logo image URLs are isolated by explicit shop even after switching", async () => {
  const sharp = (await import("sharp")).default;
  const created = await register(undefined, { storeName: "Logo A" }).expect(
    201,
  );
  const code = created.body.shopCode,
    user = await login(code);
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  const upload = await user
    .post("/api/v1/images")
    .send({
      purpose: "shop",
      data: "data:image/png;base64," + png.toString("base64"),
    })
    .expect(201);
  await user
    .put("/api/v1/settings")
    .send({
      storeName: "Logo A",
      taxBps: 0,
      currency: "MMK",
      receiptFooter: "Thanks",
      shopLogo: upload.body.url,
    })
    .expect(200);
  assert.equal((await workspace(user)).settings.shopLogo, upload.body.url);
  const other = await user
    .post("/api/v1/account/shops")
    .send({ storeName: "Logo B" })
    .expect(201);
  await user
    .post("/api/v1/account/shops/switch")
    .send({ shopCode: other.body.shopCode })
    .expect(200);
  await user
    .get(upload.body.url + "?shop=" + code)
    .expect(200)
    .expect("Cache-Control", "private, no-store");
  await user.get(upload.body.url + "?shop=" + other.body.shopCode).expect(404);
  assert.ok(!(await workspace(user)).settings.shopLogo);
  const outsider = await register(undefined, { storeName: "Outsider" }).expect(
    201,
  );
  const stranger = await login(outsider.body.shopCode);
  await stranger.get(upload.body.url + "?shop=" + code).expect(403);
});

test("random shop code collisions retry without changing the existing shop", async () => {
  const { reserveShopCode } = await import("../server/hub.js");
  const first = await reserveShopCode(root, () => Buffer.alloc(8, 1));
  let calls = 0;
  const second = await reserveShopCode(root, () =>
    Buffer.alloc(8, ++calls === 1 ? 1 : 2),
  );
  assert.notEqual(first, second);
  assert.equal(calls, 2);
  assert.equal(
    (await root.query("SELECT * FROM shops WHERE code=?", [first])).length,
    1,
  );
  await assert.rejects(() => reserveShopCode(root, () => Buffer.alloc(8, 1)), {
    status: 503,
  });
});
