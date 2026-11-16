import {
  passwordPolicy,
  phoneNumber,
  optionalPhone,
} from "./features/validation.js";
import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createApp, passwordHash } from "./app.js";
import { database } from "./database.js";
import { configureHttp } from "./http.js";
import { registration, shopCodeSchema } from "./features/registration.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const matches = (password, stored) => {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
};
const cookie = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 8 * 3600000,
};
const shopDetails = z.object({
  shopCode: shopCodeSchema.optional(),
  storeName: z.string().trim().min(1).max(150),
});

export async function createHub(db, { demo = false, openShop } = {}) {
  for (const sql of [
    "CREATE TABLE IF NOT EXISTS shops (code TEXT PRIMARY KEY, ready INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, home_code TEXT NOT NULL, home_user TEXT NOT NULL, name TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', UNIQUE(home_code,home_user), UNIQUE(home_code,username))",
    "CREATE TABLE IF NOT EXISTS memberships (account_id TEXT NOT NULL REFERENCES accounts(id), shop_code TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(account_id,shop_code), UNIQUE(shop_code,user_id))",
    "CREATE TABLE IF NOT EXISTS account_sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), shop_code TEXT NOT NULL, expires TEXT NOT NULL)",
  ])
    await db.query(sql);
  const folder = path.join(
    path.dirname(process.env.DB_FILE || "data/sayinn.sqlite"),
    demo ? "shops-demo" : "shops",
  );
  const open =
    openShop ||
    (async (code) => {
      mkdirSync(folder, { recursive: true });
      const schema =
        "sayinn_" + hash((demo ? "demo:" : "live:") + code).slice(0, 32);
      return database(
        process.env.DATABASE_URL,
        path.join(folder, code + ".sqlite"),
        schema,
      );
    });
  const cache = new Map(),
    connections = new Set();
  cache.set(
    "main",
    Promise.resolve({
      db,
      app: await createApp(db, { demo, shopCode: "main" }),
    }),
  );
  async function resolve(code) {
    if (code === "main") return cache.get(code);
    if (
      !(
        await db.query("SELECT code FROM shops WHERE code=? AND ready=1", [
          code,
        ])
      ).length
    )
      fail("Shop code was not found. Ask the shop owner for the code.", 404);
    if (!cache.has(code)) {
      const pending = (async () => {
        const tenant = await open(code);
        connections.add(tenant);
        return { db: tenant, app: await createApp(tenant, { shopCode: code }) };
      })();
      cache.set(code, pending);
      pending.catch(() => cache.delete(code));
    }
    return cache.get(code);
  }
  async function enroll(code, user, tenant) {
    const profile =
      (
        await tenant.query("SELECT * FROM profiles WHERE user_id=?", [user.id])
      )[0] || {};
    let image = "";
    if (profile.image?.startsWith("/api/v1/images/"))
      image =
        (
          await tenant.query("SELECT content FROM images WHERE id=?", [
            profile.image.split("/").pop(),
          ])
        )[0]?.content || "";
    return db.transaction(async (tx) => {
      const existing = (
        await tx.query(
          "SELECT a.* FROM accounts a JOIN memberships m ON m.account_id=a.id WHERE m.shop_code=? AND m.user_id=?",
          [code, user.id],
        )
      )[0];
      if (existing) return existing;
      const id = randomUUID();
      await tx.query(
        "INSERT INTO accounts (id,home_code,home_user,name,username,password,email,phone,image) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          id,
          code,
          user.id,
          user.name,
          user.username,
          user.password,
          profile.email || "",
          profile.phone || "",
          image,
        ],
      );
      await tx.query("INSERT INTO memberships VALUES (?,?,?)", [
        id,
        code,
        user.id,
      ]);
      return (await tx.query("SELECT * FROM accounts WHERE id=?", [id]))[0];
    });
  }
  async function membership(accountId, code) {
    const link = (
      await db.query(
        "SELECT * FROM memberships WHERE account_id=? AND shop_code=?",
        [accountId, code],
      )
    )[0];
    if (!link) return null;
    const tenant = await resolve(code);
    const user = (
      await tenant.db.query(
        "SELECT id,name,username,role,active FROM users WHERE id=?",
        [link.user_id],
      )
    )[0];
    return user ? { ...link, user, tenant } : null;
  }
  async function listShops(accountId) {
    const links = await db.query(
      "SELECT * FROM memberships WHERE account_id=? ORDER BY shop_code",
      [accountId],
    );
    return Promise.all(
      links.map(async (link) => {
        const tenant = await resolve(link.shop_code);
        const user = (
          await tenant.db.query("SELECT role,active FROM users WHERE id=?", [
            link.user_id,
          ])
        )[0];
        const settings = JSON.parse(
          (await tenant.db.query("SELECT value FROM settings WHERE id=1"))[0]
            ?.value || "{}",
        );
        const pending =
          (
            await tenant.db.query(
              "SELECT user_id FROM member_requests WHERE user_id=?",
              [link.user_id],
            )
          ).length > 0;
        return {
          code: link.shop_code,
          name: settings.storeName || link.shop_code,
          role: user?.role || "CASHIER",
          active: !!user?.active,
          pending,
          status: pending
            ? "pending"
            : (
                await tenant.db.query(
                  "SELECT status FROM membership_decisions WHERE user_id=?",
                  [link.user_id],
                )
              )[0]?.status || (user?.active ? "approved" : "disabled"),
        };
      }),
    );
  }
  async function provision(d, account) {
    d.shopCode = await reserveShopCode(db);
    const tenant = await open(d.shopCode);
    connections.add(tenant);
    const bootstrap = account
      ? {
          ...d,
          name: account.name,
          username: account.username,
          email: account.email,
          phone: account.phone,
          password: randomBytes(32).toString("hex"),
        }
      : d;
    const app = await createApp(tenant, { bootstrap, shopCode: d.shopCode });
    const user = (
      await tenant.query("SELECT * FROM users WHERE role='OWNER'")
    )[0];
    if (account)
      await db.query("INSERT INTO memberships VALUES (?,?,?)", [
        account.id,
        d.shopCode,
        user.id,
      ]);
    else account = await enroll(d.shopCode, user, tenant);
    await db.query("UPDATE shops SET ready=1 WHERE code=?", [d.shopCode]);
    cache.set(d.shopCode, Promise.resolve({ db: tenant, app }));
    return account;
  }
  const app = express();
  configureHttp(app);
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post("/api/v1/auth/register", limit, async (req, res) => {
    const d = registration.parse(req.body);
    if (d.role === "OWNER") await provision(d);
    else {
      const tenant = await resolve(d.shopCode);
      const id = randomUUID();
      await tenant.db.transaction(async (tx) => {
        if (
          !(
            await tx.query(
              "SELECT id FROM users WHERE role='OWNER' AND active=1",
            )
          ).length
        )
          fail("This shop is not accepting members yet.", 409);
        await tx.query("INSERT INTO users VALUES (?,?,?,?,?,0)", [
          id,
          d.name,
          d.username,
          passwordHash(d.password),
          "CASHIER",
        ]);
        await tx.query(
          "INSERT INTO profiles (user_id,email,phone) VALUES (?,?,?)",
          [id, d.email, d.phone],
        );
        await tx.query("INSERT INTO member_requests VALUES (?,?)", [id, now()]);
      });
      await enroll(
        d.shopCode,
        (await tenant.db.query("SELECT * FROM users WHERE id=?", [id]))[0],
        tenant.db,
      );
    }
    res
      .status(201)
      .json({ ok: true, shopCode: d.shopCode, pending: d.role === "MEMBER" });
  });
  app.post("/api/v1/auth/login", limit, async (req, res) => {
    const d = z
      .object({
        username: z.string().trim().min(1).max(150),
        password: z.string().max(128),
        shopCode: shopCodeSchema.default("main"),
      })
      .parse(req.body);
    let account = (
      await db.query(
        "SELECT * FROM accounts WHERE home_code=? AND username=?",
        [d.shopCode, d.username],
      )
    )[0];
    if (!account) {
      const tenant = await resolve(d.shopCode);
      const user = (
        await tenant.db.query("SELECT * FROM users WHERE username=?", [
          d.username,
        ])
      )[0];
      if (!user || !user.active)
        fail("Username or password is incorrect.", 401);
      const mapped = (
        await db.query(
          "SELECT account_id FROM memberships WHERE shop_code=? AND user_id=?",
          [d.shopCode, user.id],
        )
      )[0];
      if (mapped || !matches(d.password, user.password))
        fail(
          "Use your account’s original sign-in shop code and current credentials.",
          401,
        );
      account = await enroll(d.shopCode, user, tenant.db);
    }
    if (!matches(d.password, account.password))
      fail("Username or password is incorrect.", 401);
    const shops = await listShops(account.id);
    const selected =
      shops.find((s) => s.code === d.shopCode && s.active) ||
      shops.find((s) => s.active);
    if (!selected)
      fail(
        shops.some((s) => s.status === "pending")
          ? "Pending: your membership is awaiting owner approval."
          : shops.some((s) => s.status === "rejected")
            ? "Rejected: the shop owner rejected your membership request."
            : "Your membership has been disabled.",
        401,
      );
    const token = randomBytes(32).toString("hex");
    await db.query("INSERT INTO account_sessions VALUES (?,?,?,?)", [
      hash(token),
      account.id,
      selected.code,
      new Date(Date.now() + 8 * 3600000).toISOString(),
    ]);
    res
      .cookie("sayinn_session", token, cookie)
      .cookie("sayinn_shop", selected.code, cookie)
      .json({ ok: true });
  });
  // Upgrade an existing, authenticated shop session without changing any credentials.
  app.use("/api/v1", async (req, res, next) => {
    const token = req.cookies.sayinn_session;
    if (token) {
      let session = (
        await db.query(
          "SELECT * FROM account_sessions WHERE id=? AND expires>?",
          [hash(token), now()],
        )
      )[0];
      if (!session) {
        const code = shopCodeSchema.safeParse(
          req.cookies.sayinn_shop || "main",
        );
        if (code.success) {
          let tenant;
          try {
            tenant = await resolve(code.data);
          } catch {}
          if (tenant) {
            const old = (
              await tenant.db.query(
                "SELECT u.*,s.expires FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>? AND u.active=1",
                [hash(token), now()],
              )
            )[0];
            if (old) {
              const account = await enroll(code.data, old, tenant.db);
              await db.query(
                "INSERT INTO account_sessions VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING",
                [hash(token), account.id, code.data, old.expires],
              );
              await tenant.db.query("DELETE FROM sessions WHERE id=?", [
                hash(token),
              ]);
              session = {
                id: hash(token),
                account_id: account.id,
                shop_code: code.data,
                expires: old.expires,
              };
            }
          }
        }
      }
      if (session) {
        req.accountSession = session;
        req.account = (
          await db.query("SELECT * FROM accounts WHERE id=?", [
            session.account_id,
          ])
        )[0];
      }
    }
    next();
  });
  const authenticated = (req, res, next) => {
    if (!req.account)
      return res
        .status(401)
        .json({ error: { message: "Please sign in to continue." } });
    next();
  };
  app.get("/api/v1/status", async (req, res) =>
    res.json({
      setup: false,
      demo,
      shopCode: req.account?.home_code || "main",
      database: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite",
    }),
  );
  app.post("/api/v1/auth/logout", authenticated, async (req, res) => {
    await db.query("DELETE FROM account_sessions WHERE id=?", [
      req.accountSession.id,
    ]);
    res
      .clearCookie("sayinn_session", { path: "/" })
      .clearCookie("sayinn_shop", { path: "/" })
      .json({ ok: true });
  });
  app.get("/api/v1/account/shops", authenticated, async (req, res) =>
    res.json({
      shops: await listShops(req.account.id),
      current: req.accountSession.shop_code,
      homeCode: req.account.home_code,
    }),
  );
  app.post("/api/v1/account/shops", authenticated, limit, async (req, res) => {
    const d = shopDetails.parse(req.body);
    await provision(d, req.account);
    res.status(201).json({ ok: true, shopCode: d.shopCode });
  });
  app.post(
    "/api/v1/account/shops/join",
    authenticated,
    limit,
    async (req, res) => {
      const { shopCode } = z
        .object({ shopCode: shopCodeSchema })
        .parse(req.body);
      if (await membership(req.account.id, shopCode))
        fail("This shop is already in your list.", 409);
      const tenant = await resolve(shopCode),
        id = randomUUID();
      // A deterministic internal username prevents duplicate requests during races.
      await tenant.db.transaction(async (tx) => {
        await tx.query("INSERT INTO users VALUES (?,?,?,?,?,0)", [
          id,
          req.account.name,
          "account_" + req.account.id,
          passwordHash(randomBytes(32).toString("hex")),
          "CASHIER",
        ]);
        await tx.query(
          "INSERT INTO profiles (user_id,email,phone) VALUES (?,?,?)",
          [id, req.account.email, req.account.phone],
        );
        await tx.query("INSERT INTO member_requests VALUES (?,?)", [id, now()]);
      });
      await db.query("INSERT INTO memberships VALUES (?,?,?)", [
        req.account.id,
        shopCode,
        id,
      ]);
      res.status(201).json({ ok: true, pending: true });
    },
  );
  app.post("/api/v1/account/shops/switch", authenticated, async (req, res) => {
    const { shopCode } = z.object({ shopCode: shopCodeSchema }).parse(req.body);
    const link = await membership(req.account.id, shopCode);
    if (!link?.user.active)
      fail("You do not have approved access to this shop.", 403);
    await db.query("UPDATE account_sessions SET shop_code=? WHERE id=?", [
      shopCode,
      req.accountSession.id,
    ]);
    res.cookie("sayinn_shop", shopCode, cookie).json({ ok: true });
  });
  app.get("/api/v1/account/image", authenticated, (req, res) => {
    if (!req.account.image) return res.sendStatus(404);
    res.type("png").send(Buffer.from(req.account.image, "base64"));
  });
  async function accountAudit(req, action) {
    const link = await membership(req.account.id, req.accountSession.shop_code);
    if (link?.user.active)
      await link.tenant.db.query("INSERT INTO audit VALUES (?,?,?,?,?,?)", [
        randomUUID(),
        req.account.name,
        action,
        req.account.id,
        "{}",
        now(),
      ]);
  }
  app.put(
    "/api/v1/profile/password",
    authenticated,
    limit,
    async (req, res) => {
      if (
        req.body.confirmPassword !== undefined &&
        req.body.confirmPassword !== req.body.password
      )
        fail("Passwords must match.");
      const d = z
        .object({
          currentPassword: z.string().max(128),
          password: passwordPolicy,
        })
        .parse(req.body);
      if (!matches(d.currentPassword, req.account.password))
        fail("Current password is incorrect.");
      if (d.password === d.currentPassword)
        fail("Choose a different new password.");
      await db.transaction(async (tx) => {
        await tx.query("UPDATE accounts SET password=? WHERE id=?", [
          passwordHash(d.password),
          req.account.id,
        ]);
        await tx.query(
          "DELETE FROM account_sessions WHERE account_id=? AND id<>?",
          [req.account.id, req.accountSession.id],
        );
      });
      for (const link of await db.query(
        "SELECT * FROM memberships WHERE account_id=?",
        [req.account.id],
      ))
        await (
          await resolve(link.shop_code)
        ).db.query("DELETE FROM sessions WHERE user_id=?", [link.user_id]);
      await accountAudit(req, "Password changed");
      res.json({ ok: true });
    },
  );
  app.put("/api/v1/profile", authenticated, async (req, res) => {
    const d = z
      .object({
        name: z.string().trim().min(1).max(100),
        username: z.string().trim().min(1).max(150),
        email: z
          .union([z.literal(""), z.string().email().max(254)])
          .default(""),
        phone: optionalPhone,
        image: z.string().default(""),
      })
      .parse(req.body);
    let image = req.account.image;
    if (!d.image) image = "";
    else if (d.image !== "/api/v1/account/image") {
      const link = await membership(
        req.account.id,
        req.accountSession.shop_code,
      );
      if (!link?.user.active) fail("Shop access is unavailable.", 403);
      if (!/^\/api\/v1\/images\/[0-9a-f-]{36}$/.test(d.image))
        fail("Select a valid profile image.");
      const upload = (
        await link.tenant.db.query(
          "SELECT content FROM images WHERE id=? AND owner_id=? AND purpose='profile'",
          [d.image.split("/").pop(), link.user_id],
        )
      )[0];
      if (!upload) fail("Profile image is unavailable.");
      image = upload.content;
    }
    await db.query(
      "UPDATE accounts SET name=?,username=?,email=?,phone=?,image=? WHERE id=?",
      [d.name, d.username, d.email, d.phone, image, req.account.id],
    );
    await accountAudit(req, "Profile updated");
    res.json({ ok: true });
  });
  app.use(async (req, res, next) => {
    try {
      if (req.path.startsWith("/api/")) {
        if (!req.account)
          return res
            .status(401)
            .json({ error: { message: "Please sign in to continue." } });
        const code =
          req.path.startsWith("/api/v1/images/") && req.query.shop
            ? shopCodeSchema.parse(req.query.shop)
            : req.accountSession.shop_code;
        if (req.get("X-Shop-Code") && req.get("X-Shop-Code") !== code)
          fail(
            "The active shop changed in another tab. Reload before continuing.",
            409,
          );
        const link = await membership(req.account.id, code);
        if (!link?.user.active)
          fail(
            "Your access to this shop is disabled. Choose another shop from the shop selector.",
            403,
          );
        req.hubUser = {
          ...link.user,
          name: req.account.name,
          username: req.account.username,
        };
        // Shop-local auth endpoints cannot bypass the account/session boundary.
        if (
          req.path.startsWith("/api/v1/auth/") ||
          req.path === "/api/v1/setup"
        )
          fail("Endpoint not found.", 404);
        if (req.path === "/api/v1/workspace") {
          const teamAccounts = await db.query(
            "SELECT m.user_id,a.name,a.username,a.email,a.phone FROM memberships m JOIN accounts a ON a.id=m.account_id WHERE m.shop_code=?",
            [code],
          );
          const original = res.json.bind(res);
          res.json = (body) => {
            if (res.statusCode < 400) {
              body.user = {
                ...body.user,
                name: req.account.name,
                username: req.account.username,
                email: req.account.email,
                phone: req.account.phone,
                image: req.account.image ? "/api/v1/account/image" : "",
              };
              body.accountHomeCode = req.account.home_code;
              body.team = body.team.map((u) => ({
                ...u,
                ...(teamAccounts.find((a) => a.user_id === u.id) || {}),
              }));
            }
            return original(body);
          };
        }
        return link.tenant.app(req, res, next);
      }
      (await resolve("main")).app(req, res, next);
    } catch (e) {
      next(e);
    }
  });
  app.use((err, req, res, next) => {
    const conflict = /unique|duplicate/i.test(err.message);
    const status =
      err instanceof z.ZodError ? 400 : err.status || (conflict ? 409 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({
      error: {
        message:
          err instanceof z.ZodError
            ? err.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : conflict
              ? "That shop code, username or membership already exists."
              : err.status
                ? err.message
                : "The request could not be completed.",
      },
    });
  });
  app.closeShops = async () =>
    Promise.all([...connections].map((c) => c.close()));
  return app;
}

export async function reserveShopCode(db, random = randomBytes) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = "sh-" + random(8).toString("hex");
    const reserved = await db.query(
      "INSERT INTO shops (code,created) VALUES (?,?) ON CONFLICT(code) DO NOTHING RETURNING code",
      [code, now()],
    );
    if (reserved.length) return code;
  }
  fail("Unable to allocate a shop code. Please try again.", 503);
}
