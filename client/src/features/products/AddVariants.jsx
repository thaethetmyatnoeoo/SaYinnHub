import { t as tr } from "../../i18n";
import React, { useState } from "react";
import { Button, Field } from "../../components/ui";
import { ImageUpload } from "../../components/ImageUpload";
import { TemplateFields, FieldValues } from "./TemplateFields";
const blank = () => ({
  key: crypto.randomUUID(),
  variant: "",
  sku: "",
  stock: 0,
  price: 0,
  cost: 0,
  threshold: 5,
  image: "",
  customFields: {},
});
export function AddVariants({
  data,
  act,
  notify,
  close,
  template,
  initialCategory = "",
}) {
  const owner = data.user.role === "OWNER";
  const [category, C] = useState(template?.category || initialCategory),
    [selected, S] = useState(template?.id || ""),
    [name, N] = useState(template?.name || ""),
    [fields, F] = useState(template?.fields || []),
    [rows, R] = useState([blank()]),
    [busy, B] = useState(false),
    [uploads, U] = useState(0),
    [error, E] = useState("");
  const choices = (data.productTemplates || []).filter(
    (t) => t.category === category,
  );
  function choose(id) {
    S(id);
    const t = choices.find((t) => t.id === id);
    N(t?.name || "");
    F(t?.fields || []);
    R([blank()]);
  }
  const update = (i, k, v) =>
    R((current) => current.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  async function submit(e) {
    e.preventDefault();
    B(true);
    E("");
    try {
      await act("/product-templates/variants", {
        templateId: selected === "new" ? undefined : selected,
        name,
        category,
        ...(owner ? { fields } : {}),
        variants: rows.map(({ key, cost, ...r }) => ({
          ...r,
          ...(owner ? { cost: +cost } : {}),
          image: r.image || "serum.webp",
        })),
      });
      notify("All variants saved.");
      close();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label={tr("1. Select category")}>
        <select
          required
          value={category}
          disabled={!!template}
          onChange={(e) => {
            C(e.target.value);
            S("");
            N("");
            F([]);
            R([blank()]);
          }}
        >
          <option value="">{tr("Choose category…")}</option>
          {data.categories.map((c) => (
            <option key={c.name}>{c.name}</option>
          ))}
        </select>
      </Field>
      {!data.categories.length && (
        <p>{tr("Create a category using the Categories button first.")}</p>
      )}
      {category && (
        <Field label={tr("2. Select product")}>
          <select
            required
            value={selected}
            disabled={!!template}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">{tr("Choose product…")}</option>
            {choices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="new">{tr("+ Create New Product")}</option>
          </select>
        </Field>
      )}
      {selected && (
        <>
          <Field
            label={tr("Product name")}
            required
            maxLength={100}
            value={name}
            readOnly={selected !== "new"}
            onChange={(e) => N(e.target.value)}
          />
          {owner && <TemplateFields fields={fields} setFields={F} />}
          {rows.map((r, i) => (
            <fieldset className="custom-fields" key={r.key}>
              <legend>
                {tr("Variant ")}
                {i + 1} — {name}
              </legend>
              <div className="form-grid">
                {[
                  ["variant", "Variant label", "text"],
                  ["sku", "SKU / product code (optional)", "text"],
                  ["stock", "Opening stock", "number"],
                  ["price", "Selling price (MMK)", "number"],
                  ...(owner ? [["cost", "Cost price (MMK)", "number"]] : []),
                  ["threshold", "Low-stock threshold", "number"],
                ].map(([k, label, type]) => (
                  <Field
                    key={k}
                    label={tr(label)}
                    type={type}
                    placeholder={
                      k === "sku" ? tr("Generated automatically") : undefined
                    }
                    required={k !== "variant" && k !== "sku"}
                    min={type === "number" ? 0 : undefined}
                    step={1}
                    maxLength={100}
                    value={r[k]}
                    onChange={(e) =>
                      update(
                        i,
                        k,
                        type === "number" ? +e.target.value : e.target.value,
                      )
                    }
                  />
                ))}
              </div>
              <FieldValues
                fields={fields}
                values={r.customFields}
                setValues={(v) => update(i, "customFields", v)}
                onBusy={(b) => U((n) => Math.max(0, n + (b ? 1 : -1)))}
              />
              <ImageUpload
                label={tr("Variant photo")}
                purpose="product"
                value={r.image}
                onChange={(v) => update(i, "image", v)}
                onBusy={(b) => U((n) => Math.max(0, n + (b ? 1 : -1)))}
              />
              {rows.length > 1 && (
                <Button
                  type="button"
                  onClick={() => R(rows.filter((_, n) => n !== i))}
                >
                  {tr("Remove unsaved variant")}
                </Button>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            disabled={rows.length >= 50}
            onClick={() =>
              R([
                ...rows,
                {
                  ...blank(),
                  price: rows.at(-1).price,
                  cost: rows.at(-1).cost,
                  threshold: rows.at(-1).threshold,
                },
              ])
            }
          >
            {tr("+ Add More")}
          </Button>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {tr(error)}
        </p>
      )}
      <div className="form-footer">
        <Button type="button" onClick={close}>
          {tr("Cancel")}
        </Button>
        <Button kind="primary" disabled={!selected || busy || uploads > 0}>
          {busy ? tr("Saving…") : tr("Save all variants")}
        </Button>
      </div>
    </form>
  );
}
