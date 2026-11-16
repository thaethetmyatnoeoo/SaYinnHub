import { t as tr } from "../i18n";
import React, { useState, useEffect, useRef } from "react";
import { Users, Search } from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Empty } from "../components/ui";

export function Customers({ data }) {
  const [q, Q] = useState("");
  const customers = data.customers.filter((c) =>
    (c.name + " " + c.phone).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label={tr("Search customers")}
            placeholder={tr("Find a familiar face or phone number…")}
            value={q}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <span className="muted">
          {customers.length}
          {tr(" familiar faces")}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{tr("Customer")}</th>
              <th>{tr("Phone number")}</th>
              {data.user.role === "OWNER" && (
                <>
                  <th>{tr("Visits")}</th>
                  <th>{tr("Total spend")}</th>
                </>
              )}
              <th>{tr("Notes")}</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => {
              const sales = data.sales.filter((s) => s.customer_id === c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="person">
                      <span
                        className={"avatar customer-avatar color-" + (i % 4)}
                      >
                        {c.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>{c.phone}</td>
                  {data.user.role === "OWNER" && (
                    <>
                      <td>
                        {sales.length}
                        <small>{tr("lovely visits")}</small>
                      </td>
                      <td className="amount">
                        {money(
                          sales.reduce((n, s) => n + s.total - refunded(s), 0),
                        )}
                      </td>
                    </>
                  )}
                  <td>
                    {c.note || (
                      <span className="muted">{tr("No notes yet")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!customers.length && (
        <Empty icon={Users} title={tr("A new connection starts here")}>
          {tr("Add your first customer, or try another search.")}
        </Empty>
      )}
    </section>
  );
}
