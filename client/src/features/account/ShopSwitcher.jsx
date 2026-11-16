import { t as tr } from "../../i18n";
import React, { useEffect, useState } from "react";
import { Store, Plus, ArrowRight, Check, RefreshCw } from "lucide-react";
import { api } from "../../api";
import { Button, Field } from "../../components/ui";

export function ShopSwitcher({ current, onSwitch, hasCart = false }) {
  const [shops, S] = useState([]),
    [mode, M] = useState("list"),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [message, T] = useState(""),
    [home, H] = useState("");
  async function refresh() {
    try {
      const result = await api("/account/shops");
      S(result.shops);
      H(result.homeCode);
      E("");
    } catch (e) {
      E(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);
  async function choose(code) {
    if (hasCart) {
      E("Hold or clear your current sale before switching shops.");
      return;
    }
    B(true);
    E("");
    try {
      await api("/account/shops/switch", { shopCode: code });
      await onSwitch();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    B(true);
    E("");
    T("");
    try {
      const d = Object.fromEntries(new FormData(e.currentTarget));
      await api(
        mode === "create" ? "/account/shops" : "/account/shops/join",
        d,
      );
      T(
        mode === "create"
          ? "Your new shop is ready. Select it below to start."
          : "Request sent. The shop owner can approve you in Team.",
      );
      M("list");
      await refresh();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <div className="shop-hub">
      <div className="shop-hub-intro">
        <span className="shop-hub-orb">
          <Store size={28} />
        </span>
        <div>
          <h3>{tr("One account. All your shops.")}</h3>
          <p>{tr("Own a shop here, join a team there.")}</p>
        </div>
      </div>
      <p className="shop-account-note">
        {tr("Your account’s sign-in code: ")}
        <strong>{home}</strong>
        {tr(". Your password stays the same across shops.")}
      </p>
      <div className="shop-hub-actions">
        <Button
          kind={mode === "create" ? "primary" : ""}
          onClick={() => M(mode === "create" ? "list" : "create")}
          disabled={busy}
        >
          <Plus size={16} />
          {tr(" Create a shop")}
        </Button>
        <Button
          kind={mode === "join" ? "primary" : ""}
          onClick={() => M(mode === "join" ? "list" : "join")}
          disabled={busy}
        >
          {tr("Join another shop ")}
          <ArrowRight size={16} />
        </Button>
        <Button
          aria-label={tr("Refresh shop memberships")}
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {mode !== "list" && (
        <form className="shop-hub-form" onSubmit={submit}>
          <h3>
            {mode === "create"
              ? tr("Make room for your next shop")
              : tr("Work with another shop")}
          </h3>
          {mode === "create" && (
            <Field
              label={tr("New shop name")}
              name="storeName"
              maxLength={150}
              required
            />
          )}
          {mode === "join" && (
            <Field
              label={tr("Shop code to join")}
              name="shopCode"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={40}
              required
            />
          )}
          <p>
            {mode === "create"
              ? tr(
                  "You’ll be the owner. Products, sales and stock start fresh.",
                )
              : tr(
                  "Joining grants member access only after that shop’s owner approves you.",
                )}
          </p>
          <Button kind="primary" disabled={busy}>
            {busy
              ? tr("Please wait…")
              : mode === "create"
                ? tr("Create shop")
                : tr("Send join request")}
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="info-callout">
          {tr(message)}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      <div className="shop-list">
        {shops.map((shop) => (
          <button
            className={
              "shop-choice" + (current === shop.code ? " selected" : "")
            }
            key={shop.code}
            disabled={busy || !shop.active}
            onClick={() => choose(shop.code)}
          >
            <span className="shop-choice-icon">
              {shop.name.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{shop.name}</strong>
              <small>
                {shop.code} ·{" "}
                {shop.role === "OWNER" ? tr("Owner") : tr("Member")}
              </small>
              <small>
                {shop.pending
                  ? tr("Awaiting owner approval")
                  : shop.status === "rejected"
                    ? tr("Rejected by owner")
                    : !shop.active
                      ? tr("Access disabled")
                      : current === shop.code
                        ? tr("Current shop")
                        : tr("Switch to this shop")}
              </small>
            </span>
            {current === shop.code ? (
              <Check size={20} />
            ) : (
              <ArrowRight size={20} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
