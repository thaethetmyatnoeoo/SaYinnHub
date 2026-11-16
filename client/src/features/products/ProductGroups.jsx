import { t as tr } from "../../i18n";
import {
  variantDimensions,
  matchingVariants,
  changeOption,
  availableStock,
} from "./variantSelection";
import React, { useState } from "react";
import { Button, Field, ProductImage } from "../../components/ui";
import { money } from "../../api";
export function groupProducts(products) {
  const groups = new Map();
  for (const p of products) {
    const key = p.templateId || p.id;
    if (!groups.has(key)) groups.set(key, { ...p, id: key, variants: [] });
    groups.get(key).variants.push(p);
  }
  return [...groups.values()];
}
export function variantLabel(p) {
  return (
    [
      p.variant,
      ...(p.fields || [])
        .filter(
          (f) => f.type !== "image" && p.customFields?.[f.id] !== undefined,
        )
        .map((f) => `${f.label}: ${p.customFields[f.id]}`),
    ]
      .filter(Boolean)
      .join(" / ") || "Standard"
  );
}
export function ProductBanner({ variants }) {
  const photos = [...new Map(variants.map((v) => [v.image, v])).values()];
  const [selected, select] = useState(0);
  const active = Math.min(selected, photos.length - 1);
  return (
    <div className="product-showcase">
      <div className="showcase-stage">
        <span className="showcase-halo" aria-hidden="true" />
        <span className="showcase-plinth" aria-hidden="true" />
        <div className="showcase-frame">
          {photos.map((p, i) => (
            <div
              key={p.image}
              className={
                "showcase-slide" + (i === active ? " is-selected" : "")
              }
              aria-hidden={i !== active}
            >
              <ProductImage product={p} />
            </div>
          ))}
        </div>
        <span className="showcase-count">
          {photos.length} {photos.length === 1 ? tr("view") : tr("views")}
        </span>
      </div>
      {photos.length > 1 && (
        <div
          className="showcase-selector"
          role="group"
          aria-label={tr("Choose photo for {{name}}", {
            name: variants[0].name,
          })}
        >
          {photos.map((p, i) => (
            <button
              type="button"
              key={p.image}
              className={i === active ? "selected" : ""}
              aria-pressed={i === active}
              aria-label={tr(
                "Show photo {{index}} of {{count}} — {{variant}}",
                {
                  index: i + 1,
                  count: photos.length,
                  variant: variantLabel(p),
                },
              )}
              onClick={() => select(i)}
            >
              <ProductImage product={p} />
              <span>{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function GroupCard({ group, onOpen, extra }) {
  const prices = group.variants.map((v) => v.price),
    low = Math.min(...prices),
    high = Math.max(...prices);
  return (
    <article
      className="product-card catalog-card"
      onClick={(e) => {
        if (!e.target.closest("button")) onOpen();
      }}
    >
      <ProductBanner variants={group.variants} />
      <span className="product-category">{group.category}</span>
      <button type="button" className="group-title" onClick={onOpen}>
        <strong>{group.name}</strong>
      </button>
      <small>
        {group.variants.length}
        {tr(" variants ·")} {group.variants.reduce((s, v) => s + v.stock, 0)}
        {tr(" in stock")}
      </small>
      <small className="variant-summary">
        {group.variants.map(variantLabel).join(" · ")}
      </small>
      <span className="product-price">
        {money(low)}
        {high !== low ? " – " + money(high) : ""}
      </span>
      {extra}
      <Button onClick={onOpen}>{tr("View variants")}</Button>
    </article>
  );
}
export function VariantPicker({
  group,
  cart = [],
  onAdd,
  close,
  initialId = "",
  initialQty = 1,
  owner = false,
  readOnly = false,
}) {
  const dimensions = variantDimensions(group.variants);
  const initial = group.variants.find((v) => v.id === initialId);
  const [selection, S] = useState(
    initial
      ? Object.fromEntries(
          dimensions.map((f) => [
            f.id,
            String(initial.customFields?.[f.id] ?? ""),
          ]),
        )
      : {},
  );
  const [id, ID] = useState(initialId),
    [qty, Q] = useState(initialQty);
  const matches = matchingVariants(group.variants, dimensions, selection);
  const complete = dimensions.every((f) => Object.hasOwn(selection, f.id));
  const p =
    complete && matches.length === 1
      ? matches[0]
      : matches.find((v) => v.id === id);
  const available = p ? availableStock(p, cart, initialId) : 0;
  return (
    <form
      className="variant-picker"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !readOnly &&
          p &&
          Number.isInteger(qty) &&
          qty > 0 &&
          qty <= available
        ) {
          onAdd(p.id, qty);
          close();
        }
      }}
    >
      <div className="form-grid">
        {dimensions.map((f, index) => (
          <Field label={f.label} key={f.id}>
            <select
              disabled={dimensions
                .slice(0, index)
                .some((previous) => !Object.hasOwn(selection, previous.id))}
              value={
                Object.hasOwn(selection, f.id)
                  ? JSON.stringify(selection[f.id])
                  : ""
              }
              onChange={(e) => {
                S(
                  changeOption(
                    group.variants,
                    dimensions,
                    selection,
                    f.id,
                    e.target.value === ""
                      ? undefined
                      : JSON.parse(e.target.value),
                  ),
                );
                ID("");
              }}
            >
              <option value="">{tr("Choose an option…")}</option>
              {[
                ...new Set(
                  matchingVariants(
                    group.variants,
                    dimensions,
                    selection,
                    index,
                  ).map((v) => String(v.customFields?.[f.id] ?? "")),
                ),
              ].map((v) => (
                <option key={v} value={JSON.stringify(v)}>
                  {v || "—"}
                </option>
              ))}
            </select>
          </Field>
        ))}
        {(!dimensions.length || (complete && matches.length > 1)) && (
          <Field label={tr("Available combination")}>
            <select value={id} onChange={(e) => ID(e.target.value)} required>
              <option value="">{tr("Choose a variant…")}</option>
              {matches.map((v) => (
                <option key={v.id} value={v.id}>
                  {variantLabel(v)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {p ? (
        <>
          <ProductImage product={p} />
          <dl className="variant-facts">
            <div>
              <dt>{tr("Product code")}</dt>
              <dd>{p.sku}</dd>
            </div>
            <div>
              <dt>{tr("Selling price")}</dt>
              <dd>{money(p.price)}</dd>
            </div>
            {owner && p.cost !== undefined && (
              <div>
                <dt>{tr("Cost price")}</dt>
                <dd>{money(p.cost)}</dd>
              </div>
            )}
            <div>
              <dt>{tr("Stock")}</dt>
              <dd>{p.stock}</dd>
            </div>
            {!readOnly && (
              <div>
                <dt>{tr("Available to add")}</dt>
                <dd>{available}</dd>
              </div>
            )}
          </dl>
          {!readOnly && (
            <Field
              label={tr("Quantity")}
              type="number"
              min={1}
              max={available}
              step={1}
              required
              value={qty}
              onChange={(e) => Q(Number(e.target.value))}
            />
          )}
          {!readOnly && available === 0 && (
            <p role="status">{tr("Out of stock")}</p>
          )}
        </>
      ) : (
        <p role="status">{tr("Select options to see price and stock.")}</p>
      )}
      {!readOnly && (
        <Button
          kind="primary"
          disabled={
            !p ||
            available < 1 ||
            qty < 1 ||
            qty > available ||
            !Number.isInteger(qty)
          }
        >
          {initialId ? tr("Update cart item") : tr("Add selected variant")}
        </Button>
      )}
    </form>
  );
}
