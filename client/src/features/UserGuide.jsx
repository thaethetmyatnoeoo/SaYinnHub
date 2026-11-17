import React, { useState } from "react";
import {
  Search,
  BookOpen,
  ArrowRight,
  Store,
  ShoppingBag,
  Package,
  Tags,
  Boxes,
  Palette,
  ReceiptText,
  Settings,
  Users,
  Compass,
} from "lucide-react";
import { t as tr } from "../i18n";
import { Button, Empty } from "../components/ui";
const sections = [
  ["start", "Getting started", "Point of sale", false, Compass],
  ["shops", "Managing shops", "Overview", true, Store],
  ["categories", "Categories", "Categories", true, Tags],
  ["products", "Products and variants", "Products", false, Package],
  ["stock", "Stock and prices", "Inventory", false, Boxes],
  ["cart", "Colors, sizes and cart", "Point of sale", false, Palette],
  ["sales", "Sales and payments", "Point of sale", false, ShoppingBag],
  ["receipts", "Receipts", "Sales", false, ReceiptText],
  ["settings", "Shop branding and payments", "Settings", true, Settings],
  ["roles", "Roles and permissions", "Team", true, Users],
];
export function UserGuide({ owner = true, go, publicView = false }) {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("owner");
  const [selected, setSelected] = useState("start");
  const [step, setStep] = useState(0);
  const isOwner = publicView ? audience === "owner" : owner;
  const topics = sections
    .filter((s) => isOwner || !s[3])
    .map(([id, title, page, restricted, Icon]) => ({
      id,
      title: tr(title),
      page,
      Icon,
      steps: [1, 2, 3].map((n) =>
        tr(
          id === "products" && n === 2 && !isOwner
            ? "guide.products.cashier"
            : "guide." + id + "." + n,
        ),
      ),
    }));
  const visible = topics.filter((s) =>
    [s.title, ...s.steps]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const current = visible.find((s) => s.id === selected) || visible[0];
  const Icon = current?.Icon || BookOpen;
  return (
    <section
      className="user-guide guide-experience"
      aria-label={tr("User Guide")}
    >
      <div className="guide-welcome">
        <div>
          <span className="eyebrow">{tr("LEARN AT YOUR OWN PACE")}</span>
          <h2>{tr("Your first sale starts here.")}</h2>
          <p>
            {tr(
              "Pick a topic. Follow three simple steps. Make yourself at home.",
            )}
          </p>
        </div>
        <div className="guide-book" aria-hidden="true">
          <BookOpen size={52} strokeWidth={1.4} />
          <span>01 — 03</span>
        </div>
      </div>
      <div className="guide-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label={tr("Search user guide")}
            placeholder={tr("Search user guide")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setStep(0);
            }}
          />
        </div>
        {publicView ? (
          <div
            className="guide-audience"
            role="group"
            aria-label={tr("Choose your guide")}
          >
            {["owner", "cashier"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={audience === value}
                onClick={() => {
                  setAudience(value);
                  setStep(0);
                }}
              >
                {tr(value === "owner" ? "Owner guide" : "Cashier guide")}
              </button>
            ))}
          </div>
        ) : (
          <span className="guide-audience-label">
            {tr(isOwner ? "Owner guide" : "Cashier guide")}
          </span>
        )}
      </div>
      {current ? (
        <div className="guide-learning-layout">
          <nav className="guide-topic-menu" aria-label={tr("Guide topics")}>
            {visible.map((s) => {
              const TopicIcon = s.Icon;
              return (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={current.id === s.id}
                  onClick={() => {
                    setSelected(s.id);
                    setStep(0);
                  }}
                >
                  <TopicIcon size={19} />
                  <span>{s.title}</span>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </nav>
          <article className="guide-lesson" key={current.id}>
            <div className="guide-lesson-heading">
              <span className="guide-lesson-icon">
                <Icon size={30} />
              </span>
              <div>
                <small>{tr("THREE SIMPLE STEPS")}</small>
                <h3>{current.title}</h3>
              </div>
            </div>
            <div
              className="guide-step-selector"
              role="group"
              aria-label={tr("Guide steps")}
            >
              {current.steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={step === i}
                  onClick={() => setStep(i)}
                  aria-label={tr("Step {{number}}", { number: i + 1 })}
                >
                  {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <div className="guide-step-content" aria-live="polite">
              <span>{tr("Step {{number}}", { number: step + 1 })}</span>
              <p>{current.steps[step]}</p>
            </div>
            <div className="guide-lesson-actions">
              <button
                className="btn"
                type="button"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                {tr("Previous")}
              </button>
              {step < 2 ? (
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => setStep(step + 1)}
                >
                  {tr("Next step")}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <Button
                  kind="primary"
                  onClick={() => go(publicView ? "Register" : current.page)}
                >
                  {tr(publicView ? "Create your workspace" : "Open page")}
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </article>
        </div>
      ) : (
        <Empty icon={BookOpen} title={tr("No matching guide sections")} />
      )}
    </section>
  );
}
