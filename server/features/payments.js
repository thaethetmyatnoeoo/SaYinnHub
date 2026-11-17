import { randomUUID } from "node:crypto";
import { z } from "zod";

export const defaultMethods = () =>
  ["Cash", "Bank transfer", "Mobile Payment", "Card"].map((name) => ({
    id: name,
    name,
    enabled: true,
    cashier: true,
    builtin: true,
  }));
export const paymentMethods = (config) =>
  config.paymentMethods || [
    ...defaultMethods(),
    ...["KBZPay", "Wave Money", "AYA Pay"].map((name) => ({
      id: name,
      name,
      enabled: true,
      cashier: true,
      builtin: false,
    })),
  ];
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export function validatePayments(payments, config, role) {
  const methods = paymentMethods(config);
  for (const payment of payments) {
    const method = methods.find((m) => m.id === payment.method);
    if (!method?.enabled || (role !== "OWNER" && !method.cashier))
      fail("Payment method is unavailable.");
    // Keep both immutable identity and the name at checkout for history.
    payment.methodId = method.id;
    payment.method = method.name;
  }
}
export function registerPayments(app, db, { owner, audit }) {
  app.put("/api/v1/payment-methods", owner, async (req, res) => {
    const input = z
      .array(
        z.object({
          id: z.string().max(150).optional(),
          name: z.string().trim().min(1).max(60),
          enabled: z.boolean(),
          cashier: z.boolean(),
        }),
      )
      .min(1)
      .max(30)
      .parse(req.body);
    const result = await db.transaction(async (tx) => {
      await tx.query("UPDATE settings SET value=value WHERE id=1");
      const config = JSON.parse(
        (await tx.query("SELECT value FROM settings WHERE id=1"))[0].value,
      );
      const old = paymentMethods(config);
      const history = (
        await tx.query("SELECT payments,refunds FROM sales")
      ).flatMap((s) => [...JSON.parse(s.payments), ...JSON.parse(s.refunds)]);
      const wasUsed = (method) =>
        method.used ||
        history.some(
          (p) =>
            p.methodId === method.id ||
            (!p.methodId && p.method === method.name),
        );
      const ids = new Set(),
        names = new Set();
      const next = input.map((item) => {
        const previous = item.id ? old.find((m) => m.id === item.id) : null;
        if (item.id && !previous) fail("Unknown payment method.");
        const id = previous?.id || randomUUID();
        if (ids.has(id) || names.has(item.name.toLowerCase()))
          fail("Payment method names must be unique.");
        ids.add(id);
        names.add(item.name.toLowerCase());
        if (previous?.builtin && previous.name !== item.name)
          fail("Default payment methods cannot be renamed.");
        return {
          ...item,
          id,
          builtin: !!previous?.builtin,
          used: previous ? !!wasUsed(previous) : false,
        };
      });
      const removed = old.filter((m) => !ids.has(m.id));
      if (removed.some((m) => m.builtin))
        fail("Default payment methods cannot be deleted.");
      if (!next.some((m) => m.enabled && m.cashier))
        fail("Enable at least one payment method for cashiers.");
      if (removed.some(wasUsed))
        fail("Used payment methods cannot be deleted. Disable them instead.");
      config.paymentMethods = next;
      await tx.query("UPDATE settings SET value=? WHERE id=1", [
        JSON.stringify(config),
      ]);
      await audit(tx, req.user, "Update payment methods", "settings");
      return next;
    });
    res.json(result);
  });
}
