import React, { useState } from "react";
import { t as tr } from "../../i18n";
import { Button, Field } from "../../components/ui";
export function PaymentMethods({ data, act }) {
  const [items, setItems] = useState(data.paymentMethods),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const change = (index, patch) =>
    setItems(items.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  return (
    <section className="panel account-panel payment-settings">
      <h2>{tr("Payment methods")}</h2>
      <p>
        {tr(
          "Manage recorded payment options. This does not connect a payment gateway.",
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const result = await act("/payment-methods", items, "PUT");
            setItems(result);
            setMessage("Payment methods saved.");
          } catch (error) {
            setMessage(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>{tr("Available methods")}</legend>
          {items.map((m, i) => (
            <div className="payment-method-row" key={m.id || `new-${i}`}>
              <Field label={tr("Payment method")}>
                <input
                  aria-label={tr("Payment method")}
                  value={m.builtin ? tr(m.name) : m.name}
                  readOnly={m.builtin}
                  required
                  maxLength={60}
                  onChange={(e) => change(i, { name: e.target.value })}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => change(i, { enabled: e.target.checked })}
                />
                {tr("Enabled")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={m.cashier}
                  onChange={(e) => change(i, { cashier: e.target.checked })}
                />
                {tr("Available to cashiers")}
              </label>
              {!m.builtin && (
                <Button
                  type="button"
                  onClick={() => setItems(items.filter((_, j) => i !== j))}
                >
                  {tr("Remove")}
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            onClick={() =>
              setItems([...items, { name: "", enabled: true, cashier: true }])
            }
            disabled={items.length >= 30}
          >
            {tr("Add payment method")}
          </Button>
          <Button kind="primary">{tr("Save payment methods")}</Button>
        </fieldset>
        {message && <p role="status">{tr(message)}</p>}
      </form>
    </section>
  );
}
