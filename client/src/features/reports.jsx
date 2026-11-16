import { t as tr } from "../i18n";
import React, { useState, useEffect, useRef } from "react";
import { Wallet } from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Empty } from "../components/ui";
import { SalesChart, BestProducts } from "./dashboard";

export function Reports({ data }) {
  const [period, P] = useState(7);
  const sales = data.sales.filter(
    (s) => new Date(s.created).getTime() >= Date.now() - period * 86400000,
  );
  const net = sales.reduce((a, s) => a + s.total - refunded(s), 0),
    refund = sales.reduce((a, s) => a + refunded(s), 0),
    profit = sales.reduce(
      (a, s) =>
        a +
        s.total -
        s.tax -
        refunded(s) -
        s.lines.reduce(
          (n, l) =>
            n +
            l.cost *
              (l.qty -
                s.refunds
                  .filter((r) => r.productId === l.id)
                  .reduce((t, r) => t + r.qty, 0)),
          0,
        ),
      0,
    ),
    methods = [
      ...new Set(sales.flatMap((s) => s.payments.map((p) => p.method))),
    ];
  return (
    <>
      <div className="overview-toolbar">
        <div className="tab-group">
          <button
            className={period === 7 ? "selected" : ""}
            onClick={() => P(7)}
          >
            {tr("Last 7 days")}
          </button>
          <button
            className={period === 30 ? "selected" : ""}
            onClick={() => P(30)}
          >
            {tr("Last 30 days")}
          </button>
        </div>
        <span className="muted">
          {tr("Based on ")}
          {sales.length}
          {tr(" completed sales")}
        </span>
      </div>
      <div className="report-stats">
        {[
          ["Net revenue", net],
          ["Estimated gross profit", profit],
          ["Refunds issued", refund],
        ].map(([label, v]) => (
          <section className="panel" key={tr(label)}>
            <span>{tr(label)}</span>
            <strong>{money(v)}</strong>
            <small>
              {label.includes("profit")
                ? tr("After recorded cost and refunds, before overheads")
                : tr("For the selected period")}
            </small>
          </section>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{tr("A clearer view of your sales")}</h2>
              <p>{tr("Every sale adds up to something.")}</p>
            </div>
          </div>
          <SalesChart sales={sales} period={period} />
        </section>
        <section className="panel payment-mix">
          <div className="panel-heading">
            <h2>{tr("How they pay")}</h2>
            <Wallet size={18} />
          </div>
          {methods.length ? (
            methods.map((m, i) => {
              const amount = sales.reduce(
                (a, s) =>
                  a +
                  s.payments
                    .filter((p) => p.method === m)
                    .reduce((t, p) => t + p.amount, 0) -
                  (m === "Cash" ? s.change_amount : 0),
                0,
              );
              const gross = sales.reduce((a, s) => a + s.total, 0);
              return (
                <div className="payment-method" key={tr(m)}>
                  <div>
                    <span>
                      <i className={"method-dot dot-" + i} />
                      {tr(m)}
                    </span>
                    <strong>{money(amount)}</strong>
                  </div>
                  <div className="payment-track">
                    <span
                      style={{
                        width: (gross ? (amount / gross) * 100 : 0) + "%",
                      }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <Empty icon={Wallet} title={tr("Ready for your first payment")} />
          )}
          <small className="muted">{tr("Tender totals before refunds.")}</small>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{tr("The favorites, by the numbers")}</h2>
        </div>
        <BestProducts sales={sales} products={data.products} />
      </section>
    </>
  );
}
