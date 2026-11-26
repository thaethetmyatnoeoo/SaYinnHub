import React, { useState } from "react";
import { Bell, CheckCheck, Mail, MailOpen, Trash2 } from "lucide-react";
import { Button, Empty, ProductImage } from "../components/ui";
import { t as tr } from "../i18n";

export function Notifications({ items, act, openInventory }) {
  const [filter, setFilter] = useState("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = items.filter(
    (n) => filter === "All" || n.status === filter.toLowerCase(),
  );
  const unread = items.filter((n) => n.status === "unread");
  async function update(selected, status) {
    setBusy(true);
    setError("");
    try {
      await act(
        "/notifications",
        {
          items: selected.map(({ id, signature }) => ({ id, signature })),
          status,
        },
        "PUT",
      );
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notification-center">
      <div className="notification-tools">
        <div className="notification-filters" aria-label={tr("Notifications")}>
          {["All", "Unread", "Read"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {tr(value)}
            </button>
          ))}
        </div>
        <Button
          icon={CheckCheck}
          disabled={busy || !unread.length}
          onClick={() => update(unread, "read")}
        >
          {tr("Mark all as read")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <div className="notification-entries">
        {visible.map((n) => (
          <article className={`notification-entry ${n.status}`} key={n.id}>
            <button
              className="notification-content"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await update([n], "read")) openInventory();
              }}
            >
              <ProductImage product={n} />
              <span>
                <strong>{n.name}</strong>
                {n.variant && <small>{n.variant}</small>}
                <small>
                  {n.stock}
                  {tr(" left · Time for a restock")}
                </small>
                <em>{tr(n.status === "read" ? "Read" : "Unread")}</em>
              </span>
            </button>
            <div className="notification-actions">
              <button
                className="icon-btn"
                type="button"
                disabled={busy}
                title={tr(
                  n.status === "read" ? "Mark as unread" : "Mark as read",
                )}
                aria-label={tr(
                  n.status === "read" ? "Mark as unread" : "Mark as read",
                )}
                onClick={() =>
                  update([n], n.status === "read" ? "unread" : "read")
                }
              >
                {n.status === "read" ? (
                  <Mail size={18} />
                ) : (
                  <MailOpen size={18} />
                )}
              </button>
              <button
                className="icon-btn"
                type="button"
                disabled={busy}
                title={tr("Delete notification")}
                aria-label={tr("Delete notification")}
                onClick={() => update([n], "deleted")}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </article>
        ))}
        {!visible.length && (
          <Empty icon={Bell} title={tr("No notifications")}>
            {tr("No notifications in this view.")}
          </Empty>
        )}
      </div>
    </div>
  );
}
