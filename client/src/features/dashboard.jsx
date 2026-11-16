import { t as tr } from "../i18n";
import { SpatialHero } from "../components/spatial";
import React, { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  ReceiptText,
  Package,
  ChartNoAxesCombined,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Check,
  CalendarDays,
  Wallet,
  Clock,
} from "lucide-react";
import { api, money, number, date, refunded, exportCSV } from "../api";
import { Button, ProductImage, Receipt } from "../components/ui";
import { SalesTable } from "./sales";

export function Dashboard({ data, go, modal, owner }) {
  const [period, SP] = useState(7);
  const start = Date.now() - period * 86400000;
  const sales = data.sales.filter(
      (s) => new Date(s.created).getTime() >= start,
    ),
    net = sales.reduce((a, s) => a + s.total - refunded(s), 0),
    units = sales.reduce(
      (a, s) => a + s.lines.reduce((n, l) => n + l.qty, 0),
      0,
    ),
    low = data.products.filter((p) => p.stock <= p.threshold);
  const previous = data.sales.filter(
      (s) =>
        new Date(s.created).getTime() < start &&
        new Date(s.created).getTime() >= start - period * 86400000,
    ),
    prior = previous.reduce((a, s) => a + s.total - refunded(s), 0);
  const change = prior ? Math.round(((net - prior) / prior) * 100) : null;
  const stats = [
    ["Total revenue", money(net), Wallet, "coral", change],
    ["Sales completed", number(sales.length), ShoppingBag, "blue", null],
    [
      "Average sale",
      money(sales.length ? Math.round(net / sales.length) : 0),
      ChartNoAxesCombined,
      "purple",
      null,
    ],
    ["Items sold", number(units), Package, "green", null],
  ];
  return (
    <>
      <SpatialHero go={go} products={data.products} shift={data.shift} />
      <div className="overview-toolbar">
        <div className="tab-group">
          <button
            className={period === 7 ? "selected" : ""}
            onClick={() => SP(7)}
          >
            {tr("Last 7 days")}
          </button>
          <button
            className={period === 30 ? "selected" : ""}
            onClick={() => SP(30)}
          >
            {tr("Last 30 days")}
          </button>
        </div>
      </div>
      <div className="stats-grid">
        {stats.map(([label, value, Icon, tone, change], i) => (
          <section className={`stat-card stat-${tone}`} key={tr(label)}>
            <div className="stat-top">
              <span>{tr(label)}</span>
              <span className={"stat-icon " + tone}>
                <Icon size={18} />
              </span>
            </div>
            <strong>{value}</strong>
            <div className="stat-foot">
              {change !== null ? (
                <>
                  <span className={change >= 0 ? "trend up" : "trend down"}>
                    {change >= 0 ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}{" "}
                    {Math.abs(change)}%
                  </span>
                  <span>{tr("vs previous period")}</span>
                </>
              ) : (
                <>
                  <span className="tiny-line" />
                  <span>
                    {i === 1
                      ? tr("Every little sale counts")
                      : i === 2
                        ? tr("A little more in every basket")
                        : i === 3
                          ? tr("From your shelf to their day")
                          : tr("Your sales, less refunds")}
                  </span>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr("Sales overview")}</h2>
              <p>{tr("A little progress, every day.")}</p>
            </div>
            <span className="chart-legend">
              <i />
              {tr("Revenue ")}
              <small>{tr("MMK")}</small>
            </span>
          </div>
          <SalesChart sales={sales} period={period} />
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr("Needs a little attention")}</h2>
              <p>{tr("Small things. Worth a look.")}</p>
            </div>
            <span className="attention-dot" />
          </div>
          <button className="attention-row" onClick={() => go("Inventory")}>
            <span className="attention-icon amber">
              <Package size={19} />
            </span>
            <span>
              <strong>{tr("Running a little low")}</strong>
              <small>
                {low.length}
                {tr(" products need a restock")}
              </small>
            </span>
            <span className="attention-number">{low.length}</span>
            <ChevronRight size={15} />
          </button>
          <button
            className="attention-row"
            onClick={() => modal(data.shift ? "closeShift" : "openShift")}
          >
            <span className="attention-icon blue">
              <Clock size={19} />
            </span>
            <span>
              <strong>
                {data.shift
                  ? tr("Shift in progress")
                  : tr("Your counter is waiting")}
              </strong>
              <small>
                {data.shift
                  ? tr("Review your register session")
                  : tr("Open a shift to start selling")}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button className="attention-row" onClick={() => go("Sales")}>
            <span className="attention-icon green">
              <ReceiptText size={19} />
            </span>
            <span>
              <strong>{tr("Your latest sales")}</strong>
              <small>
                {sales.length}
                {tr(" receipts in this period")}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
          <div className="attention-note">
            <span>{tr("Keep the good days going.")}</span>
            <p>{tr("A quick check now. A smoother day ahead.")}</p>
            <span className="note-flower">✳</span>
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr("Recent sales")}</h2>
              <p>{tr("Fresh from your counter.")}</p>
            </div>
            <button className="text-btn" onClick={() => go("Sales")}>
              {tr("View all sales ")}
              <ArrowRight size={14} />
            </button>
          </div>
          <SalesTable
            sales={data.sales.slice(0, 5)}
            onSelect={(s) =>
              modal({
                title: s.receipt,
                subtitle: "Sale details",
                content: ({ close }) => (
                  <>
                    <Receipt sale={s} settings={data.settings} />
                    <Button kind="primary full" onClick={close}>
                      {tr("All good")} <Check size={16} />
                    </Button>
                  </>
                ),
              })
            }
            compact
          />
        </section>
        <section className="panel best-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr("Shop favorites")}</h2>
              <p>{tr("The ones they keep coming back for.")}</p>
            </div>
            <span className="soft-icon">
              <ShoppingBag size={16} />
            </span>
          </div>
          <BestProducts products={data.products} sales={sales} />
          <button className="best-link" onClick={() => go("Products")}>
            {tr("Explore your collection ")}
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <div className="daily-note">
        <span className="daily-icon">✦</span>
        <div>
          <strong>
            {tr("A little more clarity. A little more possibility.")}
          </strong>
          <p>
            {tr(
              "Your next good day starts with knowing your shop a little better.",
            )}
          </p>
        </div>
        <Button onClick={() => go("Reports")}>
          {tr("See your reports ")}
          <ArrowUpRight size={15} />
        </Button>
      </div>
    </>
  );
}

export function SalesChart({ sales, period = 7 }) {
  const [hover, H] = useState(null);
  const [selected, selectDay] = useState(null);
  const [cursor, setCursor] = useState(null);
  const days = Array.from({ length: period }, (_, i) => {
    const d = new Date(Date.now() - (period - 1 - i) * 86400000);
    const key = date(d, { day: "numeric", month: "numeric", year: "numeric" });
    return {
      fullDate: date(d, { day: "numeric", month: "long", year: "numeric" }),
      label: date(
        d,
        period === 7
          ? { weekday: "short" }
          : { day: "numeric", month: "short" },
      ),
      value: sales
        .filter(
          (s) =>
            date(s.created, {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            }) === key,
        )
        .reduce((a, s) => a + s.total - refunded(s), 0),
    };
  });
  const high = Math.max(...days.map((d) => d.value), 10000) * 1.2,
    points = days.map((d, i) => [
      48 + i * (660 / (period - 1)),
      192 - (d.value / high) * 155,
    ]);
  const path = points.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  const active = Math.min(hover ?? selected ?? -1, days.length - 1);
  function dayAtPointer(event) {
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return 0;
    const { x, y } = point.matrixTransform(matrix.inverse());
    setCursor({ x, y });
    return Math.max(
      0,
      Math.min(period - 1, Math.round(((x - 48) / 660) * (period - 1))),
    );
  }
  return (
    <div className="sales-chart">
      <div className="chart-selection" aria-live="polite" aria-atomic="true">
        {active >= 0 ? (
          <>
            <span>{days[active].fullDate}</span>
            <strong>{money(days[active].value)}</strong>
          </>
        ) : (
          <span>
            {tr("Move your cursor anywhere on the chart to see daily sales.")}
          </span>
        )}
      </div>
      <svg
        viewBox="0 0 740 240"
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={period}
        aria-valuenow={active >= 0 ? active + 1 : 1}
        aria-valuetext={`${days[Math.max(active, 0)].fullDate}: ${money(days[Math.max(active, 0)].value)}`}
        onPointerMove={(event) => {
          if (event.pointerType !== "touch") H(dayAtPointer(event));
        }}
        onPointerLeave={() => {
          H(null);
          setCursor(null);
        }}
        onClick={(event) => {
          selectDay(dayAtPointer(event));
          H(null);
        }}
        onKeyDown={(event) => {
          let next = Math.max(active, 0);
          if (event.key === "ArrowRight" || event.key === "ArrowUp") next++;
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
            next--;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = period - 1;
          else return;
          event.preventDefault();
          H(null);
          setCursor(null);
          selectDay(Math.max(0, Math.min(period - 1, next)));
        }}
        aria-label={
          "Daily sales: " +
          days.map((d) => d.label + " " + money(d.value)).join(", ")
        }
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97360" stopOpacity=".24" />
            <stop offset="100%" stopColor="#f97360" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const y = 36 + i * 39;
          return (
            <g key={i}>
              <text x="0" y={y + 4} className="chart-axis">
                {number(Math.round((high * (4 - i)) / 4 / 1000))}
                {tr("k")}
              </text>
              <line x1="48" x2="710" y1={y} y2={y} className="grid-line" />
            </g>
          );
        })}
        <path d={`${path} L708 192 L48 192 Z`} fill="url(#revenue-fill)" />
        <path
          d={path}
          fill="none"
          stroke="#f97360"
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map(([x, y], i) => (
          <g key={i} pointerEvents="none">
            <rect
              x={x - 660 / period / 2}
              y="25"
              width={660 / period}
              height="180"
              fill="transparent"
            />
            {active === i && (
              <line
                x1={cursor?.x ?? x}
                x2={cursor?.x ?? x}
                y1="25"
                y2="192"
                stroke="#f97360"
                strokeDasharray="4 4"
              />
            )}
            {(period === 7 || active === i) && (
              <circle
                cx={x}
                cy={y}
                r={active === i ? 5 : 3.5}
                fill="white"
                stroke="#f97360"
                strokeWidth="2"
              />
            )}
            {(period === 7 || i % 5 === 0) && (
              <text x={x} y="225" textAnchor="middle" className="chart-axis">
                {days[i].label}
              </text>
            )}
            {active === i && (
              <g>
                <rect
                  x={Math.max(4, Math.min((cursor?.x ?? x) + 12, 564))}
                  y={Math.max(4, Math.min((cursor?.y ?? y) - 62, 182))}
                  width="172"
                  height="54"
                  rx="6"
                  fill="#431c16"
                />
                <text
                  x={Math.max(4, Math.min((cursor?.x ?? x) + 12, 564)) + 86}
                  y={Math.max(4, Math.min((cursor?.y ?? y) - 62, 182)) + 21}
                  textAnchor="middle"
                  fill="white"
                  fontSize="13"
                >
                  {days[i].fullDate}
                </text>
                <text
                  x={Math.max(4, Math.min((cursor?.x ?? x) + 12, 564)) + 86}
                  y={Math.max(4, Math.min((cursor?.y ?? y) - 62, 182)) + 41}
                  textAnchor="middle"
                  fill="#fff7ed"
                  fontSize="14"
                  fontWeight="600"
                >
                  {money(days[i].value)}
                </text>
              </g>
            )}
          </g>
        ))}
        <rect
          x="0"
          y="0"
          width="740"
          height="240"
          fill="transparent"
          pointerEvents="all"
          aria-hidden="true"
        />
      </svg>
    </div>
  );
}

export function BestProducts({ products, sales }) {
  const best = products
    .map((p) => ({
      ...p,
      qty: sales.reduce(
        (n, s) =>
          n +
          s.lines.filter((l) => l.id === p.id).reduce((a, l) => a + l.qty, 0),
        0,
      ),
    }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4);
  return (
    <div className="best-products">
      {best.map((p, i) => (
        <div className="best-product" key={p.id}>
          <span className="rank">{String(i + 1).padStart(2, "0")}</span>
          <ProductImage product={p} />
          <span>
            <strong>{p.name}</strong>
            <small>{p.category}</small>
          </span>
          <span className="sold-count">
            <strong>{p.qty}</strong>
            <small>{tr("sold")}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
