import { t as tr } from "../i18n";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Sparkles,
  RotateCcw,
  RotateCw,
  Pause,
  Play,
  MoveUpRight,
  ShoppingBag,
} from "lucide-react";

// Motion is a presentation preference only; no business data is stored here.
export function useSpatialMotion() {
  const [enabled, setEnabled] = useState(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    try {
      return !reduced && localStorage.getItem("sayinn-motion") !== "off";
    } catch {
      return !reduced;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.motion = enabled ? "on" : "off";
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (media.matches) setEnabled(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !window.matchMedia("(pointer: fine)").matches) return;
    let current = null,
      frame = 0;
    const reset = () => {
      if (current) {
        current.style.removeProperty("--tilt-x");
        current.style.removeProperty("--tilt-y");
        current.style.removeProperty("--spot-x");
        current.style.removeProperty("--spot-y");
        current = null;
      }
    };
    const move = (event) => {
      const card = event.target.closest(
        ".stat-card, .product-card, .feature-spotlight, .spatial-hero, .shop-choice",
      );
      if (card !== current) {
        reset();
        current = card;
      }
      cancelAnimationFrame(frame);
      if (!card || card.disabled) return;
      const { clientX, clientY } = event;
      frame = requestAnimationFrame(() => {
        const bounds = card.getBoundingClientRect(),
          x = (clientX - bounds.left) / bounds.width,
          y = (clientY - bounds.top) / bounds.height;
        card.style.setProperty("--tilt-x", `${(0.5 - y) * 6}deg`);
        card.style.setProperty("--tilt-y", `${(x - 0.5) * 7}deg`);
        card.style.setProperty("--spot-x", `${x * 100}%`);
        card.style.setProperty("--spot-y", `${y * 100}%`);
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      reset();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", reset);
    };
  }, [enabled]);
  return [
    enabled,
    () =>
      setEnabled((value) => {
        try {
          localStorage.setItem("sayinn-motion", value ? "off" : "on");
        } catch {}
        return !value;
      }),
  ];
}

export function MotionToggle({ enabled, toggle }) {
  return (
    <button
      className="motion-toggle"
      aria-label={tr("Animated effects")}
      aria-pressed={enabled}
      onClick={toggle}
      title={
        enabled ? tr("Pause animated effects") : tr("Enable animated effects")
      }
    >
      {enabled ? <Sparkles size={15} /> : <Pause size={15} />}
      <span>{enabled ? tr("Motion on") : tr("Motion off")}</span>
      <i />
    </button>
  );
}

export function ProductSculpture({ image, variant = "" }) {
  const kind = image?.includes("lipstick")
    ? "lipstick"
    : image?.includes("mask")
      ? "mask"
      : image?.includes("cream")
        ? "cream"
        : "serum";
  return (
    <span
      className={`sculpture sculpture-${kind} ${variant.toLowerCase().includes("coral") ? "coral-variant" : ""}`}
      aria-hidden="true"
    >
      <span className="sculpture-shadow" />
      <span className="sculpture-object">
        <span className="sculpture-cap" />
        <span className="sculpture-body">
          <span className="sculpture-label">
            <i>{tr("SY.")}</i>
            <b>
              {kind === "serum"
                ? tr("GLOW")
                : kind === "cream"
                  ? tr("CLOUD")
                  : kind === "mask"
                    ? tr("RENEW")
                    : tr("VELVET")}
            </b>
            <small>
              {kind === "serum"
                ? tr("DAILY SERUM")
                : kind === "cream"
                  ? tr("FACE CREAM")
                  : kind === "mask"
                    ? tr("SHEET MASK")
                    : tr("LIP COLOR")}
            </small>
            <em>
              {kind === "serum"
                ? tr("30 ml")
                : kind === "cream"
                  ? tr("50 ml")
                  : kind === "mask"
                    ? "01"
                    : tr("3.5 g")}
            </em>
          </span>
        </span>
        <span className="sculpture-highlight" />
      </span>
      <span className="sculpture-orbit" />
    </span>
  );
}

export function SpatialHero({ go, products, shift }) {
  const [angle, setAngle] = useState(-20),
    [pitch, setPitch] = useState(-9);
  const drag = useRef(null);
  function begin(e) {
    if (
      e.button !== 0 ||
      e.pointerType === "touch" ||
      document.documentElement.dataset.motion === "off"
    )
      return;
    drag.current = { x: e.clientX, y: e.clientY, angle, pitch };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drag.current) return;
    setAngle(
      Math.max(
        -45,
        Math.min(35, drag.current.angle + (e.clientX - drag.current.x) * 0.25),
      ),
    );
    setPitch(
      Math.max(
        -18,
        Math.min(10, drag.current.pitch - (e.clientY - drag.current.y) * 0.2),
      ),
    );
  }
  return (
    <section className="spatial-hero bag-hero">
      <div className="hero-copy">
        <span className="hero-kicker">
          <span />
          {tr(" YOUR BUSINESS, ALL TOGETHER")}
        </span>
        <h2>
          {tr("Your shop.")}
          <br />
          <span>{tr("A world of possibilities.")}</span>
        </h2>
        <p>
          {tr(
            "Make a sale, check your shelves, or switch to your next shop. Everything starts here.",
          )}
        </p>
        <div className="hero-actions">
          <button className="hero-primary" onClick={() => go("Point of sale")}>
            {tr("Go to the counter ")}
            <ArrowUpRight size={18} />
          </button>
          <button className="hero-secondary" onClick={() => go("Products")}>
            {tr("View products ")}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="hero-live">
          <span className="hero-avatar">
            <ShoppingBag size={13} />
          </span>
          <span>
            {products.length}
            {tr(" products")}
          </span>
          <b>•</b>
          <span>{shift ? tr("Shift open") : tr("Ready when you are")}</span>
        </div>
      </div>
      <div className="scene-wrap" aria-hidden="true">
        <div className="scene-aura" />
        <div
          className="spatial-scene"
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onLostPointerCapture={() => (drag.current = null)}
        >
          <div
            className="scene-world"
            style={{
              "--scene-angle": angle + "deg",
              "--scene-pitch": pitch + "deg",
            }}
          >
            <div className="scene-platform">
              <span />
            </div>
            <div className="hero-bag">
              <div className="bag-face bag-front">
                <span className="bag-handle" />
                <span className="bag-logo">
                  <img src="/sayinn-logo.png" alt={tr("")} />
                </span>
                <strong>
                  {tr("SaYinn")}
                  <span>{tr("Hub")}</span>
                </strong>
                <small>{tr("GOOD THINGS INSIDE.")}</small>
                <div className="bag-shine" />
              </div>
              <div className="bag-face bag-back">
                <span className="bag-handle bag-handle-back" />
              </div>
              <div className="bag-face bag-side" />
              <div className="bag-face bag-left" />
              <div className="bag-face bag-bottom" />
            </div>
            <div className="scene-orb orb-coral" />
            <div className="scene-orb orb-peach" />
            <div className="scene-ring" />
            <div className="floating-receipt">
              <span className="receipt-tick">
                <Check size={16} />
              </span>
              <span>{tr("GOOD THINGS ADD UP")}</span>
              <strong>{tr("Sale complete.")}</strong>
              <i />
              <i />
              <div>
                <span>{tr("Made with care")}</span>
                <Check size={12} />
              </div>
            </div>
            <div className="floating-inventory">
              <span>
                <ShoppingBag size={17} />
              </span>
              <div>
                <strong>{tr("All in sync")}</strong>
                <small>{tr("One connected workspace")}</small>
              </div>
              <i />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
