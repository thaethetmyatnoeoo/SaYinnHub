import { t as tr } from "../../i18n";
import React, { useState } from "react";
import { Button, Field } from "../../components/ui";
import { ImageUpload } from "../../components/ImageUpload";
export function ShopSettings({ data, act, notify }) {
  const [logo, L] = useState(data.settings.shopLogo || ""),
    [uploading, U] = useState(false),
    [busy, B] = useState(false),
    [error, E] = useState("");
  async function save(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    B(true);
    E("");
    try {
      await act(
        "/settings",
        { ...d, currency: "MMK", taxBps: +d.taxBps, shopLogo: logo },
        "PUT",
      );
      notify("Shop settings saved.");
    } catch (err) {
      E(err.message);
    } finally {
      B(false);
    }
  }
  return (
    <section className="panel account-panel">
      <h2>{tr("Shop settings")}</h2>
      <p className="info-callout">
        {tr("Your shop code: ")}
        <strong>{data.shopCode || tr("main")}</strong>
        {tr(
          ". Share this code with members so they can request to join your team.",
        )}
      </p>
      <form onSubmit={save}>
        <div className="form-grid">
          <Field
            label={tr("Shop name")}
            name="storeName"
            defaultValue={data.settings.storeName}
            required
          />
          <Field
            label={tr("Tax (basis points · 500 = 5%)")}
            name="taxBps"
            type="number"
            min="0"
            max="10000"
            defaultValue={data.settings.taxBps}
            required
          />
        </div>
        <ImageUpload
          label={tr("Online shop / receipt logo")}
          purpose="shop"
          value={logo}
          onChange={L}
          onBusy={U}
        />
        <p>
          {tr(
            "Your logo appears prominently on printed receipts. Without a logo, receipts display your shop name.",
          )}
        </p>
        <Field
          label={tr("Receipt footer")}
          name="receiptFooter"
          defaultValue={data.settings.receiptFooter}
          maxLength={300}
        />
        {error && (
          <p className="form-error" role="alert">
            {tr(error)}
          </p>
        )}
        <Button kind="primary" disabled={busy || uploading}>
          {tr("Save shop settings")}
        </Button>
      </form>
    </section>
  );
}
