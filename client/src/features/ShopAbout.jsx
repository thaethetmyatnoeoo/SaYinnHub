import React from "react";
import {
  ArrowUpRight,
  BookOpen,
  Package,
  ShoppingBag,
  Store,
  Tags,
} from "lucide-react";
import { t as tr } from "../i18n";
import { imageUrl, number } from "../api";

export function ShopAbout({ data, navigate }) {
  const products = data.products || [];
  const categories = [
    ...new Set(products.map((p) => p.category).filter(Boolean)),
  ];
  return (
    <section className="shop-about">
      <div className="shop-about-hero">
        <div className="shop-about-emblem" aria-hidden="true">
          {data.settings.shopLogo ? (
            <img src={imageUrl(data.settings.shopLogo)} alt="" />
          ) : (
            <Store size={48} strokeWidth={1.5} />
          )}
        </div>
        <span className="shop-about-eyebrow">
          {tr("A little shop. A world of possibilities.")}
        </span>
        <h3>{data.settings.storeName}</h3>
        <p>
          {tr(
            "Your collection, your team, your next great sale. All together here.",
          )}
        </p>
      </div>
      <div className="shop-about-stats">
        <div>
          <Package size={20} />
          <strong>{number(products.length)}</strong>
          <span>{tr("Products")}</span>
        </div>
        <div>
          <Tags size={20} />
          <strong>{number(categories.length)}</strong>
          <span>{tr("Categories")}</span>
        </div>
        <div>
          <ShoppingBag size={20} />
          <strong>MMK</strong>
          <span>{tr("Shop currency")}</span>
        </div>
      </div>
      {categories.length > 0 && (
        <div className="shop-about-categories">
          {categories.slice(0, 6).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      <div className="shop-about-links">
        <button type="button" onClick={() => navigate("Point of sale")}>
          <ShoppingBag />
          <span>
            <strong>{tr("Make someone's day")}</strong>
            <small>{tr("Start a sale at your counter")}</small>
          </span>
          <ArrowUpRight />
        </button>
        <button type="button" onClick={() => navigate("Products")}>
          <Package />
          <span>
            <strong>{tr("Explore your collection")}</strong>
            <small>{tr("Find and organize your products")}</small>
          </span>
          <ArrowUpRight />
        </button>
        <button type="button" onClick={() => navigate("User Guide")}>
          <BookOpen />
          <span>
            <strong>{tr("A helping hand")}</strong>
            <small>{tr("Simple guides for your everyday work")}</small>
          </span>
          <ArrowUpRight />
        </button>
      </div>
      <p className="shop-about-footer">
        {tr("Made for your everyday. Powered by Sayinn Hub.")}
      </p>
    </section>
  );
}
