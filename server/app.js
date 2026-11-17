import {
  defaultMethods,
  paymentMethods,
  validatePayments,
  registerPayments,
} from "./features/payments.js";
import { generatedSku } from "./features/products.js";
import {
  passwordPolicy,
  phoneNumber,
  optionalPhone,
} from "./features/validation.js";
import express from "express";
import {
  initializeProducts,
  registerProducts,
  linkProduct,
  templates,
  uniqueVariant,
} from "./features/products.js";
import { configureHttp } from "./http.js";
import { personalDetails } from "./features/registration.js";
import { rateLimit } from "express-rate-limit";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import path from "node:path";
import {
  imageReference,
  checkImage,
  readCategories,
  attachFields,
  saveFields,
  registerWorkspaceFeatures,
} from "./features/workspace.js";

const uid = () => randomUUID();
const now = () => new Date().toISOString();
const hash = (s) => createHash("sha256").update(s).digest("hex");
export const passwordHash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
};
const matches = (p, stored) => {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(Buffer.from(key, "hex"), scryptSync(p, salt, 64));
};
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const integer = z.number().int().min(0).max(1_000_000_000);
const text = z.string().trim().min(1).max(150);
const productSchema = z.object({
  name: text,
  variant: z.string().max(100).default(""),
  sku: text,
  category: text,
  price: integer,
  cost: integer.optional(),
  stock: integer,
  threshold: integer.default(5),
  image: imageReference.default("serum.webp"),
  customFields: z
    .record(
      z.string(),
      z.union([z.string().max(1000), z.number().finite(), z.boolean()]),
    )
    .default({}),
});
const parseSale = (s) => ({
  ...s,
  lines: JSON.parse(s.lines),
  payments: JSON.parse(s.payments),
  refunds: JSON.parse(s.refunds),
});
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
export async function createApp(
  db,
  { demo = false, bootstrap, shopCode = "main" } = {},
) {
  const app = express();
  configureHttp(app);
  const audit = (tx, u, action, record, details = {}) =>
    tx.query("INSERT INTO audit VALUES (?,?,?,?,?,?)", [
      uid(),
      u.name,
      action,
      record,
      JSON.stringify(details),
      now(),
    ]);
  const settings = async (tx) =>
    JSON.parse(
      (await tx.query("SELECT value FROM settings WHERE id=1"))[0]?.value ||
        "{}",
    );
  async function setup(data, sample = false) {
    await db.transaction(async (tx) => {
      // Lock the singleton before creating an owner, including concurrent setup requests.
      await tx.query(
        "INSERT INTO settings (id,value) VALUES (1,?) ON CONFLICT(id) DO NOTHING",
        [
          JSON.stringify({
            storeName: data.storeName,
            currency: "MMK",
            taxBps: 0,
            receiptFooter: "Thank you for shopping with us.",
            ...(!sample ? { paymentMethods: defaultMethods() } : {}),
          }),
        ],
      );
      await tx.query("UPDATE settings SET value=value WHERE id=1");
      if ((await tx.query("SELECT id FROM users")).length)
        fail("This shop has already been set up.", 409);
      const user = { id: uid(), name: data.name };
      await tx.query("INSERT INTO users VALUES (?,?,?,?,?,1)", [
        user.id,
        data.name,
        data.username,
        passwordHash(data.password),
        "OWNER",
      ]);
      await tx.query(
        "INSERT INTO profiles (user_id,email,phone) VALUES (?,?,?)",
        [user.id, data.email || "", data.phone || ""],
      );
      if (sample) {
        await tx.query("INSERT INTO users VALUES (?,?,?,?,?,1)", [
          uid(),
          "May Thu",
          "cashier",
          passwordHash("Cashier123!"),
          "CASHIER",
        ]);
        const rows = [
          [
            "Velvet Lipstick",
            "Rosewood · 3.5 g",
            "LIP-001",
            "Makeup",
            15000,
            9000,
            44,
            "lipstick.webp",
          ],
          [
            "Hydrating Serum",
            "Hyaluronic acid · 30 ml",
            "SKN-001",
            "Skincare",
            22000,
            14000,
            26,
            "serum.webp",
          ],
          [
            "Daily Sheet Mask",
            "Aloe vera · 1 sheet",
            "SKN-002",
            "Skincare",
            5000,
            2500,
            4,
            "mask.webp",
          ],
          [
            "Cloud Moisturizer",
            "Daily hydration · 50 ml",
            "SKN-003",
            "Skincare",
            28000,
            18000,
            18,
            "cream-coral.webp",
          ],
          [
            "Velvet Lipstick",
            "Soft coral · 3.5 g",
            "LIP-002",
            "Makeup",
            15000,
            9000,
            32,
            "lipstick.webp",
          ],
          [
            "Glow Serum",
            "Brightening · 30 ml",
            "SKN-004",
            "Skincare",
            26000,
            16000,
            12,
            "serum.webp",
          ],
          [
            "Soothing Night Cream",
            "Overnight repair · 50 ml",
            "SKN-005",
            "Skincare",
            32000,
            21000,
            7,
            "cream-coral.webp",
          ],
          [
            "Revive Sheet Mask",
            "Green tea · 1 sheet",
            "SKN-006",
            "Skincare",
            5500,
            2800,
            3,
            "mask.webp",
          ],
        ];
        for (const [
          name,
          variant,
          sku,
          category,
          price,
          cost,
          stock,
          image,
        ] of rows)
          await tx.query(
            "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,0)",
            [uid(), name, variant, sku, category, price, cost, stock, 5, image],
          );
        for (const [name, phone] of [
          ["Thiri Htet", "09 254 118 420"],
          ["Nandar Aye", "09 780 212 335"],
          ["Su Mon", "09 421 885 600"],
          ["May Myat", "09 795 448 291"],
        ])
          await tx.query("INSERT INTO customers VALUES (?,?,?,?)", [
            uid(),
            name,
            phone,
            "",
          ]);
        const ps = await tx.query("SELECT * FROM products");
        const customers = await tx.query("SELECT * FROM customers");
        const shift = uid();
        await tx.query(
          "INSERT INTO shifts (id,user_id,opened,closed,opening,counted,expected,note) VALUES (?,?,?,?,?,?,?,?)",
          [shift, user.id, now(), now(), 50000, 50000, 50000, "Sample history"],
        );
        for (let i = 0; i < 35; i++) {
          const p = ps[i % ps.length],
            qty = 1 + (i % 3),
            total = p.price * qty,
            date = new Date(
              Date.now() - (i % 7) * 86400000 - i * 180000,
            ).toISOString();
          await tx.query(
            "INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              uid(),
              `DEMO-${1041 + i}`,
              user.id,
              shift,
              customers[i % 4].id,
              date,
              total,
              0,
              0,
              total,
              0,
              JSON.stringify([
                {
                  id: p.id,
                  name: p.name,
                  variant: p.variant,
                  price: p.price,
                  cost: p.cost,
                  qty,
                },
              ]),
              JSON.stringify([
                {
                  method: ["Cash", "KBZPay", "Wave Money"][i % 3],
                  amount: total,
                },
              ]),
              "[]",
              uid(),
              "demo",
            ],
          );
        }
      }
      await audit(tx, user, "Shop created", "shop");
    });
  }
  if (bootstrap) await setup(bootstrap);
  if (demo && !(await db.query("SELECT id FROM users")).length)
    await setup(
      {
        storeName: "Yaya Beauty Studio",
        name: "Htet Htet",
        username: "owner",
        password: "Owner123!",
      },
      true,
    );
  await initializeProducts(db);
  app.get("/api/v1/status", async (req, res) =>
    res.json({
      shopCode,
      setup: !(await db.query("SELECT id FROM users")).length,
      demo,
      database: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite",
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post("/api/v1/setup", authLimit, async (req, res) => {
    const data = z
      .object({
        storeName: text,
        name: text,
        username: text,
        password: passwordPolicy,
      })
      .parse(req.body);
    await setup(data);
    res.status(201).json({ ok: true });
  });
  app.post("/api/v1/auth/register/member", authLimit, async (req, res) => {
    const d = personalDetails.parse(req.body);
    await db.transaction(async (tx) => {
      if (
        !(
          await tx.query("SELECT id FROM users WHERE role='OWNER' AND active=1")
        ).length
      )
        fail("This shop is not accepting members yet.", 409);
      const id = uid();
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
    res.status(201).json({ ok: true, pending: true, shopCode });
  });
  app.post("/api/v1/auth/login", authLimit, async (req, res) => {
    const { username, password } = z
      .object({ username: text, password: z.string().max(128) })
      .parse(req.body);
    const user = (
      await db.query("SELECT * FROM users WHERE username=? AND active=1", [
        username,
      ])
    )[0];
    if (!user || !matches(password, user.password))
      fail("Username or password is incorrect.", 401);
    const token = randomBytes(32).toString("hex");
    await db.query("INSERT INTO sessions VALUES (?,?,?)", [
      hash(token),
      user.id,
      new Date(Date.now() + 8 * 3600000).toISOString(),
    ]);
    res
      .cookie("sayinn_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 3600000,
        path: "/",
      })
      .json({ ok: true });
  });
  app.use("/api/v1", async (req, res, next) => {
    const token = req.cookies.sayinn_session;
    const user =
      req.hubUser ||
      (token &&
        (
          await db.query(
            "SELECT u.id,u.name,u.username,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires>? AND u.active=1",
            [hash(token), now()],
          )
        )[0]);
    if (!user)
      return res
        .status(401)
        .json({ error: { message: "Please sign in to continue." } });
    req.user = user;
    next();
  });
  const owner = (req, res, next) =>
    req.user.role === "OWNER"
      ? next()
      : res.status(403).json({ error: { message: "Owner access required." } });
  registerProducts(app, db, { owner, audit });
  registerPayments(app, db, { owner, audit });
  registerWorkspaceFeatures(app, db, {
    owner,
    audit,
    passwordHash,
    matches,
    hash,
  });
  app.post("/api/v1/auth/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE id=?", [
      hash(req.cookies.sayinn_session),
    ]);
    res.clearCookie("sayinn_session").json({ ok: true });
  });
  app.get("/api/v1/workspace", async (req, res) => {
    const owner = req.user.role === "OWNER";
    const products = await db.query(
      "SELECT * FROM products WHERE archived=0 ORDER BY name",
    );
    await attachFields(db, products);
    const profile = (
      await db.query("SELECT email,phone,image FROM profiles WHERE user_id=?", [
        req.user.id,
      ])
    )[0] || { email: "", phone: "", image: "" };
    const sales = (
      await db.query(
        `SELECT s.*,u.name AS cashier,c.name AS customer FROM sales s JOIN users u ON s.user_id=u.id LEFT JOIN customers c ON s.customer_id=c.id ${owner ? "" : "WHERE s.user_id=?"} ORDER BY s.created DESC LIMIT 1000`,
        owner ? [] : [req.user.id],
      )
    ).map(parseSale);
    if (!owner) {
      products.forEach((p) => delete p.cost);
      sales.forEach((s) => s.lines.forEach((l) => delete l.cost));
    }
    const holds = await db.query(
      "SELECT * FROM holds WHERE user_id=? ORDER BY created DESC",
      [req.user.id],
    );
    res.json({
      user: { ...req.user, ...profile },
      categories: await readCategories(db),
      productTemplates: await templates(db),
      settings: await settings(db),
      paymentMethods: paymentMethods(await settings(db)).filter(
        (m) => req.user.role === "OWNER" || (m.enabled && m.cashier),
      ),
      products,
      sales,
      customers: await db.query("SELECT * FROM customers ORDER BY name"),
      shift:
        (
          await db.query(
            "SELECT * FROM shifts WHERE user_id=? AND closed IS NULL",
            [req.user.id],
          )
        )[0] || null,
      holds: holds.map((h) => ({ ...h, lines: JSON.parse(h.lines) })),
      team: owner
        ? await db.query(
            "SELECT u.id,u.name,u.username,u.role,u.active,p.email,p.phone,r.created AS pending,d.status AS requestStatus FROM users u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN member_requests r ON r.user_id=u.id LEFT JOIN membership_decisions d ON d.user_id=u.id",
          )
        : [],
      audit: owner
        ? await db.query("SELECT * FROM audit ORDER BY created DESC LIMIT 100")
        : [],
      demo,
      shopCode,
    });
  });
  app.get("/api/v1/products/archived", owner, async (req, res) =>
    res.json(
      await db.query("SELECT * FROM products WHERE archived=1 ORDER BY name"),
    ),
  );
  app.post("/api/v1/products", async (req, res) => {
    const p = productSchema
      .extend({ sku: z.string().trim().max(100).default("") })
      .parse(req.body);
    if (req.user.role !== "OWNER" && req.body.cost !== undefined)
      fail("Only owners can set cost prices.", 403);
    p.cost = p.cost ?? 0;
    const id = uid();
    await db.transaction(async (tx) => {
      if (!p.sku) p.sku = await generatedSku(tx);
      await tx.query("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,0)", [
        id,
        p.name,
        p.variant,
        p.sku,
        p.category,
        p.price,
        p.cost,
        p.stock,
        p.threshold,
        p.image,
      ]);
      await checkImage(tx, p.image, "product", req.user);
      if (
        !(
          await tx.query("SELECT name FROM category_fields WHERE name=?", [
            p.category,
          ])
        ).length
      )
        fail("Select an existing category.");
      const template = await linkProduct(tx, { ...p, id });
      await uniqueVariant(tx, template.id, p.variant, p.customFields, id);
      await saveFields(tx, id, p.category, p.customFields);
      if (p.stock)
        await tx.query("INSERT INTO movements VALUES (?,?,?,?,?)", [
          uid(),
          id,
          p.stock,
          "Opening stock",
          now(),
        ]);
      await audit(tx, req.user, "Product created", id, p);
    });
    res.status(201).json({ id });
  });
  app.put("/api/v1/products/:id", async (req, res) => {
    const p = productSchema.omit({ stock: true }).parse(req.body);
    await db.transaction(async (tx) => {
      const before = (
        await tx.query("SELECT * FROM products WHERE id=?", [req.params.id])
      )[0];
      if (!before) fail("Product not found.", 404);
      if (req.user.role !== "OWNER" && req.body.cost !== undefined)
        fail("Only owners can set cost prices.", 403);
      p.cost = p.cost ?? before.cost;
      await checkImage(tx, p.image, "product", req.user);
      const template = (
        await tx.query(
          "SELECT t.* FROM product_templates t JOIN product_links l ON l.template_id=t.id WHERE l.product_id=?",
          [req.params.id],
        )
      )[0];
      if (template && p.category !== template.category)
        fail("Change the category using the product form settings.");
      if (template && p.name !== template.name) {
        const siblings = await tx.query(
          "SELECT product_id FROM product_links WHERE template_id=?",
          [template.id],
        );
        if (siblings.length !== 1)
          fail("Rename this grouped product using the product form settings.");
        await tx.query("UPDATE product_templates SET name=? WHERE id=?", [
          p.name,
          template.id,
        ]);
      }
      if (template)
        await uniqueVariant(
          tx,
          template.id,
          p.variant,
          p.customFields,
          req.params.id,
        );
      await saveFields(tx, req.params.id, p.category, p.customFields);
      await tx.query(
        "UPDATE products SET name=?,variant=?,sku=?,category=?,price=?,cost=?,threshold=?,image=? WHERE id=?",
        [
          p.name,
          p.variant,
          p.sku,
          p.category,
          p.price,
          p.cost,
          p.threshold,
          p.image,
          req.params.id,
        ],
      );
      await audit(tx, req.user, "Product updated", req.params.id, {
        before,
        after: p,
      });
    });
    res.json({ ok: true });
  });
  app.patch("/api/v1/products/:id", owner, async (req, res) => {
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    await db.transaction(async (tx) => {
      if (!archived) {
        const p = (
          await tx.query(
            "SELECT p.*,l.template_id FROM products p JOIN product_links l ON l.product_id=p.id WHERE p.id=?",
            [req.params.id],
          )
        )[0];
        if (p) {
          await attachFields(tx, [p]);
          await uniqueVariant(
            tx,
            p.template_id,
            p.variant,
            p.customFields,
            p.id,
          );
        }
      }
      const rows = await tx.query(
        "UPDATE products SET archived=? WHERE id=? RETURNING id",
        [archived ? 1 : 0, req.params.id],
      );
      if (!rows.length) fail("Product not found.", 404);
      await audit(
        tx,
        req.user,
        archived ? "Product archived" : "Product restored",
        req.params.id,
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/v1/inventory/:id/movements", async (req, res) =>
    res.json(
      await db.query(
        "SELECT * FROM movements WHERE product_id=? ORDER BY created DESC LIMIT 100",
        [req.params.id],
      ),
    ),
  );
  app.post("/api/v1/inventory/:id", async (req, res) => {
    const d = z
      .object({
        delta: z
          .number()
          .int()
          .min(-1000000)
          .max(1000000)
          .refine((n) => n !== 0),
        reason: text,
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const rows = await tx.query(
        "UPDATE products SET stock=stock+? WHERE id=? AND stock+?>=0 RETURNING id",
        [d.delta, req.params.id, d.delta],
      );
      if (!rows.length) fail("Adjustment exceeds available stock.");
      await tx.query("INSERT INTO movements VALUES (?,?,?,?,?)", [
        uid(),
        req.params.id,
        d.delta,
        d.reason,
        now(),
      ]);
      await audit(tx, req.user, "Stock adjusted", req.params.id, d);
    });
    res.json({ ok: true });
  });
  app.post("/api/v1/customers", async (req, res) => {
    const d = z
      .object({
        name: text,
        phone: phoneNumber,
        note: z.string().max(500).default(""),
      })
      .parse(req.body);
    const id = uid();
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO customers VALUES (?,?,?,?)", [
        id,
        d.name,
        d.phone,
        d.note,
      ]);
      await audit(tx, req.user, "Customer added", id);
    });
    res.status(201).json({ id });
  });
  app.post("/api/v1/shifts/open", async (req, res) => {
    const { opening } = z.object({ opening: integer }).parse(req.body);
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO shifts (id,user_id,opened,opening) VALUES (?,?,?,?)",
        [uid(), req.user.id, now(), opening],
      );
      await audit(tx, req.user, "Shift opened", req.user.id, { opening });
    });
    res.json({ ok: true });
  });
  app.post("/api/v1/shifts/close", async (req, res) => {
    const d = z
      .object({ counted: integer, note: z.string().max(500).default("") })
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      const shift = (
        await tx.query(
          "UPDATE shifts SET note=note WHERE user_id=? AND closed IS NULL RETURNING *",
          [req.user.id],
        )
      )[0];
      if (!shift) fail("No open shift.");
      const sales = (
        await tx.query("SELECT * FROM sales WHERE shift_id=?", [shift.id])
      ).map(parseSale);
      const refunds = await tx.query(
        "SELECT amount FROM refunds WHERE shift_id=? AND method=?",
        [shift.id, "Cash"],
      );
      const expected =
        shift.opening +
        sales.reduce(
          (sum, s) =>
            sum +
            s.payments
              .filter((p) => p.method === "Cash")
              .reduce((a, p) => a + p.amount, 0) -
            s.change_amount,
          0,
        ) -
        refunds.reduce((a, r) => a + r.amount, 0);
      await tx.query(
        "UPDATE shifts SET closed=?,counted=?,expected=?,note=? WHERE id=?",
        [now(), d.counted, expected, d.note, shift.id],
      );
      await audit(tx, req.user, "Shift closed", shift.id, {
        ...d,
        expected,
        variance: d.counted - expected,
      });
      return { expected, variance: d.counted - expected };
    });
    res.json(result);
  });
  app.post("/api/v1/holds", async (req, res) => {
    const d = z
      .object({
        label: text,
        lines: z
          .array(
            z.object({ id: text, qty: z.number().int().min(1).max(10000) }),
          )
          .min(1)
          .max(100),
      })
      .parse(req.body);
    const id = uid();
    await db.query("INSERT INTO holds VALUES (?,?,?,?,?)", [
      id,
      req.user.id,
      d.label,
      JSON.stringify(d.lines),
      now(),
    ]);
    res.status(201).json({ id });
  });
  app.delete("/api/v1/holds/:id", async (req, res) => {
    await db.query("DELETE FROM holds WHERE id=? AND user_id=?", [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  });
  app.post("/api/v1/sales", async (req, res) => {
    const d = z
      .object({
        lines: z
          .array(
            z.object({ id: text, qty: z.number().int().min(1).max(10000) }),
          )
          .min(1)
          .max(100),
        payments: z
          .array(
            z.object({
              method: text,
              amount: integer,
              reference: z.string().max(150).optional(),
            }),
          )
          .min(1)
          .max(10),
        discount: integer.default(0),
        customerId: z.string().nullable().optional(),
        idempotency: z.string().uuid(),
      })
      .parse(req.body);
    if (new Set(d.lines.map((l) => l.id)).size !== d.lines.length)
      fail("Duplicate products in cart.");
    if (d.payments.filter((p) => p.method === "Cash").length > 1)
      fail("Use one cash tender.");
    const result = await db.transaction(async (tx) => {
      const requestHash = hash(JSON.stringify(d));
      const prior = (
        await tx.query("SELECT * FROM sales WHERE idempotency=?", [
          d.idempotency,
        ])
      )[0];
      if (prior) {
        if (prior.user_id !== req.user.id || prior.request_hash !== requestHash)
          fail("Checkout key was already used for another request.", 409);
        return parseSale(prior);
      }
      const shift = (
        await tx.query(
          "UPDATE shifts SET note=note WHERE user_id=? AND closed IS NULL RETURNING *",
          [req.user.id],
        )
      )[0];
      if (!shift) fail("Open a shift before taking payment.");
      // Another request may have completed while waiting for the shift lock.
      const replay = (
        await tx.query("SELECT * FROM sales WHERE idempotency=?", [
          d.idempotency,
        ])
      )[0];
      if (replay) {
        if (
          replay.user_id !== req.user.id ||
          replay.request_hash !== requestHash
        )
          fail("Checkout key was already used for another request.", 409);
        return parseSale(replay);
      }
      if (d.discount && req.user.role !== "OWNER")
        fail("Only owners can apply custom discounts.", 403);
      if (
        d.customerId &&
        !(await tx.query("SELECT id FROM customers WHERE id=?", [d.customerId]))
          .length
      )
        fail("Customer not found.", 400);
      const lines = [];
      for (const l of [...d.lines].sort((a, b) => a.id.localeCompare(b.id))) {
        const p = (
          await tx.query(
            "UPDATE products SET stock=stock-? WHERE id=? AND archived=0 AND stock>=? RETURNING *",
            [l.qty, l.id, l.qty],
          )
        )[0];
        if (!p)
          fail("A product has insufficient stock. Refresh your cart.", 409);
        await attachFields(tx, [p]);
        lines.push({
          id: p.id,
          name: p.name,
          variant: [
            p.variant,
            ...(p.fields || [])
              .filter(
                (f) => f.type !== "image" && p.customFields[f.id] !== undefined,
              )
              .map((f) => f.label + ": " + p.customFields[f.id]),
          ]
            .filter(Boolean)
            .join(" / "),
          customFields: p.customFields,
          fieldDefinitions: p.fields,
          price: p.price,
          cost: p.cost,
          qty: l.qty,
        });
        await tx.query("INSERT INTO movements VALUES (?,?,?,?,?)", [
          uid(),
          p.id,
          -l.qty,
          "Sale",
          now(),
        ]);
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      if (d.discount > subtotal) fail("Discount exceeds subtotal.");
      await tx.query("UPDATE settings SET value=value WHERE id=1");
      const config = await settings(tx);
      validatePayments(d.payments, config, req.user.role);
      const tax = Number(
        (BigInt(subtotal - d.discount) * BigInt(config.taxBps) + 5000n) /
          10000n,
      );
      const total = subtotal - d.discount + tax;
      const tender = d.payments.reduce((s, p) => s + p.amount, 0);
      const noncash = d.payments
        .filter((p) => p.method !== "Cash")
        .reduce((s, p) => s + p.amount, 0);
      if (tender < total) fail("Payment does not cover the balance.");
      if (noncash > total) fail("Non-cash payments exceed the total.");
      const seq = (
        await tx.query(
          "INSERT INTO sequences (day,value) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET value=sequences.value+1 RETURNING value",
          [day()],
        )
      )[0].value;
      const sale = {
        id: uid(),
        receipt: `SY-${day()}-${String(seq).padStart(4, "0")}`,
        created: now(),
        subtotal,
        discount: d.discount,
        tax,
        total,
        change_amount: tender - total,
        lines,
        payments: d.payments,
        refunds: [],
      };
      await tx.query(
        "INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          sale.id,
          sale.receipt,
          req.user.id,
          shift.id,
          d.customerId || null,
          sale.created,
          subtotal,
          d.discount,
          tax,
          total,
          sale.change_amount,
          JSON.stringify(lines),
          JSON.stringify(d.payments),
          "[]",
          d.idempotency,
          requestHash,
        ],
      );
      await audit(tx, req.user, "Sale completed", sale.receipt, { total });
      return sale;
    });
    if (req.user.role !== "OWNER") result.lines.forEach((l) => delete l.cost);
    res.status(201).json(result);
  });
  app.post("/api/v1/sales/:id/refund", owner, async (req, res) => {
    const d = z
      .object({
        productId: text,
        qty: z.number().int().min(1),
        restock: z.boolean(),
        reason: text,
        method: z
          .enum([
            "Cash",
            "KBZPay",
            "Wave Money",
            "AYA Pay",
            "Card",
            "Bank transfer",
          ])
          .default("Cash"),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const raw = (
        await tx.query(
          "UPDATE sales SET refunds=refunds WHERE id=? RETURNING *",
          [req.params.id],
        )
      )[0];
      if (!raw) fail("Sale not found.", 404);
      const s = parseSale(raw);
      const line = s.lines.find((l) => l.id === d.productId);
      if (!line) fail("Product not in sale.");
      const used = s.refunds
        .filter((r) => r.productId === d.productId)
        .reduce((n, r) => n + r.qty, 0);
      if (d.qty + used > line.qty) fail("Return exceeds sold quantity.");
      // Allocate discounted, taxed total deterministically per unit; the final unit
      // receives the remaining rounding. All line allocations sum to the sale total.
      let prefix = 0;
      for (const l of s.lines) {
        if (l.id === line.id) break;
        prefix += l.price * l.qty;
      }
      const allocation = (n) =>
        s.subtotal
          ? Number(
              (BigInt(prefix + line.price * n) * BigInt(s.total)) /
                BigInt(s.subtotal),
            )
          : 0;
      const amount = allocation(used + d.qty) - allocation(used);
      const shift = (
        await tx.query(
          "UPDATE shifts SET note=note WHERE user_id=? AND closed IS NULL RETURNING id",
          [req.user.id],
        )
      )[0];
      if (!shift) fail("Open your shift to record a refund.");
      s.refunds.push({ ...d, amount, shiftId: shift.id, created: now() });
      await tx.query("INSERT INTO refunds VALUES (?,?,?,?,?,?)", [
        uid(),
        s.id,
        shift.id,
        amount,
        d.method,
        now(),
      ]);
      await tx.query("UPDATE sales SET refunds=? WHERE id=?", [
        JSON.stringify(s.refunds),
        s.id,
      ]);
      if (d.restock) {
        await tx.query("UPDATE products SET stock=stock+? WHERE id=?", [
          d.qty,
          line.id,
        ]);
        await tx.query("INSERT INTO movements VALUES (?,?,?,?,?)", [
          uid(),
          line.id,
          d.qty,
          "Return: " + d.reason,
          now(),
        ]);
      }
      await audit(tx, req.user, "Refund completed", s.receipt, {
        ...d,
        amount,
      });
    });
    res.json({ ok: true });
  });
  app.post("/api/v1/team", owner, async (req, res) => {
    const d = z
      .object({
        name: text,
        username: text,
        password: passwordPolicy,
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const id = uid();
      await tx.query("INSERT INTO users VALUES (?,?,?,?,?,1)", [
        id,
        d.name,
        d.username,
        passwordHash(d.password),
        "CASHIER",
      ]);
      await audit(tx, req.user, "Cashier added", id);
    });
    res.status(201).json({ ok: true });
  });
  app.patch("/api/v1/team/:id", owner, async (req, res) => {
    const d = z
      .object({
        active: z.boolean(),
        decision: z.enum(["approved", "rejected"]).optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const target = (
        await tx.query("SELECT id FROM users WHERE id=? AND role='CASHIER'", [
          req.params.id,
        ])
      )[0];
      if (!target) fail("Member not found.", 404);
      const pending = (
        await tx.query("SELECT created FROM member_requests WHERE user_id=?", [
          req.params.id,
        ])
      )[0];
      if (d.decision && (d.active !== (d.decision === "approved") || !pending))
        fail("No matching pending request.", 409);
      if (pending)
        await tx.query(
          "INSERT INTO membership_decisions VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,actor=excluded.actor,decided=excluded.decided",
          [
            req.params.id,
            d.active ? "approved" : "rejected",
            req.user.id,
            now(),
            pending.created,
          ],
        );
      await tx.query("UPDATE users SET active=? WHERE id=? AND role=?", [
        d.active ? 1 : 0,
        req.params.id,
        "CASHIER",
      ]);
      if (d.active || pending)
        await tx.query("DELETE FROM member_requests WHERE user_id=?", [
          req.params.id,
        ]);
      await tx.query("DELETE FROM sessions WHERE user_id=?", [req.params.id]);
      await audit(tx, req.user, "Cashier access changed", req.params.id, d);
    });
    res.json({ ok: true });
  });
  app.put("/api/v1/settings", owner, async (req, res) => {
    const d = z
      .object({
        storeName: text,
        currency: z.literal("MMK"),
        taxBps: z.number().int().min(0).max(10000),
        receiptFooter: z.string().max(300),
        shopLogo: z.union([z.literal(""), imageReference]).optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await checkImage(tx, d.shopLogo, "shop", req.user);
      await tx.query("UPDATE settings SET value=? WHERE id=1", [
        JSON.stringify({ ...(await settings(tx)), ...d }),
      ]);
      await audit(tx, req.user, "Settings updated", "shop", d);
    });
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: { message: "Endpoint not found." } }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: {
          message: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
      });
    const conflict = /unique|duplicate/i.test(err.message);
    if (!err.status && !conflict) console.error(err);
    res.status(err.status || (conflict ? 409 : 500)).json({
      error: {
        message: err.status
          ? err.message
          : conflict
            ? "This record already exists."
            : "The request could not be completed.",
      },
    });
  });
  return app;
}
