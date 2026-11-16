import { t as tr } from "../../i18n";
import React, { useState } from "react";
import { AddVariants } from "./AddVariants";
import { FieldValues } from "./TemplateFields";
import { Button, Field } from "../../components/ui";
import { ImageUpload } from "../../components/ImageUpload";

export function ProductForm(props) {
  return props.product ? (
    <EditVariant {...props} />
  ) : (
    <AddVariants {...props} />
  );
}
function EditVariant({ product, data, act, notify, close }) {
  const [category, C] = useState(product?.category || ""),
    [image, I] = useState(product?.image || ""),
    [values, V] = useState(product?.customFields || {}),
    [busy, B] = useState(false),
    [uploading, U] = useState(0),
    [error, E] = useState("");
  const owner = data.user.role === "OWNER";
  const categories = [
    ...new Set([
      ...data.products.map((p) => p.category),
      ...(data.categories || []).map((c) => c.name),
    ]),
  ];
  const fields = product.fields || [];
  async function submit(e) {
    e.preventDefault();
    B(true);
    E("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const customFields = Object.fromEntries(
      fields
        .filter((f) => values[f.id] !== undefined && values[f.id] !== "")
        .map((f) => [
          f.id,
          ["number", "decimal"].includes(f.type)
            ? Number(values[f.id])
            : values[f.id],
        ]),
    );
    try {
      await act(
        "/products" + (product ? "/" + product.id : ""),
        {
          ...d,
          price: +d.price,
          ...(owner ? { cost: +d.cost } : {}),
          ...(!product ? { stock: +d.stock } : {}),
          threshold: +d.threshold,
          category,
          image: image || "serum.webp",
          customFields,
        },
        product ? "PUT" : "POST",
      );
      notify("Product saved.");
      close();
    } catch (err) {
      E(err.message);
    } finally {
      B(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field
          label={tr("Product name")}
          name="name"
          defaultValue={product?.name}
          readOnly={
            data.products.filter((p) => p.templateId === product.templateId)
              .length > 1
          }
          required
          maxLength={150}
        />
        <Field
          label={tr("Variant / size")}
          name="variant"
          defaultValue={product?.variant}
          maxLength={100}
        />
        <Field
          label={tr("SKU / barcode")}
          name="sku"
          defaultValue={product?.sku}
          required
        />
        <Field label={tr("Category")}>
          <input
            readOnly
            list="product-categories"
            value={category}
            onChange={(e) => {
              C(e.target.value);
              V(
                e.target.value === product?.category
                  ? product.customFields || {}
                  : {},
              );
            }}
            required
            maxLength={100}
          />
          <datalist id="product-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          label={tr("Selling price (MMK)")}
          name="price"
          type="number"
          min="0"
          step="1"
          defaultValue={product?.price}
          required
        />
        {owner && (
          <Field
            label={tr("Cost price (MMK)")}
            name="cost"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.cost || 0}
            required
          />
        )}
        {!product && (
          <Field
            label={tr("Opening stock")}
            name="stock"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            required
          />
        )}
        <Field
          label={tr("Low-stock threshold")}
          name="threshold"
          type="number"
          min="0"
          step="1"
          defaultValue={product?.threshold ?? 5}
          required
        />
      </div>
      <FieldValues
        fields={fields}
        values={values}
        setValues={V}
        onBusy={(b) => U((n) => Math.max(0, n + (b ? 1 : -1)))}
      />
      <ImageUpload
        label={tr("Product image")}
        purpose="product"
        value={image}
        onChange={I}
        onBusy={(b) => U((n) => Math.max(0, n + (b ? 1 : -1)))}
      />
      {!owner && !product && (
        <p className="info-callout">
          {tr(
            "The owner can add cost pricing later. Opening cost is recorded as zero.",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <div className="form-footer">
        <Button type="button" onClick={close}>
          {tr("Cancel")}
        </Button>
        <Button kind="primary" disabled={busy || uploading}>
          {busy ? tr("Saving…") : tr("Save product")}
        </Button>
      </div>
    </form>
  );
}
