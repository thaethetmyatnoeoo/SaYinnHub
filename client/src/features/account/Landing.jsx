import { t as tr, LanguageSwitcher } from "../../i18n";
import React from "react";
import { Brand, Button } from "../../components/ui";
import {
  ShoppingBag,
  Boxes,
  ChartNoAxesCombined,
  Users,
  ArrowUpRight,
} from "lucide-react";
export function Landing({ go }) {
  return (
    <main className="landing">
      <header>
        <Brand />
        <nav aria-label={tr("Public navigation")}>
          <LanguageSwitcher />
          <a href="#Login" onClick={() => go("Login")}>
            {tr("Login")}
          </a>
          <a
            className="btn primary"
            href="#Register"
            onClick={() => go("Register")}
          >
            {tr("Register")}
          </a>
        </nav>
      </header>
      <section className="landing-hero">
        <div>
          <span className="eyebrow">
            {tr("SAYINN HUB · YOUR RETAIL WORKSPACE")}
          </span>
          <h1>
            {tr("A clearer day.")}
            <br />
            {tr("A happier shop.")}
          </h1>
          <p>
            {tr(
              "Bring your counter, products, stock, and customers together. Spend less time on paperwork and more time growing your business.",
            )}
          </p>
          <Button kind="primary" onClick={() => go("Register")}>
            {tr("Start your workspace ")}
            <ArrowUpRight size={19} />
          </Button>
          <a href="#Login" onClick={() => go("Login")}>
            {tr("Already have an account? Login")}
          </a>
        </div>
        <div className="landing-art" aria-hidden="true">
          <img src="/sayinn-logo.png" alt={tr("")} />
          <span>{tr("SaYinn Hub")}</span>
          <small>{tr("Made for your everyday.")}</small>
        </div>
      </section>
      <section className="landing-features" aria-label={tr("POS features")}>
        {[
          [
            ShoppingBag,
            "A connected counter",
            "Create sales, split payments, manage shifts, and print branded receipts.",
          ],
          [
            Boxes,
            "Your inventory, organized",
            "Track stock, upload product photos, and customize reusable forms for each product.",
          ],
          [
            ChartNoAxesCombined,
            "Clarity in every sale",
            "Explore daily revenue and product activity with interactive reports.",
          ],
          [
            Users,
            "A workspace for your team",
            "Give cashiers the tools they need while protecting owner-only settings.",
          ],
        ].map(([Icon, title, copy]) => (
          <article className="panel" key={title}>
            <Icon size={28} />
            <h2>{tr(title)}</h2>
            <p>{tr(copy)}</p>
          </article>
        ))}
      </section>
      <footer>{tr("SaYinn Hub · Built for local retail.")}</footer>
    </main>
  );
}
