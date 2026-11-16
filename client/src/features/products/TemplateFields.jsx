import { t as tr } from "../../i18n";
import React from "react";
import { Button, Field } from "../../components/ui";
import { ImageUpload } from "../../components/ImageUpload";
export function TemplateFields({ fields, setFields }) {
  const update = (i, k, v) =>
    setFields(fields.map((f, n) => (n === i ? { ...f, [k]: v } : f)));
  return (
    <fieldset className="custom-fields">
      <legend>{tr("Reusable product form")}</legend>
      <p>
        {tr(
          "These fields belong only to this product. Removing fields hides them; saved values are retained.",
        )}
      </p>
      {fields.map((f, i) => (
        <fieldset key={f.id} className="category-field-row">
          <div className="form-grid">
            <Field
              label={tr("Field name")}
              required
              maxLength={100}
              value={f.label}
              onChange={(e) => update(i, "label", e.target.value)}
            />
            <Field label={tr("Field type")}>
              <select
                value={f.type}
                onChange={(e) => update(i, "type", e.target.value)}
              >
                {[
                  "text",
                  "number",
                  "decimal",
                  "select",
                  "checkbox",
                  "date",
                  "image",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t === "select" ? tr("Dropdown") : tr(t)}
                  </option>
                ))}
              </select>
            </Field>
            {f.type === "select" && (
              <Field label={tr("Options (one per line)")}>
                <textarea
                  required
                  value={f.options.join("\n")}
                  onChange={(e) =>
                    update(i, "options", e.target.value.split("\n"))
                  }
                />
              </Field>
            )}
            {["number", "decimal"].includes(f.type) && (
              <>
                <Field
                  label={tr("Minimum")}
                  type="number"
                  step="any"
                  value={f.min ?? ""}
                  onChange={(e) =>
                    update(
                      i,
                      "min",
                      e.target.value === "" ? undefined : +e.target.value,
                    )
                  }
                />
                <Field
                  label={tr("Maximum")}
                  type="number"
                  step="any"
                  value={f.max ?? ""}
                  onChange={(e) =>
                    update(
                      i,
                      "max",
                      e.target.value === "" ? undefined : +e.target.value,
                    )
                  }
                />
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => update(i, "required", e.target.checked)}
              />{" "}
              {tr("Required")}
            </label>
          </div>
          <Button
            type="button"
            onClick={() => setFields(fields.filter((_, n) => n !== i))}
          >
            {tr("Remove field")}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        disabled={fields.length >= 30}
        onClick={() =>
          setFields([
            ...fields,
            {
              id: "f_" + crypto.randomUUID().replaceAll("-", ""),
              label: "",
              type: "text",
              required: false,
              options: [],
            },
          ])
        }
      >
        {tr("+ Add Field")}
      </Button>
    </fieldset>
  );
}
export function FieldValues({ fields, values, setValues, onBusy }) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <Field key={f.id} label={f.label + (f.required ? " *" : "")}>
          {f.type === "image" ? (
            <>
              <ImageUpload
                label={f.label}
                purpose="product"
                value={values[f.id] || ""}
                onChange={(v) => setValues({ ...values, [f.id]: v })}
                onBusy={onBusy}
              />
              {f.required && !values[f.id] && (
                <small>{tr("Image required")}</small>
              )}
            </>
          ) : f.type === "select" ? (
            <select
              required={f.required}
              value={values[f.id] ?? ""}
              onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            >
              <option value="">{tr("Choose…")}</option>
              {f.options.map((o, i) => (
                <option key={i}>{o}</option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={values[f.id] === true}
              onChange={(e) =>
                setValues({ ...values, [f.id]: e.target.checked })
              }
            />
          ) : (
            <input
              type={f.type === "decimal" ? "number" : f.type}
              required={f.required}
              min={f.min}
              max={f.max}
              step={f.type === "decimal" ? "any" : 1}
              maxLength={1000}
              value={values[f.id] ?? ""}
              onChange={(e) =>
                setValues({
                  ...values,
                  [f.id]:
                    ["number", "decimal"].includes(f.type) &&
                    e.target.value !== ""
                      ? +e.target.value
                      : e.target.value,
                })
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}
