import { Pencil, Trash2, Tags, ArrowUpRight, Plus } from "lucide-react";
import { t as tr } from "../../i18n";
import React, { useState, useRef, useEffect } from "react";
import { Button, Field } from "../../components/ui";
export function CategoryFields({ data, act, notify, onSelect }) {
  const [items, S] = useState(data.categories),
    [name, N] = useState(""),
    [editing, D] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [confirm, C] = useState("");
  const input = useRef(null);
  useEffect(() => S(data.categories), [data.categories]);
  async function save(e) {
    e.preventDefault();
    B(true);
    E("");
    try {
      await act(
        "/categories" + (editing ? "/" + encodeURIComponent(editing) : ""),
        { name },
        editing ? "PUT" : "POST",
      );
      S([
        ...items.filter((c) => c.name !== editing),
        {
          ...items.find((c) => c.name === editing),
          name: name.trim(),
          fields: items.find((c) => c.name === editing)?.fields || [],
        },
      ]);
      N("");
      D("");
      notify("Category saved.");
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  async function remove() {
    B(true);
    E("");
    try {
      await act("/categories/" + encodeURIComponent(confirm), null, "DELETE");
      S(items.filter((c) => c.name !== confirm));
      C("");
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <div className="category-manager">
      <p>
        {tr(
          "Select a category to view its products. Custom forms are configured on each product.",
        )}
      </p>
      <div className="category-card-grid">
        {items.map((c) => (
          <article className="category-card" key={c.name}>
            <span className="category-card-icon">
              <Tags size={24} />
            </span>
            <div className="category-card-actions">
              <button
                type="button"
                className="icon-btn"
                disabled={busy}
                aria-label={tr("Rename {{name}}", { name: c.name })}
                title={tr("Rename category")}
                onClick={() => {
                  D(c.name);
                  N(c.name);
                  input.current?.focus();
                }}
              >
                <Pencil size={17} />
              </button>
              <button
                type="button"
                className="icon-btn category-delete"
                disabled={busy}
                aria-label={tr("Remove {{name}}", { name: c.name })}
                title={tr("Remove category")}
                onClick={() => C(c.name)}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <button
              className="category-card-link"
              type="button"
              onClick={() => onSelect(c.name)}
            >
              <strong>{c.name}</strong>
              <ArrowUpRight size={18} />
            </button>
            <span className="category-card-count">
              {tr("{{count}} products", {
                count: new Set(
                  (data.products || [])
                    .filter((p) => p.category === c.name)
                    .map((p) => p.templateId || p.id),
                ).size,
              })}
            </span>
          </article>
        ))}
      </div>
      {!items.length && (
        <p className="info-callout">
          {tr("Add your first category to organize your products.")}
        </p>
      )}
      {confirm && (
        <div className="info-callout" role="alert">
          <p>
            {tr("Remove category “")}
            {confirm}
            {tr("”? Categories containing inventory cannot be removed.")}
          </p>
          <Button disabled={busy} onClick={remove}>
            {tr("Confirm removal")}
          </Button>
          <Button onClick={() => C("")}>{tr("Cancel")}</Button>
        </div>
      )}
      <form onSubmit={save} className="category-editor">
        <Field
          label={editing ? tr("Rename category") : tr("New category")}
          ref={input}
          required
          maxLength={100}
          value={name}
          onChange={(e) => N(e.target.value)}
        />
        <Button kind="primary" icon={editing ? Pencil : Plus} disabled={busy}>
          {editing ? tr("Save category") : tr("Add category")}
        </Button>
        {editing && (
          <Button
            type="button"
            onClick={() => {
              D("");
              N("");
            }}
          >
            {tr("Cancel rename")}
          </Button>
        )}
      </form>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
