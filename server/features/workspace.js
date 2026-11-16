import { passwordPolicy, phoneNumber, optionalPhone } from "./validation.js";
import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const label = z.string().trim().min(1).max(100);
export const imageReference = z
  .string()
  .refine(
    (v) =>
      /^(serum|lipstick|mask|cream-coral)\.webp$/.test(v) ||
      /^\/api\/v1\/images\/[0-9a-f-]{36}$/.test(v),
    "Select a valid uploaded image.",
  );
export async function checkImage(tx, ref, purpose, user) {
  if (!ref) return;
  if (!ref.startsWith("/api/")) {
    if (purpose !== "product") fail("Use an uploaded image.");
    return;
  }
  const image = (
    await tx.query("SELECT owner_id,purpose FROM images WHERE id=?", [
      ref.split("/").pop(),
    ])
  )[0];
  if (
    !image ||
    image.purpose !== purpose ||
    (purpose === "profile" && image.owner_id !== user.id)
  )
    fail("Image is not available for this purpose.");
}
export async function readCategories(tx) {
  return (await tx.query("SELECT * FROM category_fields ORDER BY name")).map(
    (c) => ({ ...c, fields: JSON.parse(c.fields) }),
  );
}
export async function attachFields(tx, products) {
  const rows = await tx.query("SELECT * FROM product_fields");
  const links = await tx.query(
    "SELECT l.product_id,t.id,t.fields FROM product_links l JOIN product_templates t ON t.id=l.template_id",
  );
  for (const p of products) {
    const t = links.find((l) => l.product_id === p.id);
    p.templateId = t?.id;
    p.fields = JSON.parse(t?.fields || "[]");
  }
  for (const p of products)
    p.customFields = JSON.parse(
      rows.find((r) => r.product_id === p.id && r.category === p.category)
        ?.value || "{}",
    );
}
export async function saveFields(tx, id, category, values = {}) {
  const row = (
    await tx.query(
      "SELECT t.fields FROM product_templates t JOIN product_links l ON l.template_id=t.id WHERE l.product_id=?",
      [id],
    )
  )[0];
  const fallback = row
    ? null
    : (
        await tx.query("SELECT fields FROM category_fields WHERE name=?", [
          category,
        ])
      )[0];
  const fields = JSON.parse(row?.fields || fallback?.fields || "[]");
  const stored = JSON.parse(
    (
      await tx.query(
        "SELECT value FROM product_fields WHERE product_id=? AND category=?",
        [id, category],
      )
    )[0]?.value || "{}",
  );
  for (const key of Object.keys(values))
    if (!fields.some((f) => f.id === key) && !(key in stored))
      fail("Unknown custom field: " + key);
  const clean = {};
  for (const f of fields) {
    const value =
      f.type === "checkbox" ? (values[f.id] ?? false) : values[f.id];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      if (f.required) fail(f.label + " is required.");
      continue;
    }
    if (
      ["number", "decimal"].includes(f.type) &&
      (typeof value !== "number" || !Number.isFinite(value))
    )
      fail(f.label + " must be a number.");
    if (f.type === "checkbox" && typeof value !== "boolean")
      fail(f.label + " must be a checkbox value.");
    if (
      ["text", "date", "select"].includes(f.type) &&
      (typeof value !== "string" || value.length > 1000)
    )
      fail(f.label + " must be valid text.");
    if (f.type === "select" && !f.options.includes(value))
      fail(f.label + " has an invalid option.");
    if (
      f.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail(f.label + " must be a valid date.");
    if (f.type === "number" && !Number.isInteger(value))
      fail(f.label + " must be a whole number.");
    if (
      typeof value === "number" &&
      ((f.min !== undefined && value < f.min) ||
        (f.max !== undefined && value > f.max))
    )
      fail(f.label + " is outside its allowed range.");
    if (f.type === "image") {
      imageReference.parse(value);
      await checkImage(tx, value, "product", {});
    }
    clean[f.id] = typeof value === "string" ? value.trim() : value;
  }
  // Retain removed field values for data preservation; current fields replace their previous values.
  const previous = JSON.parse(
    (
      await tx.query(
        "SELECT value FROM product_fields WHERE product_id=? AND category=?",
        [id, category],
      )
    )[0]?.value || "{}",
  );
  for (const f of fields) delete previous[f.id];
  await tx.query(
    "INSERT INTO product_fields (product_id,category,value) VALUES (?,?,?) ON CONFLICT(product_id,category) DO UPDATE SET value=excluded.value",
    [id, category, JSON.stringify({ ...previous, ...clean })],
  );
}
export function registerWorkspaceFeatures(
  app,
  db,
  { owner, audit, passwordHash, matches, hash },
) {
  app.post(
    "/api/v1/images",
    rateLimit({ windowMs: 60000, limit: 30 }),
    async (req, res) => {
      const d = z
        .object({
          purpose: z.enum(["product", "shop", "profile"]),
          data: z.string().max(2800000),
        })
        .parse(req.body);
      if (d.purpose === "shop" && req.user.role !== "OWNER")
        fail("Owner access required.", 403);
      const match = d.data.match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match) fail("Upload a PNG, JPEG, or WebP image.");
      let content;
      try {
        const input = Buffer.from(match[2], "base64");
        if (input.length > 2 * 1024 * 1024) fail("Image must be at most 2 MB.");
        const image = sharp(input, {
          limitInputPixels: 16000000,
          animated: false,
        });
        const meta = await image.metadata();
        if (!["png", "jpeg", "webp"].includes(meta.format))
          fail("Unsupported image format.");
        content = (
          await image
            .rotate()
            .resize({
              width: 1200,
              height: 1200,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer()
        ).toString("base64");
      } catch {
        fail(
          "Image could not be read. Use a valid PNG, JPEG, or WebP up to 2 MB and 16 megapixels.",
        );
      }
      const id = randomUUID();
      await db.query("INSERT INTO images VALUES (?,?,?,?,?)", [
        id,
        req.user.id,
        d.purpose,
        content,
        new Date().toISOString(),
      ]);
      res.status(201).json({ url: "/api/v1/images/" + id });
    },
  );
  app.get("/api/v1/images/:id", async (req, res) => {
    const row = (
      await db.query("SELECT content FROM images WHERE id=?", [req.params.id])
    )[0];
    if (!row) fail("Image not found.", 404);
    res
      .set("Cache-Control", "private, no-store")
      .type("png")
      .send(Buffer.from(row.content, "base64"));
  });
  app.put("/api/v1/categories/:name/fields", owner, async (req, res) => {
    const name = label.parse(req.params.name);
    const fields = z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
          label,
          type: z.enum(["text", "number", "date", "select", "checkbox"]),
          required: z.boolean().default(false),
          options: z.array(label).max(50).default([]),
        }),
      )
      .max(30)
      .parse(req.body.fields);
    if (new Set(fields.map((f) => f.id)).size !== fields.length)
      fail("Field keys must be unique.");
    for (const f of fields)
      if (
        f.type === "select" &&
        (!f.options.length || new Set(f.options).size !== f.options.length)
      )
        fail("Select fields need distinct options.");
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO category_fields VALUES (?,?) ON CONFLICT(name) DO UPDATE SET fields=excluded.fields",
        [name, JSON.stringify(fields)],
      );
      await audit(tx, req.user, "Category fields updated", name, { fields });
    });
    res.json({ ok: true });
  });
  app.put("/api/v1/profile", async (req, res) => {
    const d = z
      .object({
        name: label,
        username: z.string().trim().min(1).max(150),
        email: z
          .union([z.literal(""), z.string().email().max(254)])
          .default(""),
        phone: optionalPhone,
        image: z.union([z.literal(""), imageReference]).default(""),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await checkImage(tx, d.image, "profile", req.user);
      await tx.query("UPDATE users SET name=?,username=? WHERE id=?", [
        d.name,
        d.username,
        req.user.id,
      ]);
      await tx.query(
        "INSERT INTO profiles VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,phone=excluded.phone,image=excluded.image",
        [req.user.id, d.email, d.phone, d.image],
      );
      await audit(tx, req.user, "Profile updated", req.user.id);
    });
    res.json({ ok: true });
  });
  app.put(
    "/api/v1/profile/password",
    rateLimit({ windowMs: 15 * 60000, limit: 10 }),
    async (req, res) => {
      if (
        req.body.confirmPassword !== undefined &&
        req.body.confirmPassword !== req.body.password
      )
        fail("Passwords must match.");
      const d = z
        .object({
          currentPassword: z.string().min(1).max(128),
          password: passwordPolicy,
        })
        .parse(req.body);
      await db.transaction(async (tx) => {
        const user = (
          await tx.query("SELECT password FROM users WHERE id=?", [req.user.id])
        )[0];
        if (!matches(d.currentPassword, user.password))
          fail("Current password is incorrect.", 400);
        if (d.currentPassword === d.password)
          fail("Choose a different new password.");
        await tx.query("UPDATE users SET password=? WHERE id=?", [
          passwordHash(d.password),
          req.user.id,
        ]);
        await tx.query("DELETE FROM sessions WHERE user_id=? AND id<>?", [
          req.user.id,
          hash(req.cookies.sayinn_session),
        ]);
        await audit(tx, req.user, "Password changed", req.user.id);
      });
      res.json({ ok: true });
    },
  );
}
