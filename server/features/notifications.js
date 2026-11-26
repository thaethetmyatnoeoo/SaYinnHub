import { z } from "zod";

const signature = (p) => `${p.stock}:${p.threshold}`;

export async function readNotifications(db, userId) {
  const products = await db.query(
    "SELECT id,name,variant,image,stock,threshold FROM products WHERE archived=0 AND stock<=threshold ORDER BY name",
  );
  const states = await db.query(
    "SELECT product_id,signature,status FROM notification_states WHERE user_id=?",
    [userId],
  );
  return products
    .map((p) => {
      const saved = states.find(
        (s) => s.product_id === p.id && s.signature === signature(p),
      );
      return {
        ...p,
        signature: signature(p),
        status: saved?.status || "unread",
      };
    })
    .filter((p) => p.status !== "deleted");
}

export function registerNotifications(app, db) {
  app.put("/api/v1/notifications", async (req, res) => {
    const { items, status } = z
      .object({
        items: z
          .array(
            z.object({
              id: z.string().min(1).max(100),
              signature: z.string().max(100),
            }),
          )
          .min(1)
          .max(1000),
        status: z.enum(["read", "unread", "deleted"]),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      for (const item of items) {
        const [p] = await tx.query(
          "SELECT stock,threshold FROM products WHERE id=? AND archived=0",
          [item.id],
        );
        if (!p || p.stock > p.threshold || signature(p) !== item.signature)
          continue;
        await tx.query(
          "INSERT INTO notification_states (user_id,product_id,signature,status) VALUES (?,?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET signature=excluded.signature,status=excluded.status",
          [req.user.id, item.id, item.signature, status],
        );
      }
    });
    res.json({ ok: true });
  });
}
