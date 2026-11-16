import { t as tr } from "../i18n";
import {
  groupProducts,
  GroupCard,
  VariantPicker,
  variantLabel,
} from "./products/ProductGroups";
import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  Users,
  ArrowRight,
  Plus,
  Search,
  Check,
  X,
  Wallet,
  Minus,
  Trash2,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Button, Empty, Field, ProductImage, Modal } from "../components/ui";

export function POS({
  data,
  cart,
  setCart,
  notify,
  act,
  modal,
  receipt,
  owner,
  go,
}) {
  const [q, Q] = useState(""),
    [category, SC] = useState("All products"),
    [customer, CU] = useState(""),
    [discountInput, DI] = useState(0),
    [busy, B] = useState(false),
    [payment, PM] = useState(false),
    [tenders, PT] = useState([{ method: "Cash", amount: "" }]);
  const checkoutKey = useRef(crypto.randomUUID());
  const lines = cart
    .map((l) => ({ ...data.products.find((p) => p.id === l.id), qty: l.qty }))
    .filter((l) => l.name);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0),
    discount = Math.min(discountInput, subtotal),
    tax = Number(
      (BigInt(subtotal - discount) * BigInt(data.settings.taxBps) + 5000n) /
        10000n,
    ),
    total = subtotal - discount + tax;
  const categories = [
    "All products",
    ...new Set(data.products.map((p) => p.category)),
  ];
  const products = data.products.filter(
    (p) =>
      (category === "All products" || category === p.category) &&
      (p.name + " " + p.sku + " " + p.variant)
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  function update(id, delta) {
    const p = data.products.find((p) => p.id === id),
      current = cart.find((l) => l.id === id)?.qty || 0;
    if (current + delta > p.stock)
      return notify("That’s all the stock available for this product.");
    checkoutKey.current = crypto.randomUUID();
    setCart((prev) =>
      current + delta <= 0
        ? prev.filter((l) => l.id !== id)
        : current
          ? prev.map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
          : [...prev, { id, qty: delta }],
    );
  }
  async function pay() {
    if (busy) return;
    B(true);
    try {
      const s = await act("/sales", {
        lines: cart,
        payments: tenders.map((t) => ({ ...t, amount: +t.amount })),
        discount,
        customerId: customer || null,
        idempotency: checkoutKey.current,
      });
      setCart([]);
      DI(0);
      CU("");
      PM(false);
      checkoutKey.current = crypto.randomUUID();
      receipt({ ...s, cashier: data.user.name });
      notify("Sale completed. A good little moment.");
    } catch (e) {
      notify(e.message);
    } finally {
      B(false);
    }
  }
  async function hold(label) {
    try {
      await act("/holds", { label, lines: cart });
      setCart([]);
      DI(0);
      CU("");
      checkoutKey.current = crypto.randomUUID();
      notify("Cart held. Pick it up when you’re ready.");
      modal(null);
    } catch (e) {
      notify(e.message);
    }
  }
  function showHeld() {
    modal({
      title: "Saved for a little later",
      subtitle: tr("{{count}} held tickets", { count: data.holds.length }),
      content: ({ close }) => (
        <div className="held-list">
          {data.holds.length ? (
            data.holds.map((h) => (
              <div className="held-row" key={h.id}>
                <span>
                  <strong>{h.label}</strong>
                  <small>
                    {h.lines.reduce((a, l) => a + l.qty, 0)}
                    {tr(" items ·")}{" "}
                    {date(h.created, { hour: "2-digit", minute: "2-digit" })}
                  </small>
                </span>
                <Button
                  disabled={!!cart.length}
                  onClick={async () => {
                    try {
                      await act("/holds/" + h.id, null, "DELETE");
                      setCart(h.lines);
                      checkoutKey.current = crypto.randomUUID();
                      close();
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  {tr("Recall")}
                </Button>
                <button
                  className="icon-btn"
                  aria-label={tr("Delete held ticket")}
                  onClick={async () => {
                    try {
                      await act("/holds/" + h.id, null, "DELETE");
                      close();
                      notify("Held ticket removed.");
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <Empty icon={Pause} title={tr("Nothing on hold")}>
              {tr("Park a cart here when a customer needs a moment.")}
            </Empty>
          )}
          {!!cart.length && (
            <p className="info-callout">
              {tr("Clear or hold your current cart before recalling another.")}
            </p>
          )}
        </div>
      ),
    });
  }
  return (
    <>
      <div className="pos-layout">
        <section className="pos-products">
          <div className="pos-search-row">
            <div className="search-box">
              <Search size={18} />
              <input
                placeholder={tr("Search products or scan a barcode…")}
                aria-label={tr("Search products or scan barcode")}
                value={q}
                onChange={(e) => Q(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const p = data.products.find(
                      (p) => p.sku.toLowerCase() === q.trim().toLowerCase(),
                    );
                    if (p) {
                      update(p.id, 1);
                      Q("");
                    }
                  }
                }}
              />
              <kbd>↵</kbd>
            </div>
            <Button icon={Pause} onClick={showHeld}>
              {tr("Held ")}
              <span className="count">{data.holds.length}</span>
            </Button>
          </div>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                className={category === c ? "active" : ""}
                key={c === "All products" ? tr(c) : c}
                onClick={() => SC(c)}
              >
                {c === "All products" ? tr(c) : c}
                {c === "All products" && <span>{data.products.length}</span>}
              </button>
            ))}
          </div>
          <div className="products-grid">
            {groupProducts(data.products)
              .filter((g) =>
                products.some((p) => (p.templateId || p.id) === g.id),
              )
              .map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onOpen={() =>
                    modal({
                      title: g.name,
                      content: ({ close }) => (
                        <VariantPicker
                          group={g}
                          owner={owner}
                          cart={cart}
                          onAdd={update}
                          close={close}
                        />
                      ),
                    })
                  }
                />
              ))}
          </div>
          {!products.length && (
            <Empty
              icon={Search}
              title={
                data.products.length
                  ? tr("No matching products")
                  : tr("Add your first product")
              }
            >
              {data.products.length
                ? tr("Try another name or SKU.")
                : tr(
                    "Create your products and opening stock before making a sale.",
                  )}
              {!data.products.length && (
                <div className="empty-action">
                  <Button kind="primary" onClick={() => go("Products")}>
                    {tr("Go to products")}
                  </Button>
                </div>
              )}
            </Empty>
          )}
        </section>
        <section className="cart-panel">
          <div className="cart-heading">
            <div>
              <span className="eyebrow">{tr("A GOOD LITTLE BASKET")}</span>
              <h2>
                {tr("Current sale")}{" "}
                <span className="count">
                  {lines.reduce((a, l) => a + l.qty, 0)}
                </span>
              </h2>
            </div>
            <button
              className="icon-btn"
              aria-label={tr("Clear cart")}
              disabled={!cart.length}
              onClick={() =>
                modal({
                  title: "Start with a fresh basket?",
                  content: ({ close }) => (
                    <>
                      <p className="modal-copy">
                        This removes the items in the current sale.
                      </p>
                      <div className="form-footer">
                        <Button onClick={close}>Keep shopping</Button>
                        <Button
                          kind="primary"
                          onClick={() => {
                            setCart([]);
                            DI(0);
                            checkoutKey.current = crypto.randomUUID();
                            close();
                          }}
                        >
                          Clear basket
                        </Button>
                      </div>
                    </>
                  ),
                })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
          <Button onClick={() => go("Customers")}>
            {tr("Manage customers")}
          </Button>
          <div className="customer-select">
            <Users size={17} />
            <select
              aria-label={tr("Attach customer")}
              value={customer}
              onChange={(e) => {
                CU(e.target.value);
                checkoutKey.current = crypto.randomUUID();
              }}
            >
              <option value="">{tr("Walk-in customer")}</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              aria-label={tr("Add customer")}
              onClick={() => modal("customer")}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="cart-lines">
            {lines.length ? (
              lines.map((l) => (
                <div className="cart-line" key={l.id}>
                  <ProductImage product={l} />
                  <div>
                    <strong>{l.name}</strong>
                    <small>{variantLabel(l)}</small>
                    <small>{money(l.price)}</small>
                    <Button
                      onClick={() =>
                        modal({
                          title: l.name,
                          content: ({ close }) => (
                            <VariantPicker
                              group={groupProducts(data.products).find((g) =>
                                g.variants.some((v) => v.id === l.id),
                              )}
                              cart={cart}
                              owner={owner}
                              initialId={l.id}
                              initialQty={l.qty}
                              close={close}
                              onAdd={(id, qty) => {
                                checkoutKey.current = crypto.randomUUID();
                                setCart((prev) => {
                                  const remaining = prev.filter(
                                    (v) => v.id !== l.id,
                                  );
                                  const existing = remaining.find(
                                    (v) => v.id === id,
                                  );
                                  return existing
                                    ? remaining.map((v) =>
                                        v.id === id
                                          ? { ...v, qty: v.qty + qty }
                                          : v,
                                      )
                                    : [...remaining, { id, qty }];
                                });
                              }}
                            />
                          ),
                        })
                      }
                    >
                      {tr("Edit options")}
                    </Button>
                    <div className="quantity">
                      <button
                        aria-label={
                          "Remove one " + l.name + " " + variantLabel(l)
                        }
                        onClick={() => update(l.id, -1)}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{l.qty}</span>
                      <button
                        aria-label={"Add one " + l.name + " " + variantLabel(l)}
                        onClick={() => update(l.id, 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <b>{money(l.price * l.qty)}</b>
                </div>
              ))
            ) : (
              <Empty title={tr("A fresh start")} icon={ShoppingBag}>
                {tr("Your next lovely sale starts here.")}
                <br />
                {tr("Tap a product to add it.")}
              </Empty>
            )}
          </div>
          <div className="cart-bottom">
            <div className="cart-total-row">
              <span>{tr("Subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="cart-total-row">
              <span>
                {tr("Discount")}{" "}
                {owner && (
                  <button
                    className="discount-link"
                    onClick={() =>
                      modal({
                        title: "A little treat",
                        content: ({ close }) => (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const n = +new FormData(e.currentTarget).get(
                                "amount",
                              );
                              DI(n);
                              checkoutKey.current = crypto.randomUUID();
                              close();
                            }}
                          >
                            <Field
                              label="Discount amount (MMK)"
                              name="amount"
                              type="number"
                              min="0"
                              max={subtotal}
                              defaultValue={discount}
                              required
                            />
                            <Button kind="primary full">Apply discount</Button>
                          </form>
                        ),
                      })
                    }
                  >
                    {tr("Edit")}
                  </button>
                )}
              </span>
              <span>− {money(discount)}</span>
            </div>
            <div className="cart-total-row">
              <span>
                {tr("Tax (")}
                {data.settings.taxBps / 100}%)
              </span>
              <span>{money(tax)}</span>
            </div>
            <div className="grand-total">
              <span>
                {tr("Total ")}
                <small>{tr("MMK")}</small>
              </span>
              <strong>{money(total)}</strong>
            </div>
            <Button
              kind="primary checkout-btn"
              disabled={!!data.shift && !lines.length}
              onClick={() => {
                if (!data.shift) {
                  modal("openShift");
                  return;
                }
                PT([{ method: "Cash", amount: String(total) }]);
                PM(true);
              }}
            >
              <Wallet size={18} />
              {data.shift
                ? tr("Continue to payment")
                : tr("Open a shift to take payment")}
              <ArrowRight size={17} />
            </Button>
            <Button
              className="full hold-btn"
              icon={Pause}
              disabled={!lines.length}
              onClick={() =>
                modal({
                  title: "Save this for a little later",
                  content: ({ close }) => (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        hold(new FormData(e.currentTarget).get("label"));
                      }}
                    >
                      <Field
                        label="Customer name or a quick note"
                        name="label"
                        required
                        autoFocus
                      />
                      <Button kind="primary full">Hold ticket</Button>
                    </form>
                  ),
                })
              }
            >
              {tr("Hold sale")}
            </Button>
            <span className="cart-safe">
              <ShieldCheck size={12} />
              {tr(" A little care in every transaction.")}
            </span>
          </div>
        </section>
      </div>
      {payment && (
        <Modal
          title={tr("Let’s make it official.")}
          subtitle={`${lines.reduce((s, l) => s + l.qty, 0)} items · ${money(total)}`}
          close={() => {
            if (!busy) PM(false);
          }}
        >
          <div className="payment-total">
            <span>{tr("Total to pay")}</span>
            <strong>{money(total)}</strong>
          </div>
          {tenders.map((t, i) => (
            <div className="tender-row" key={i}>
              <Field label={tr("Payment method")}>
                <select
                  value={t.method}
                  onChange={(e) => {
                    PT((ts) =>
                      ts.map((v, j) =>
                        i === j ? { ...v, method: e.target.value } : v,
                      ),
                    );
                    checkoutKey.current = crypto.randomUUID();
                  }}
                >
                  {[
                    "Cash",
                    "KBZPay",
                    "Wave Money",
                    "AYA Pay",
                    "Card",
                    "Bank transfer",
                  ].map((m) => (
                    <option key={m} value={m}>
                      {tr(m)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={tr("Amount (MMK)")}
                type="number"
                min="0"
                value={t.amount}
                onChange={(e) => {
                  PT((ts) =>
                    ts.map((v, j) =>
                      i === j ? { ...v, amount: e.target.value } : v,
                    ),
                  );
                  checkoutKey.current = crypto.randomUUID();
                }}
              />
              {i > 0 && (
                <button
                  className="icon-btn"
                  aria-label={tr("Remove payment")}
                  onClick={() => {
                    PT((ts) => ts.filter((_, j) => i !== j));
                    checkoutKey.current = crypto.randomUUID();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            className="text-btn add-tender"
            onClick={() => {
              PT((ts) => [
                ...ts,
                {
                  method: "KBZPay",
                  amount: Math.max(
                    0,
                    total - ts.reduce((s, t) => s + Number(t.amount), 0),
                  ),
                },
              ]);
              checkoutKey.current = crypto.randomUUID();
            }}
          >
            <Plus size={15} />
            {tr(" Split payment")}
          </button>
          <div className="payment-balance">
            <span>
              {tenders.reduce((s, t) => s + Number(t.amount), 0) >= total
                ? tr("Change to give")
                : tr("Remaining balance")}
            </span>
            <strong>
              {money(
                Math.abs(
                  tenders.reduce((s, t) => s + Number(t.amount), 0) - total,
                ),
              )}
            </strong>
          </div>
          <p className="info-callout">
            {tr(
              "Wallet and card payments are recorded here. Confirm the payment on your terminal or wallet before completing.",
            )}
          </p>
          <Button
            kind="primary full"
            disabled={
              busy ||
              tenders.some(
                (t) =>
                  !Number.isSafeInteger(Number(t.amount)) ||
                  Number(t.amount) < 0,
              ) ||
              tenders.reduce((s, t) => s + Number(t.amount), 0) < total
            }
            onClick={pay}
          >
            {busy ? tr("Completing sale…") : tr("Complete sale")}{" "}
            <Check size={17} />
          </Button>
        </Modal>
      )}
    </>
  );
}
