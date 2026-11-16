import { t as tr } from "../../i18n";
import React, { useState } from "react";
import { Button, Field } from "../../components/ui";
export function CategoryFields({ data, act, notify, onSelect }) {
  const [items, S] = useState(data.categories),
    [name, N] = useState(""),
    [editing, D] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [confirm, C] = useState("");
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
        { name: name.trim(), fields: [] },
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
    <div>
      <p>
        {tr(
          "Select a category to view its products. Custom forms are configured on each product.",
        )}
      </p>
      {items.map((c) => (
        <div className="held-row" key={c.name}>
          <Button onClick={() => onSelect(c.name)}>{c.name}</Button>
          <Button
            onClick={() => {
              D(c.name);
              N(c.name);
            }}
          >
            {tr("Rename")}
          </Button>
          <Button onClick={() => C(c.name)}>{tr("Remove")}</Button>
        </div>
      ))}
      {confirm && (
        <div className="info-callout">
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
      <form onSubmit={save}>
        <Field
          label={editing ? tr("Rename category") : tr("New category")}
          required
          maxLength={100}
          value={name}
          onChange={(e) => N(e.target.value)}
        />
        <Button kind="primary" disabled={busy}>
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
