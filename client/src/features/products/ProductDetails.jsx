import { t as tr } from "../../i18n";
import React, { useState } from "react";
import { Button, Field, ProductImage } from "../../components/ui";
import { money } from "../../api";
import { variantLabel, VariantPicker } from "./ProductGroups";
import { TemplateFields } from "./TemplateFields";
import { AddVariants } from "./AddVariants";
export function ProductDetails({
  group,
  data,
  act,
  notify,
  close,
  modal,
  edit,
}) {
  const t = data.productTemplates.find((t) => t.id === group.id);
  const [fields, F] = useState(t.fields),
    [name, N] = useState(t.name),
    [category, C] = useState(t.category),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [archive, A] = useState(null);
  const owner = data.user.role === "OWNER";
  async function save(e) {
    e.preventDefault();
    B(true);
    try {
      await act(
        "/product-templates/" + t.id,
        { fields, name, category },
        "PUT",
      );
      notify("Product form saved.");
      close();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <div>
      <VariantPicker group={group} owner={owner} readOnly />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tr("Photo")}</th>
              <th>{tr("Variant")}</th>
              <th>{tr("Stock")}</th>
              <th>{tr("Price")}</th>
              <th>{tr("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {group.variants.map((v) => (
              <tr key={v.id}>
                <td>
                  <ProductImage product={v} />
                </td>
                <td>
                  {variantLabel(v)}
                  <small>{v.sku}</small>
                </td>
                <td>{v.stock}</td>
                <td>{money(v.price)}</td>
                <td>
                  <Button onClick={() => edit(v)}>{tr("Edit variant")}</Button>
                  <Button
                    onClick={() =>
                      modal({
                        title: "Update stock",
                        content: ({ formAction, working }) => (
                          <form
                            onSubmit={(e) =>
                              formAction(e, "/inventory/" + v.id, (d) => ({
                                delta: +d.delta,
                                reason: d.reason,
                              }))
                            }
                          >
                            <Field
                              label="Stock change (+ or -)"
                              name="delta"
                              type="number"
                              step={1}
                              required
                            />
                            <Field label="Reason" name="reason" required />
                            <Button disabled={working}>Update stock</Button>
                          </form>
                        ),
                      })
                    }
                  >
                    {tr("Stock")}
                  </Button>
                  {owner && (
                    <Button onClick={() => A(v)}>{tr("Remove")}</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {archive && (
        <div className="info-callout">
          <p>
            {tr("Archive ")}
            {variantLabel(archive)}
            {tr("? Sales history and inventory records will be retained.")}
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              B(true);
              try {
                await act(
                  "/products/" + archive.id,
                  { archived: true },
                  "PATCH",
                );
                notify("Variant archived.");
                close();
              } catch (e) {
                E(e.message);
              } finally {
                B(false);
              }
            }}
          >
            {tr("Confirm archive")}
          </Button>
          <Button onClick={() => A(null)}>{tr("Cancel")}</Button>
        </div>
      )}
      <Button
        onClick={() =>
          modal({
            title: "Add variants",
            wide: true,
            content: ({ close }) => (
              <AddVariants
                data={data}
                template={t}
                act={act}
                notify={notify}
                close={close}
              />
            ),
          })
        }
      >
        {tr("+ Add More Variants")}
      </Button>
      {owner && (
        <form onSubmit={save}>
          <Field
            label={tr("Product name")}
            required
            maxLength={100}
            value={name}
            onChange={(e) => N(e.target.value)}
          />
          <Field label={tr("Category")}>
            <select value={category} onChange={(e) => C(e.target.value)}>
              {data.categories.map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
          <TemplateFields fields={fields} setFields={F} />
          <Button kind="primary" disabled={busy}>
            {tr("Save product form")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
