import { t as tr } from "../i18n";
import React, { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Package,
  ShoppingBag,
  CreditCard,
  Users,
  ShieldCheck,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

function Block({ className = "", children, style }) {
  return (
    <div className={"solid-block " + className} style={style}>
      <div className="solid-front">{children}</div>
      <div className="solid-side" />
      <div className="solid-top" />
    </div>
  );
}

export function DimensionalArt({ variant = "store", large = false }) {
  return (
    <div
      className={"dimensional-art art-" + variant + (large ? " art-large" : "")}
      aria-hidden="true"
    >
      <div className="art-ambient" />
      <div className="art-orbit" />
      <div className="art-orbit orbit-back" />
      <div className="mini-world">
        <div className="display-plinth">
          <span />
        </div>
        {(variant === "store" || variant === "settings") && (
          <>
            <Block className="mini-store">
              <div className="store-sign">
                {tr("SaYinn")}
                <span>{tr("Hub")}</span>
              </div>
              <div className="store-window">
                <i />
                <i />
              </div>
              <div className="store-door">
                <i />
              </div>
            </Block>
            <div className="store-awning">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <Block className="store-roof" />
            <Block className="store-parcel">
              <Package size={28} />
            </Block>
            <span className="store-plant">
              <i />
              <i />
              <b />
            </span>
            <div className="floating-token token-one">
              <ShoppingBag size={22} />
            </div>
          </>
        )}
        {variant === "terminal" && (
          <>
            <Block className="terminal-base" />
            <Block className="terminal-neck" />
            <Block className="terminal-screen">
              <div className="terminal-display">
                <Check size={22} />
                <i />
                <i />
                <span>{tr("READY")}</span>
              </div>
            </Block>
            <Block className="payment-card">
              <CreditCard size={25} />
              <span>••••</span>
            </Block>
            <div className="terminal-ticket">
              <i />
              <i />
              <i />
            </div>
          </>
        )}
        {variant === "stock" && (
          <>
            <Block className="stock-box box-one">
              <Package size={36} />
              <span>01</span>
            </Block>
            <Block className="stock-box box-two">
              <Package size={32} />
              <span>02</span>
            </Block>
            <Block className="stock-box box-three">
              <ShoppingBag size={30} />
              <span>03</span>
            </Block>
            <div className="floating-token token-two">
              <Check size={24} />
            </div>
          </>
        )}
        {variant === "chart" && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Block key={i} className={"chart-column column-" + i}>
                <span />
              </Block>
            ))}
            <div className="chart-trend">
              <ArrowUpRight size={65} />
            </div>
            <div className="chart-grid" />
          </>
        )}
        {(variant === "receipt" || variant === "activity") && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className={"paper-layer paper-" + i}>
                <span className="paper-check">
                  <Check size={18} />
                </span>
                <i />
                <i />
                <b />
                <div className="paper-barcode" />
              </div>
            ))}
            <div className="floating-token token-two">
              {variant === "activity" ? (
                <ShieldCheck size={26} />
              ) : (
                <ShoppingBag size={24} />
              )}
            </div>
          </>
        )}
        {variant === "people" && (
          <>
            {[0, 1, 2].map((i) => (
              <div className={"person-model person-" + i} key={i}>
                <span className="person-head" />
                <span className="person-body" />
                <span className="person-base" />
              </div>
            ))}
            <div className="floating-token token-one">
              <Users size={23} />
            </div>
          </>
        )}
        <span className="art-spark sparkle-a">✦</span>
        <span className="art-spark sparkle-b">✧</span>
      </div>
    </div>
  );
}

