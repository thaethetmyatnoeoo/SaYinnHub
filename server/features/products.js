import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { checkImage, imageReference, saveFields } from "./workspace.js";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const name = z.string().trim().min(1).max(100);
const amount = z.number().int().min(0).max(1000000000);
export const fieldDefinitions = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
      label: name,
      type: z.enum([
        "text",
        "number",
        "decimal",
        "select",
        "checkbox",
        "date",
        "image",
      ]),
      required: z.boolean().default(false),
      options: z.array(name).max(50).default([]),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
    }),
  )
  .max(30)
  .superRefine((fields, ctx) => {
    if (new Set(fields.map((f) => f.id)).size !== fields.length)
      ctx.addIssue({ code: "custom", message: "Field IDs must be unique." });
    for (const f of fields) {
      if (
        f.type === "select" &&
        (!f.options.length || new Set(f.options).size !== f.options.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "Dropdown options must be nonempty and unique.",
        });
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        ctx.addIssue({
          code: "custom",
          message: "Minimum cannot exceed maximum.",
        });
    }
  });
export async function initializeProducts(db) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS product_templates (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,fields TEXT NOT NULL,UNIQUE(category,name))",
  );
  await db.query(
    "CREATE TABLE IF NOT EXISTS product_links (product_id TEXT PRIMARY KEY REFERENCES products(id),template_id TEXT NOT NULL REFERENCES product_templates(id))",
  );
  await db.transaction(async (tx) => {
    const products = await tx.query(
      "SELECT p.* FROM products p LEFT JOIN product_links l ON l.product_id=p.id WHERE l.product_id IS NULL",
    );
    for (const p of products) await linkProduct(tx, p);
  });
}
export async function linkProduct(tx, p) {
  await tx.query(
    "INSERT INTO category_fields (name,fields) VALUES (?,?) ON CONFLICT(name) DO NOTHING",
    [p.category, "[]"],
  );
  const fields = (
    await tx.query("SELECT fields FROM category_fields WHERE name=?", [
      p.category,
    ])
  )[0].fields;
  await tx.query(
    "INSERT INTO product_templates VALUES (?,?,?,?) ON CONFLICT(category,name) DO NOTHING",
    [randomUUID(), p.name, p.category, fields],
  );
  const template = (
    await tx.query(
      "SELECT * FROM product_templates WHERE category=? AND name=?",
      [p.category, p.name],
    )
  )[0];
  await tx.query(
    "INSERT INTO product_links VALUES (?,?) ON CONFLICT(product_id) DO NOTHING",
    [p.id, template.id],
  );
  return template;
}
export async function templates(tx) {
  return (await tx.query("SELECT * FROM product_templates ORDER BY name")).map(
    (t) => ({ ...t, fields: JSON.parse(t.fields) }),
  );
}
export async function uniqueVariant(tx, templateId, variant, values, id = "") {
  // Serialize inserts/edits per parent on PostgreSQL as well as SQLite.
  await tx.query("UPDATE product_templates SET name=name WHERE id=?", [
    templateId,
  ]);
  const fields = JSON.parse(
    (
      await tx.query("SELECT fields FROM product_templates WHERE id=?", [
        templateId,
      ])
    )[0].fields,
  );
  const signature = (v, vals) =>
    JSON.stringify([
      fields.some(
        (f) =>
          f.type !== "image" && vals[f.id] !== undefined && vals[f.id] !== "",
      )
        ? ""
        : v.trim().toLowerCase(),
      ...fields
        .filter((f) => f.type !== "image")
        .map((f) => [
          f.id,
          typeof vals[f.id] === "string"
            ? vals[f.id].trim().toLowerCase()
            : (vals[f.id] ?? null),
        ]),
    ]);
  const wanted = signature(variant, values);
  const rows = await tx.query(
    "SELECT p.id,p.variant,f.value FROM products p JOIN product_links l ON l.product_id=p.id LEFT JOIN product_fields f ON f.product_id=p.id AND f.category=p.category WHERE l.template_id=? AND p.archived=0",
    [templateId],
  );
  if (
    rows.some(
      (p) =>
        p.id !== id &&
        signature(p.variant, JSON.parse(p.value || "{}")) === wanted,
    )
  )
    fail("This variant already exists. Edit its stock instead.", 409);
}
export function registerProducts(app, db, { owner, audit }) {
  app.post("/api/v1/categories", owner, async (req, res) => {
    const category = name.parse(req.body.name);
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO category_fields VALUES (?,?)", [
        category,
        "[]",
      ]);
      await audit(tx, req.user, "Category created", category);
    });
    res.status(201).json({ name: category });
  });
  app.put("/api/v1/categories/:name", owner, async (req, res) => {
    const category = name.parse(req.body.name),
      old = req.params.name;
    await db.transaction(async (tx) => {
      if (
        !(
          await tx.query("SELECT name FROM category_fields WHERE name=?", [old])
        ).length
      )
        fail("Category not found.", 404);
      await tx.query("UPDATE category_fields SET name=? WHERE name=?", [
        category,
        old,
      ]);
      await tx.query("UPDATE product_fields SET category=? WHERE category=?", [
        category,
        old,
      ]);
      await tx.query("UPDATE products SET category=? WHERE category=?", [
        category,
        old,
      ]);
      await tx.query(
        "UPDATE product_templates SET category=? WHERE category=?",
        [category, old],
      );
      await audit(tx, req.user, "Category renamed", old, { name: category });
    });
    res.json({ ok: true });
  });
  app.delete("/api/v1/categories/:name", owner, async (req, res) => {
    await db.transaction(async (tx) => {
      if (
        (
          await tx.query("SELECT id FROM products WHERE category=?", [
            req.params.name,
          ])
        ).length
      )
        fail(
          "This category contains inventory, including archived variants. Move the products before removing it.",
          409,
        );
      await tx.query("DELETE FROM product_templates WHERE category=?", [
        req.params.name,
      ]);
      await tx.query("DELETE FROM category_fields WHERE name=?", [
        req.params.name,
      ]);
      await audit(tx, req.user, "Category removed", req.params.name);
    });
    res.json({ ok: true });
  });
  app.put("/api/v1/product-templates/:id", owner, async (req, res) => {
    const d = z
      .object({ name, category: name, fields: fieldDefinitions })
      .parse(req.body);
    await db.transaction(async (tx) => {
      if (
        !(
          await tx.query("SELECT name FROM category_fields WHERE name=?", [
            d.category,
          ])
        ).length
      )
        fail("Select an existing category.");
      const before = (
        await tx.query("SELECT * FROM product_templates WHERE id=?", [
          req.params.id,
        ])
      )[0];
      if (!before) fail("Product not found.", 404);
      await tx.query(
        "UPDATE product_templates SET name=?,category=?,fields=? WHERE id=?",
        [d.name, d.category, JSON.stringify(d.fields), req.params.id],
      );
      await tx.query(
        "UPDATE product_fields SET category=? WHERE category=? AND product_id IN (SELECT product_id FROM product_links WHERE template_id=?)",
        [d.category, before.category, req.params.id],
      );
      await tx.query(
        "UPDATE products SET name=?,category=? WHERE id IN (SELECT product_id FROM product_links WHERE template_id=?)",
        [d.name, d.category, req.params.id],
      );
      await audit(tx, req.user, "Product form updated", req.params.id, {
        before,
        after: d,
      });
    });
    res.json({ ok: true });
  });
  app.post("/api/v1/product-templates/variants", async (req, res) => {
    const d = z
      .object({
        templateId: z.string().optional(),
        name,
        category: name,
        fields: fieldDefinitions.optional(),
        variants: z
          .array(
            z.object({
              variant: z.string().trim().max(100).default(""),
              sku: z.string().trim().max(100).default(""),
              stock: amount,
              price: amount,
              cost: amount.optional(),
              threshold: amount.default(5),
              image: imageReference.default("serum.webp"),
              customFields: z
                .record(
                  z.string(),
                  z.union([
                    z.string().max(1000),
                    z.number().finite(),
                    z.boolean(),
                  ]),
                )
                .default({}),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);
    if (
      req.user.role !== "OWNER" &&
      (d.fields !== undefined || d.variants.some((v) => v.cost !== undefined))
    )
      fail("Only owners can configure forms and cost prices.", 403);
    const result = await db.transaction(async (tx) => {
      if (
        !(
          await tx.query("SELECT name FROM category_fields WHERE name=?", [
            d.category,
          ])
        ).length
      )
        fail("Select an existing category.");
      let t;
      if (d.templateId) {
        t = (
          await tx.query("SELECT * FROM product_templates WHERE id=?", [
            d.templateId,
          ])
        )[0];
        if (!t || t.category !== d.category || t.name !== d.name)
          fail("Select a valid product in this category.");
        if (d.fields) {
          await tx.query("UPDATE product_templates SET fields=? WHERE id=?", [
            JSON.stringify(d.fields),
            t.id,
          ]);
        }
      } else {
        t = { id: randomUUID(), name: d.name, category: d.category };
        await tx.query("INSERT INTO product_templates VALUES (?,?,?,?)", [
          t.id,
          t.name,
          t.category,
          JSON.stringify(d.fields || []),
        ]);
      }
      const ids = [];
      for (const p of d.variants) {
        const id = randomUUID();
        await checkImage(tx, p.image, "product", req.user);
        for (const f of d.fields ||
          JSON.parse(
            (
              await tx.query(
                "SELECT fields FROM product_templates WHERE id=?",
                [t.id],
              )
            )[0].fields,
          ))
          if (f.type === "image" && p.customFields[f.id])
            await checkImage(tx, p.customFields[f.id], "product", req.user);
        await uniqueVariant(tx, t.id, p.variant, p.customFields);
        await tx.query("INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,0)", [
          id,
          t.name,
          p.variant,
          p.sku || (await generatedSku(tx)),
          t.category,
          p.price,
          p.cost || 0,
          p.stock,
          p.threshold,
          p.image,
        ]);
        await tx.query("INSERT INTO product_links VALUES (?,?)", [id, t.id]);
        await saveFields(tx, id, t.category, p.customFields);
        if (p.stock)
          await tx.query("INSERT INTO movements VALUES (?,?,?,?,?)", [
            randomUUID(),
            id,
            p.stock,
            "Opening stock",
            new Date().toISOString(),
          ]);
        await audit(tx, req.user, "Variant created", id, p);
        ids.push(id);
      }
      return { templateId: t.id, ids };
    });
    res.status(201).json(result);
  });
}

export async function generatedSku(tx, random = randomBytes) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = "SH-" + random(6).toString("hex").toUpperCase();
    // Serialize allocation with all product creation transactions.
    await tx.query("UPDATE settings SET value=value WHERE id=1");
    if (!(await tx.query("SELECT id FROM products WHERE sku=?", [code])).length)
      return code;
  }
  throw Object.assign(
    new Error("Unable to allocate a product code. Please try again."),
    { status: 503 },
  );
}
