import { t as tr, LanguageSwitcher } from "../i18n";
import { ProductSculpture } from "./spatial";
import React, { useState, useEffect, useRef } from "react";
import { ShoppingBag, X } from "lucide-react";
import {
  imageUrl,
  api,
  money,
  number,
  date,
  refunded,
  exportCSV,
} from "../api";

export function Button({
  children,
  icon: Icon,
  kind = "",
  className = "",
  ...props
}) {
  return (
    <button className={`btn ${kind} ${className}`} {...props}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "green" }) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function Empty({
  icon: Icon = ShoppingBag,
  title = "Nothing here yet",
  children,
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children || tr("Your records will appear here as you work.")}</p>
    </div>
  );
}

export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}

export function ProductImage({ product, className = "" }) {
  if (product.image?.startsWith("/api/v1/images/"))
    return (
      <span className={`product-image uploaded-product ${className}`}>
        <img src={imageUrl(product.image)} alt={product.name} loading="lazy" />
      </span>
    );
  return (
    <span
      className={`product-image ${className} model-${product.image?.includes("lipstick") ? "lipstick" : product.image?.includes("mask") ? "mask" : product.image?.includes("cream") ? "cream" : "serum"}`}
    >
      <ProductSculpture image={product.image} variant={product.variant} />
    </span>
  );
}

export function Modal({ title, subtitle, children, close, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    const el = dialog.current;
    const listener = (e) => {
      e.preventDefault();
      close();
    };
    el.addEventListener("cancel", listener);
    return () => el.removeEventListener("cancel", listener);
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={tr(title)}
      className={wide ? "modal wide" : "modal"}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="modal-head">
        <LanguageSwitcher />
        <div>
          <h2>{tr(title)}</h2>
          {subtitle && <p>{tr(subtitle)}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label={tr("Close dialog")}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src="/sayinn-logo.png" alt={tr("SaYinn Hub logo")} />
      </span>
      <span>
        {tr("SaYinn")}
        <span className="brand-light">{tr("Hub")}</span>
        <small>{tr("YOUR BUSINESS. BEAUTIFULLY CONNECTED.")}</small>
      </span>
    </div>
  );
}

export function Receipt({ sale, settings }) {
  const [failedLogo, setFailedLogo] = useState("");
  return (
    <div className="receipt-paper">
      <div className="receipt-store">
        {settings.shopLogo && failedLogo !== settings.shopLogo && (
          <img
            className="receipt-shop-logo"
            onError={() => setFailedLogo(settings.shopLogo)}
            src={imageUrl(settings.shopLogo)}
            alt={settings.storeName + " logo"}
          />
        )}
        <h3>{settings.storeName}</h3>
        <span>{sale.receipt}</span>
        <small>
          {date(sale.created, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
        {sale.cashier && (
          <small>
            {tr("Served by ")}
            {sale.cashier}
          </small>
        )}
      </div>
      <div className="receipt-items">
        {sale.lines.map((l) => (
          <div key={l.id}>
            <span>
              {l.name}
              {l.variant && <small>{l.variant}</small>}
              <small>
                {l.qty} × {money(l.price)}
              </small>
            </span>
            <strong>{money(l.price * l.qty)}</strong>
          </div>
        ))}
      </div>
      <div className="receipt-summary">
        <div>
          <span>{tr("Subtotal")}</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        <div>
          <span>{tr("Discount")}</span>
          <span>− {money(sale.discount)}</span>
        </div>
        <div>
          <span>{tr("Tax")}</span>
          <span>{money(sale.tax)}</span>
        </div>
        <div className="receipt-grand">
          <strong>{tr("Total")}</strong>
          <strong>{money(sale.total)}</strong>
        </div>
        {sale.payments.map((p, i) => (
          <div key={i}>
            <span>{tr(p.method)}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
        <div>
          <span>{tr("Change")}</span>
          <span>{money(sale.change_amount)}</span>
        </div>
        {refunded(sale) > 0 && (
          <div>
            <span>{tr("Refunded")}</span>
            <span>{money(refunded(sale))}</span>
          </div>
        )}
      </div>
      <div className="receipt-thanks">
        {settings.receiptFooter}
        <small className="receipt-watermark">{tr("SaYinn Hub")}</small>
      </div>
    </div>
  );
}
