import React, { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { t as tr } from "../i18n";
import { Button, Empty } from "../components/ui";
const sections = [
  ["start", "Getting started", "Point of sale", false],
  ["shops", "Managing shops", "Overview", true],
  ["categories", "Categories", "Categories", true],
  ["products", "Products and variants", "Products", false],
  ["stock", "Stock and prices", "Inventory", false],
  ["cart", "Colors, sizes and cart", "Point of sale", false],
  ["sales", "Sales and payments", "Point of sale", false],
  ["receipts", "Receipts", "Sales", false],
  ["settings", "Shop branding and payments", "Settings", true],
  ["roles", "Roles and permissions", "Team", true],
];
export function UserGuide({ owner, go }) {
  const [query, setQuery] = useState("");
  const topics = sections
    .filter((s) => owner || !s[3])
    .map(([id, title, page]) => ({
      id,
      title: tr(title),
      page,
      steps: [1, 2, 3].map((n) =>
        tr(
          id === "products" && n === 2 && !owner
            ? "guide.products.cashier"
            : `guide.${id}.${n}`,
        ),
      ),
    }));
  const visible = topics.filter((s) =>
    [s.title, ...s.steps]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section className="user-guide">
      <p>{tr(owner ? "Owner guide" : "Cashier guide")}</p>
      <div className="search-box">
        <Search size={18} />
        <input
          aria-label={tr("Search user guide")}
          placeholder={tr("Search user guide")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav className="guide-topics" aria-label={tr("Guide topics")}>
        {visible.map((s) => (
          <a
            key={s.id}
            href={`#guide-${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(`guide-${s.id}`)
                ?.scrollIntoView({ block: "start" });
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>
      <div className="guide-grid">
        {visible.map((s) => (
          <article className="panel guide-card" id={`guide-${s.id}`} key={s.id}>
            <h2>{s.title}</h2>
            <ol>
              {s.steps.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ol>
            <Button onClick={() => go(s.page)}>{tr("Open page")}</Button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <Empty icon={BookOpen} title={tr("No matching guide sections")} />
      )}
    </section>
  );
}