export function FeatureSpotlight({ page, data, go, modal }) {
  const [expanded, E] = useState(true);
  const low = data.products.filter((p) => p.stock <= p.threshold).length;
  const guides = {
    "Point of sale": {
      art: "terminal",
      title: data.shift
        ? tr("Your counter is open.")
        : tr("Ready for your first sale?"),
      copy: data.shift
        ? tr(
            "Search or scan a product, add a customer, then choose a payment method.",
          )
        : tr(
            "Open a shift, add products to the basket, and take your first payment.",
          ),
      metric: data.shift ? tr("Shift open") : tr("Shift closed"),
      action: data.shift ? tr("Browse products") : tr("Open shift"),
      run: () => (data.shift ? go("Products") : modal("openShift")),
    },
    Products: {
      art: "stock",
      title: tr("Build a collection that stands out."),
      copy: tr(
        "Add photos, organize categories, and tailor the details for every product.",
      ),
      metric: tr("{{count}} products", { count: data.products.length }),
      action: tr("Create a product"),
      run: () => modal("product"),
    },
    Inventory: {
      art: "stock",
      title: low
        ? tr("{{count}} products need a restock.", { count: low })
        : tr("A clear view of every shelf."),
      copy: tr(
        "Choose a product below to receive stock or make a counted adjustment.",
      ),
      metric: tr("{{count}} units on hand", {
        count: data.products.reduce((n, p) => n + p.stock, 0),
      }),
      action: tr("Manage products"),
      run: () => go("Products"),
    },
    Sales: {
      art: "receipt",
      title: tr("Find the details behind every sale."),
      copy: tr(
        "Search a receipt or customer. Select a receipt to view its details and print it.",
      ),
      metric: tr("{{count}} recent receipts", { count: data.sales.length }),
      action: tr("Start a sale"),
      run: () => go("Point of sale"),
    },
    Reports: {
      art: "chart",
      title: tr("Turn everyday sales into a clearer picture."),
      copy: tr(
        "Compare revenue, payment methods, and product performance. Export the records when you need them.",
      ),
      metric: tr("Shop insights"),
      action: tr("Explore sales"),
      run: () => go("Sales"),
    },
    Team: {
      art: "people",
      title: tr("Good work starts with the right team."),
      copy: tr(
        "Approve member requests and manage cashier access for this shop only.",
      ),
      metric: tr("{{count}} pending requests", {
        count: data.team.filter((u) => u.pending).length,
      }),
      action: tr("Add a cashier"),
      run: () => modal("team"),
    },
    Customers: {
      art: "people",
      title: tr("Remember the people behind each sale."),
      copy: tr(
        "Find a customer or save a new contact, then attach them at the counter.",
      ),
      metric: tr("{{count}} customers", { count: data.customers.length }),
      action: tr("Add a customer"),
      run: () => modal("customer"),
    },
    Activity: {
      art: "activity",
      title: tr("Every change leaves a clear trail."),
      copy: tr(
        "Review stock adjustments, sales, returns and settings updates, with the person and time recorded.",
      ),
      metric: tr("{{count}} recent events", { count: data.audit.length }),
      action: tr("View reports"),
      run: () => go("Reports"),
    },
    Settings: {
      art: "settings",
      title: tr("Make every receipt feel like your shop."),
      copy: tr(
        "Update the shop name, upload your logo, and personalize the receipt footer below.",
      ),
      metric: data.shopCode,
      action: tr("Manage your shops"),
      run: () => modal("store"),
    },
    Profile: {
      art: "people",
      title: tr("One profile. Everywhere you work."),
      copy: tr(
        "Your name, photo and password follow your account across all your shops.",
      ),
      metric: tr("Your account"),
      action: tr("See your shops"),
      run: () => modal("store"),
    },
  };
  const guide = guides[page];
  if (!guide) return null;
  if (!expanded)
    return (
      <button className="guide-restore" onClick={() => E(true)}>
        <Sparkles size={15} />
        {tr(" Show page guide ")}
        <ChevronDown size={15} />
      </button>
    );
  return (
    <section
      className={
        "feature-spotlight" +
        (page === "Point of sale" ? " compact-spotlight" : "")
      }
      aria-label={page + " guide"}
    >
      <div className="feature-guide-copy">
        <span className="feature-metric">
          <i />
          {guide.metric}
        </span>
        <h2>{guide.title}</h2>
        <p>{guide.copy}</p>
        <button className="feature-action" onClick={guide.run}>
          {guide.action}
          <ArrowUpRight size={17} />
        </button>
      </div>
      <DimensionalArt variant={guide.art} />
      <button
        className="guide-collapse"
        aria-label={tr("Hide page guide")}
        title={tr("Hide page guide")}
        onClick={() => E(false)}
      >
        <ChevronUp size={18} />
      </button>
    </section>
  );
}
