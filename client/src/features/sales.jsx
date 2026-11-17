import { t as tr } from "../i18n";
import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Button, Badge, Empty, Field, Receipt } from "../components/ui";

export function SalesTable({ sales, onSelect, compact = false }) {
  return sales.length ? (
    <div className="table-scroll">
      <table className="sales-table">
        <thead>
          <tr>
            <th>{tr("Receipt")}</th>
            <th>{tr("Customer")}</th>
            {!compact && <th>{tr("Date / cashier")}</th>}
            <th>{tr("Amount")}</th>
            <th>{tr("Status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id} onClick={() => onSelect(s)}>
              <td>
                <button
                  className="receipt-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(s);
                  }}
                >
                  {s.receipt}
                </button>
                <small>
                  {date(s.created, { hour: "2-digit", minute: "2-digit" })}
                </small>
              </td>
              <td>
                <span className="customer-name">
                  {s.customer || tr("Walk-in customer")}
                </span>
                <small>{s.payments.map((p) => tr(p.method)).join(" + ")}</small>
              </td>
              {!compact && (
                <td>
                  {date(s.created)}
                  <small>{s.cashier}</small>
                </td>
              )}
              <td className="amount">{money(s.total)}</td>
              <td>
                <Badge tone={refunded(s) ? "amber" : "green"}>
                  {refunded(s) ? tr("Returned") : tr("Completed")}
                </Badge>
              </td>
              <td>
                <ChevronRight size={14} className="muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title={tr("Your first sale is a good place to start")}>
      {tr("Completed sales will appear here.")}
    </Empty>
  );
}

export function Sales({ data, search, receipt, modal, act, notify, owner }) {
  const [q, Q] = useState(""),
    [method, PM] = useState("All payments"),
    [page, SP] = useState(0);
  const sales = data.sales.filter(
    (s) =>
      (s.receipt + " " + (s.customer || "Walk-in"))
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (method === "All payments" ||
        s.payments.some((p) => p.method === method)),
  );
  function select(s) {
    modal({
      title: s.receipt,
      subtitle: date(s.created, {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      content: ({ close }) => (
        <>
          <Receipt sale={s} settings={data.settings} />
          <div className="receipt-actions">
            <Button
              icon={Printer}
              onClick={() => {
                close();
                receipt(s);
              }}
            >
              {tr("Receipt / print")}
            </Button>
            {owner && (
              <Button onClick={() => refund(s)}>{tr("Return an item")}</Button>
            )}
          </div>
        </>
      ),
    });
  }
  function refund(s) {
    modal({
      title: "Make a return",
      subtitle: s.receipt,
      content: ({ formAction, working }) => (
        <form
          onSubmit={(e) =>
            formAction(e, "/sales/" + s.id + "/refund", (d) => ({
              productId: d.productId,
              qty: +d.qty,
              reason: d.reason,
              restock: d.restock === "on",
            }))
          }
        >
          <p className="info-callout">
            {tr(
              "Open your shift before recording a refund. The refund will be included in that shift’s cash totals.",
            )}
          </p>
          <Field label={tr("Product")}>
            <select name="productId">
              {s.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.qty}
                  {tr(" sold")}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={tr("Quantity")}
            name="qty"
            type="number"
            min="1"
            defaultValue="1"
            required
          />
          <Field label={tr("Reason for return")} name="reason" required />
          <label className="checkbox-label">
            <input type="checkbox" name="restock" defaultChecked />
            {tr(" Return items to stock")}
          </label>
          <Button kind="primary full" disabled={working}>
            {tr("Complete cash refund")}
          </Button>
        </form>
      ),
    });
  }
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder={tr("Search receipt or customer…")}
            value={q}
            onChange={(e) => {
              Q(e.target.value);
              SP(0);
            }}
            aria-label={tr("Search sales")}
          />
        </div>
        <div className="toolbar-right">
          <select
            value={method}
            onChange={(e) => {
              PM(e.target.value);
              SP(0);
            }}
            aria-label={tr("Filter by payment")}
          >
            <option value="All payments">{tr("All payments")}</option>
            {[
              ...new Set(
                data.sales.flatMap((s) => s.payments.map((p) => p.method)),
              ),
            ].map((m) => (
              <option key={m} value={m}>
                {tr(m)}
              </option>
            ))}
          </select>
          <span className="count">
            {sales.length}
            {tr(" sales")}
          </span>
        </div>
      </div>
      <SalesTable
        sales={sales.slice(page * 10, page * 10 + 10)}
        onSelect={select}
      />
      <Pagination page={page} setPage={SP} total={sales.length} />
    </section>
  );
}

export function Pagination({ page, setPage, total }) {
  return (
    <div className="pagination">
      <span>
        {total
          ? `${page * 10 + 1}–${Math.min(total, page * 10 + 10)} of ${total}`
          : tr("0 records")}
      </span>
      <div>
        <button
          className="icon-btn"
          aria-label={tr("Previous page")}
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {tr("Page ")}
          {page + 1}
        </span>
        <button
          className="icon-btn"
          aria-label={tr("Next page")}
          disabled={(page + 1) * 10 >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
