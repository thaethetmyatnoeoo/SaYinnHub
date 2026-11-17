import { t as tr } from "../i18n";
import {
  groupProducts,
  GroupCard,
  variantLabel,
} from "./products/ProductGroups";
import { AddVariants } from "./products/AddVariants";
import { ProductDetails } from "./products/ProductDetails";
import React, { useState, useEffect, useRef } from "react";
import {
  Package,
  History,
  Plus,
  Search,
  SquarePen,
  Wallet,
  TriangleAlert,
} from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Button, Badge, Empty, Field, ProductImage } from "../components/ui";

import { ProductForm } from "./products/ProductForm";
import { CategoryFields } from "./products/CategoryFields";
export function Catalog({
  data,
  modal,
  act,
  notify,
  owner,
  initialCategory = "All products",
}) {
  const [period, SP] = useState(30);
  const [q, Q] = useState(""),
    [category, C] = useState(initialCategory);
  const categories = ["All products", ...data.categories.map((c) => c.name)];
  const products = data.products.filter(
    (p) =>
      (p.name + " " + p.sku).toLowerCase().includes(q.toLowerCase()) &&
      (category === "All products" || p.category === category),
  );
  function edit(p) {
    modal({
      title: "Edit product",
      subtitle: p.name,
      content: ({ close }) => (
        <>
          <ProductForm
            product={p}
            data={data}
            act={act}
            notify={notify}
            close={close}
          />
          {owner && (
            <Button
              onClick={async () => {
                try {
                  await act("/products/" + p.id, { archived: true }, "PATCH");
                  close();
                  notify("Product archived.");
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              {tr("Archive product")}
            </Button>
          )}
        </>
      ),
    });
  }
  async function archived() {
    try {
      const records = await api("/products/archived");
      modal({
        title: "Your archived collection",
        content: ({ close }) => (
          <div>
            {records.length ? (
              records.map((p) => (
                <div className="held-row" key={p.id}>
                  <ProductImage product={p} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </span>
                  <Button
                    onClick={async () => {
                      try {
                        await act(
                          "/products/" + p.id,
                          { archived: false },
                          "PATCH",
                        );
                        close();
                        notify("Welcome back. Product restored.");
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    {tr("Restore")}
                  </Button>
                </div>
              ))
            ) : (
              <Empty icon={Package} title={tr("No archived products")} />
            )}
          </div>
        ),
      });
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <>
      <div className="catalog-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label={tr("Search catalog")}
            placeholder={tr("Find something in your collection…")}
            value={q}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <select
          value={category}
          onChange={(e) => C(e.target.value)}
          aria-label={tr("Filter category")}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "All products" ? tr(c) : c}
            </option>
          ))}
        </select>
        {owner && (
          <Button
            onClick={() =>
              modal({
                title: "Categories",
                content: () => (
                  <CategoryFields
                    data={data}
                    act={act}
                    notify={notify}
                    onSelect={(c) => {
                      C(c);
                      modal(null);
                    }}
                  />
                ),
              })
            }
          >
            {tr("Categories")}
          </Button>
        )}
        {owner && (
          <Button icon={History} onClick={archived}>
            {tr("Archived")}
          </Button>
        )}
      </div>
      <div className="product-activity">
        <label>
          {tr("Sales activity")}{" "}
          <select
            aria-label={tr("Product sales period")}
            value={period}
            onChange={(e) => SP(+e.target.value)}
          >
            <option value="7">{tr("Last 7 days")}</option>
            <option value="30">{tr("Last 30 days")}</option>
          </select>
        </label>
        <span>
          {owner
            ? tr("Completed sales in this period")
            : tr("Your completed sales in this period")}
        </span>
      </div>
      <div className="catalog-grid">
        {groupProducts(data.products)
          .filter((g) => products.some((p) => (p.templateId || p.id) === g.id))
          .map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              extra={
                <small>
                  {data.sales
                    .filter(
                      (s) =>
                        Date.parse(s.created) >= Date.now() - period * 86400000,
                    )
                    .reduce(
                      (sum, s) =>
                        sum +
                        s.lines
                          .filter((l) => g.variants.some((v) => v.id === l.id))
                          .reduce((n, l) => n + l.qty, 0),
                      0,
                    )}{" "}
                  sold · last {period} days
                </small>
              }
              onOpen={() =>
                modal({
                  title: g.name,
                  wide: true,
                  content: ({ close }) => (
                    <ProductDetails
                      group={g}
                      data={data}
                      act={act}
                      notify={notify}
                      close={close}
                      modal={modal}
                      edit={edit}
                    />
                  ),
                })
              }
            />
          ))}
      </div>
      {!products.length && (
        <Empty
          icon={Package}
          title={
            data.products.length
              ? tr("No matching products")
              : tr("Your collection starts here")
          }
        >
          {data.products.length
            ? tr("Try a different search or category.")
            : tr("Add a product with its photo, price and opening stock.")}
          <div className="empty-action">
            <Button
              kind="primary"
              onClick={() =>
                data.products.length
                  ? (Q(""), C("All products"))
                  : modal("product")
              }
            >
              {data.products.length
                ? tr("Clear filters")
                : tr("Create first product")}
            </Button>
          </div>
        </Empty>
      )}
    </>
  );
}

export function Inventory({ data, modal, notify, owner, go }) {
  const [q, Q] = useState(""),
    [filter, F] = useState("all");
  const low = data.products.filter((p) => p.stock <= p.threshold);
  const products = data.products.filter(
    (p) =>
      (p.name + " " + p.sku).toLowerCase().includes(q.toLowerCase()) &&
      (filter === "all" || p.stock <= p.threshold),
  );
  function adjust(p) {
    modal({
      title: "A little shelf maintenance",
      subtitle: p.name + " · " + p.stock + " in stock",
      content: ({ formAction, working }) => (
        <form
          onSubmit={(e) =>
            formAction(e, "/inventory/" + p.id, (d) => ({
              delta: +d.delta,
              reason: d.reason,
            }))
          }
        >
          <Field
            label={tr("Stock change (use a negative number to remove)")}
            name="delta"
            type="number"
            required
          />
          <Field
            label={tr("Reason / delivery reference")}
            name="reason"
            required
            placeholder={tr("e.g. Supplier delivery #1042")}
          />
          <Button kind="primary full" disabled={working}>
            {tr("Update stock")}
          </Button>
        </form>
      ),
    });
  }
  return (
    <>
      <div className="inventory-stats">
        <section className="panel">
          <span>{tr("Total products")}</span>
          <strong>{data.products.length}</strong>
          <Package size={22} />
        </section>
        <section className="panel">
          <span>{owner ? tr("Inventory value") : tr("Units on hand")}</span>
          <strong>
            {owner
              ? money(data.products.reduce((s, p) => s + p.cost * p.stock, 0))
              : number(data.products.reduce((s, p) => s + p.stock, 0))}
          </strong>
          <Wallet size={22} />
        </section>
        <section className="panel">
          <span>{tr("Ready for a restock")}</span>
          <strong>
            {low.length}
            <small>{tr(" products")}</small>
          </strong>
          <TriangleAlert size={22} />
        </section>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={q}
              onChange={(e) => Q(e.target.value)}
              placeholder={tr("Search products or SKU…")}
              aria-label={tr("Search inventory")}
            />
          </div>
          <div className="tab-group">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => F("all")}
            >
              {tr("All stock")}
            </button>
            <button
              className={filter === "low" ? "selected" : ""}
              onClick={() => F("low")}
            >
              {tr("Low stock ")}
              <span className="count">{low.length}</span>
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("Product")}</th>
                <th>{tr("SKU")}</th>
                {owner && <th>{tr("Cost / unit")}</th>}
                <th>{tr("On hand")}</th>
                <th>{tr("Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <ProductImage product={p} />
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.variant}</small>
                      </span>
                    </div>
                  </td>
                  <td className="mono">{p.sku}</td>
                  {owner && <td>{money(p.cost)}</td>}
                  <td>
                    <strong>{p.stock}</strong>
                    <small>
                      {tr("Alert at ")}
                      {p.threshold}
                    </small>
                  </td>
                  <td>
                    <Badge tone={p.stock <= p.threshold ? "amber" : "green"}>
                      {p.stock <= p.threshold
                        ? tr("Running low")
                        : tr("Healthy stock")}
                    </Badge>
                  </td>
                  <td>
                    <div className="stock-actions">
                      <Button icon={Plus} onClick={() => adjust(p)}>
                        {tr("Adjust stock")}
                      </Button>
                      <button
                        className="icon-btn"
                        aria-label={"Stock history for " + p.name}
                        onClick={async () => {
                          try {
                            const history = await api(
                              "/inventory/" + p.id + "/movements",
                            );
                            modal({
                              title: "A little stock history",
                              subtitle: p.name,
                              content: () => (
                                <div>
                                  {history.length ? (
                                    history.map((m) => (
                                      <div className="timeline-item" key={m.id}>
                                        <span className="count">
                                          {m.delta > 0 ? "+" : ""}
                                          {m.delta}
                                        </span>
                                        <div>
                                          <strong>{m.reason}</strong>
                                          <p>
                                            {date(m.created, {
                                              day: "numeric",
                                              month: "short",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </p>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <Empty
                                      icon={History}
                                      title="A fresh shelf"
                                    />
                                  )}
                                </div>
                              ),
                            });
                          } catch (e) {
                            notify(e.message);
                          }
                        }}
                      >
                        <History size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <Empty
            icon={Package}
            title={
              data.products.length
                ? tr("No products match this filter")
                : tr("Stock starts with your products")
            }
          >
            {data.products.length
              ? tr("Clear the filters to see all inventory.")
              : tr("Create your first product to start tracking stock.")}
            <div className="empty-action">
              <Button
                onClick={() =>
                  data.products.length ? (Q(""), F("all")) : go("Products")
                }
              >
                {data.products.length
                  ? tr("Clear filters")
                  : tr("Go to products")}
              </Button>
            </div>
          </Empty>
        )}
      </section>
    </>
  );
}
