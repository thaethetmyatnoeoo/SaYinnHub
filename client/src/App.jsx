import { ShopAbout } from "./features/ShopAbout";
import { usePreference } from "./components/DisplayControls";
import { CategoryFields } from "./features/products/CategoryFields";
import { UserGuide } from "./features/UserGuide";
import { Tags, BookOpen, PanelLeftOpen } from "lucide-react";
import { t as tr, useLanguage, LanguageSwitcher } from "./i18n";
import { imageUrl, printReceipt } from "./api";
import { MotionToggle, useSpatialMotion } from "./components/spatial";
import React, { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  ReceiptText,
  Package,
  Users,
  ChartNoAxesCombined,
  Settings,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  X,
  Bell,
  LogOut,
  SlidersHorizontal,
  Download,
  CalendarDays,
  MoreHorizontal,
  Wallet,
  TriangleAlert,
  Clock,
  Minus,
  Trash2,
  Pause,
  Play,
  Printer,
  CreditCard,
  CheckCircle2,
  Store,
  Menu,
  Command,
  ShieldCheck,
  Sun,
  RefreshCw,
  UserPlus,
  Boxes,
  PanelLeftClose,
} from "lucide-react";
import {
  api,
  setActiveShop,
  money,
  number,
  date,
  refunded,
  exportCSV,
} from "./api";

const navigation = [
  ["Overview", LayoutDashboard],
  ["Point of sale", ShoppingBag],
  ["Sales", ReceiptText],
  ["Products", Package],
  ["Categories", Tags],
  ["Inventory", Boxes],
  ["Reports", ChartNoAxesCombined],
  ["Team", Users],
  ["Activity", History],
  ["Settings", Settings],
  ["User Guide", BookOpen],
];
import {
  Button,
  Badge,
  Empty,
  Field,
  ProductImage,
  Modal,
  Brand,
  Receipt,
} from "./components/ui";
import { Dashboard } from "./features/dashboard";
import { Sales } from "./features/sales";
import { POS } from "./features/pos";
import { Catalog, Inventory } from "./features/catalog";
import { Customers } from "./features/customers";
import { Reports } from "./features/reports";
import { Auth } from "./features/account/Auth";
import { Landing } from "./features/account/Landing";
import { ShopSwitcher } from "./features/account/ShopSwitcher";
import { Profile } from "./features/account/Profile";
import { ShopSettings } from "./features/settings/ShopSettings";
import { FeatureSpotlight } from "./components/FeatureScene";
import { ProductForm } from "./features/products/ProductForm";

export default function App() {
  useLanguage();
  const [sidebarState, setSidebarState] = usePreference(
    "sayinn-sidebar",
    "expanded",
  );
  const collapsed = sidebarState === "collapsed";
  const [catalogCategory, setCatalogCategory] = useState("All products");
  const [motion, toggleMotion] = useSpatialMotion();
  const [status, S] = useState(null),
    [data, D] = useState(null),
    [page, P] = useState(
      decodeURIComponent(location.hash.slice(1)) || "Overview",
    ),
    [error, E] = useState(""),
    [errorStatus, ES] = useState(0),
    [toast, T] = useState(""),
    [modal, M] = useState(null),
    [mobile, SM] = useState(false),
    [loginCode, LC] = useState(""),
    [search, Q] = useState(""),
    [cart, C] = useState([]),
    [receipt, R] = useState(null);
  const routeTrail = useRef([]);
  const currentRoute = useRef(page);
  function rememberRoute(next) {
    if (next !== currentRoute.current) {
      routeTrail.current.push(currentRoute.current);
      routeTrail.current = routeTrail.current.slice(-40);
      currentRoute.current = next;
    }
    P(next);
  }
  function goBack() {
    const permitted = new Set(
      allowed.map(([name]) => name).concat(["Profile", "Customers"]),
    );
    let previous;
    while (routeTrail.current.length) {
      const candidate = routeTrail.current.pop();
      if (candidate !== currentRoute.current && permitted.has(candidate)) {
        previous = candidate;
        break;
      }
    }
    const next = previous || "Overview";
    currentRoute.current = next;
    P(next);
    history.replaceState(null, "", "#" + encodeURIComponent(next));
    Q("");
    SM(false);
  }
  const toastTimer = useRef();
  const notify = (message) => {
    T(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => T(""), 4500);
  };
  async function load() {
    try {
      const workspace = await api("/workspace");
      setActiveShop(workspace.shopCode);
      D(workspace);
      ES(0);
      E("");
    } catch (e) {
      ES(e.status || 0);
      if (e.status === 401) {
        D(null);
        setActiveShop("");
        E("");
        try {
          S(await api("/status"));
        } catch (error) {
          E(error.message);
        }
      } else E(e.message);
    }
  }
  useEffect(() => {
    api("/status")
      .then((s) => {
        S(s);
        if (!s.setup) load();
      })
      .catch((e) => E(e.message));
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    const handler = () =>
      rememberRoute(decodeURIComponent(location.hash.slice(1)) || "Overview");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  function go(p) {
    if (p !== "Products") setCatalogCategory("All products");
    rememberRoute(p);
    location.hash = p;
    Q("");
    SM(false);
  }
  useEffect(() => {
    const shortcut = (e) => {
      if (
        !data ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        go("Point of sale");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [data]);
  async function act(path, body, method) {
    const result = await api(path, body, method);
    await load();
    return result;
  }
  const [working, W] = useState(false);
  async function formAction(e, path, transform = (x) => x, method = "POST") {
    e.preventDefault();
    if (working) return;
    W(true);
    try {
      await act(
        path,
        transform(Object.fromEntries(new FormData(e.currentTarget))),
        method,
      );
      M(null);
      notify("All saved. You’re good to go.");
    } catch (e) {
      notify(e.message);
    } finally {
      W(false);
    }
  }
  useEffect(() => {
    C([]);
    R(null);
    M(null);
  }, [data?.shopCode]);
  async function switched() {
    setActiveShop("");
    C([]);
    R(null);
    Q("");
    M(null);
    SM(false);
    await load();
    go("Overview");
  }
  if (error && errorStatus === 403)
    return (
      <main className="shop-access-recovery">
        <Brand />
        <h2>{tr("Choose an available shop")}</h2>
        <p>{tr(error)}</p>
        {cart.length > 0 && (
          <Button onClick={() => C([])}>
            {tr("Clear unsent cart to switch shops")}
          </Button>
        )}
        <ShopSwitcher
          current={data?.shopCode}
          onSwitch={switched}
          hasCart={cart.length > 0}
        />
      </main>
    );
  if (error)
    return (
      <div className="loading">
        <TriangleAlert />
        <h2>{tr("Unable to connect")}</h2>
        <p>{tr(error)}</p>
        <Button onClick={() => location.reload()}>{tr("Try again")}</Button>
      </div>
    );
  if (!status)
    return (
      <div className="loading">
        <Brand />
        <span className="spinner" />
        <p>{tr("Getting your workspace ready…")}</p>
      </div>
    );
  if (page === "Home") return <Landing go={go} />;
  if (!data)
    return ["Login", "Register"].includes(page) ? (
      <Auth
        key={page}
        status={status}
        register={page === "Register"}
        shopCode={loginCode || status.shopCode || "main"}
        login={(code) => {
          LC(code);
          go("Login");
        }}
        back={() => go("Home")}
        done={async () => {
          await load();
          go("Overview");
        }}
      />
    ) : (
      <Landing go={go} />
    );
  const owner = data.user.role === "OWNER",
    low = data.products.filter((p) => p.stock <= p.threshold),
    allowed = owner
      ? navigation
      : navigation.filter(([p]) =>
          [
            "Point of sale",
            "Sales",
            "Products",
            "Inventory",
            "User Guide",
          ].includes(p),
        );
  const active =
    ["Profile", "Customers"].includes(page) || allowed.some(([p]) => p === page)
      ? page
      : owner
        ? "Overview"
        : "Point of sale";
  const props = { data, go, search, notify, act, modal: M, owner, receipt: R };
  return (
    <div
      className={`app-shell ${collapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}
      data-motion={motion ? "on" : "off"}
    >
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label={tr("Close menu")}
          onClick={() => SM(false)}
        />
      )}
      <aside
        id="workspace-sidebar"
        className={mobile ? "sidebar mobile-open" : "sidebar"}
      >
        <button
          className="icon-btn sidebar-close-mobile"
          aria-label={tr("Close menu")}
          onClick={() => SM(false)}
        >
          <X size={20} />
        </button>
        <div className="sidebar-header">
          <Brand />
          <button
            className="icon-btn sidebar-toggle"
            aria-controls="workspace-sidebar"
            aria-expanded={!collapsed}
            aria-label={tr(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            title={tr(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            onClick={() =>
              setSidebarState(collapsed ? "expanded" : "collapsed")
            }
          >
            {collapsed ? (
              <PanelLeftOpen size={22} />
            ) : (
              <PanelLeftClose size={22} />
            )}
          </button>
        </div>
        <button
          className="store-switch"
          aria-label={tr("Switch shop")}
          onClick={() => M("store")}
        >
          <span className="store-avatar">
            {data.settings.shopLogo ? (
              <img
                src={imageUrl(data.settings.shopLogo, data.shopCode)}
                alt={data.settings.storeName}
              />
            ) : (
              data.settings.storeName?.charAt(0).toUpperCase() || tr("S")
            )}
          </span>
          <span>
            <strong>{data.settings.storeName}</strong>
            <small>
              {owner ? tr("Owner") : tr("Member")} · {data.shopCode}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-caption">{tr("WORKSPACE")}</span>
        <nav>
          {allowed
            .filter(
              ([name]) => !["Team", "Activity", "Settings"].includes(name),
            )
            .map(([name, Icon]) => (
              <button
                className={active === name ? "nav-item active" : "nav-item"}
                aria-current={active === name ? "page" : undefined}
                key={name}
                title={tr(name)}
                aria-label={tr(name)}
                onClick={() => go(name)}
              >
                <Icon size={18} />
                <span className="nav-label">{tr(name)}</span>
                {name === "Inventory" && !!low.length && (
                  <span className="nav-count">{low.length}</span>
                )}
              </button>
            ))}
          {owner && (
            <>
              <span className="nav-caption manage-caption">{tr("MANAGE")}</span>
              {allowed
                .filter(([name]) =>
                  ["Team", "Activity", "Settings"].includes(name),
                )
                .map(([name, Icon]) => (
                  <button
                    className={active === name ? "nav-item active" : "nav-item"}
                    aria-current={active === name ? "page" : undefined}
                    key={name}
                    title={tr(name)}
                    aria-label={tr(name)}
                    onClick={() => go(name)}
                  >
                    <Icon size={18} />
                    <span className="nav-label">{tr(name)}</span>
                  </button>
                ))}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="shift-mini">
            <span className={"status-dot " + (!data.shift ? "off" : "")} />
            <span>
              {data.shift ? tr("Your shift is open") : tr("Ready when you are")}
              <small>
                {data.shift
                  ? tr("Let’s make it a good one.")
                  : tr("Open a shift to start selling.")}
              </small>
            </span>
            <button
              className="icon-btn"
              aria-label={tr("Manage shift")}
              onClick={() => M(data.shift ? "closeShift" : "openShift")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="profile">
            <button
              className="icon-btn"
              aria-label={tr("Edit profile")}
              onClick={() => go("Profile")}
            >
              <Settings size={18} />
            </button>
            <span className="avatar">
              {data.user.image && <img src={data.user.image} alt={tr("")} />}
              {data.user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{data.user.name}</strong>
              <small>{owner ? tr("Shop owner") : tr("Cashier")}</small>
            </span>
            <button
              className="icon-btn"
              aria-label={tr("Sign out")}
              title={tr("Sign out")}
              onClick={async () => {
                try {
                  await api("/auth/logout", {});
                  D(null);
                  C([]);
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label={tr(mobile ? "Close menu" : "Open menu")}
              aria-expanded={mobile}
              aria-controls="workspace-sidebar"
              onClick={() => SM(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>{tr("Workspace")}</span>
            <ChevronRight size={13} />
            <strong>{tr(active)}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            {active !== "Overview" && (
              <MotionToggle enabled={motion} toggle={toggleMotion} />
            )}
            <span className="local-date">
              <CalendarDays size={14} />
              {date(Date.now(), {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="topbar-line" />
            <button
              className="notification icon-btn"
              aria-label={tr("{{count}} low stock alerts", {
                count: low.length,
              })}
              onClick={() => M("notifications")}
            >
              <Bell size={18} />
              {!!low.length && <i />}
            </button>
            <button
              className="avatar tiny"
              aria-label={tr("Edit my profile")}
              onClick={() => go("Profile")}
            >
              {data.user.image && <img src={data.user.image} alt={tr("")} />}
              {data.user.name[0]}
              {data.user.name.split(" ")[1]?.[0]}
            </button>
          </div>
        </header>
        <main
          key={data.shopCode + active}
          className={
            "workspace " + (active === "Point of sale" ? "pos-workspace" : "")
          }
        >
          <div className="page-heading">
            {active !== "Overview" && (
              <button
                type="button"
                className="icon-btn page-back"
                onClick={goBack}
                aria-label={tr("Back")}
                title={tr("Back")}
              >
                <ArrowLeft size={21} />
              </button>
            )}
            <div>
              <div className="eyebrow">
                {active === "Overview"
                  ? tr("YOUR SHOP AT A GLANCE")
                  : active === "Point of sale"
                    ? tr("A LITTLE SERVICE. A LOVELY EXPERIENCE.")
                    : tr("YOUR EVERYDAY WORKSPACE")}
              </div>
              <h1>
                {active === "Overview"
                  ? tr("Welcome, {{name}}", {
                      name: data.user.name.split(" ")[0],
                    })
                  : tr(active)}
                <span className="heading-dot">.</span>
                {active === "Overview" && (
                  <Sun className="greeting-sun" size={26} />
                )}
              </h1>
              <p>
                {tr(
                  {
                    Overview:
                      "Here’s what’s happening at your shop. Let’s make today a good one.",
                    "Point of sale":
                      "Find something lovely. Add it to the cart. Make someone’s day.",
                    Sales: "Every sale, every detail. All in one place.",
                    Products:
                      "A thoughtful collection, ready for your next customer.",
                    Inventory:
                      "Keep your shelves happy and your stock in check.",
                    Customers: "The people who make your shop, your shop.",
                    Reports: "A clearer picture of how your business is doing.",
                    Team: "Good people make a great shop.",
                    Activity: "A little clarity on everything that happens.",
                    Categories: "Organize your products by category.",
                    "User Guide": "Step-by-step help for your everyday work.",
                    Settings:
                      "The little details that make this workspace yours.",
                  }[active],
                )}
              </p>
            </div>
            <div className="heading-actions">
              {["Overview", "Reports", "Sales"].includes(active) && (
                <Button icon={Download} onClick={() => exportCSV(data.sales)}>
                  {tr("Export report")}
                </Button>
              )}
              {active === "Overview" && (
                <Button
                  kind="primary"
                  icon={Plus}
                  onClick={() => go("Point of sale")}
                >
                  {tr("New sale")}
                </Button>
              )}
              {active === "Products" && (
                <Button kind="primary" icon={Plus} onClick={() => M("product")}>
                  {tr("Add product")}
                </Button>
              )}
              {active === "Customers" && (
                <Button
                  kind="primary"
                  icon={UserPlus}
                  onClick={() => M("customer")}
                >
                  {tr("Add customer")}
                </Button>
              )}
              {active === "Team" && (
                <Button kind="primary" icon={Plus} onClick={() => M("team")}>
                  {tr("Add cashier")}
                </Button>
              )}
              {active === "Point of sale" && (
                <Button
                  icon={data.shift ? Clock : Play}
                  onClick={() => M(data.shift ? "closeShift" : "openShift")}
                >
                  {data.shift ? tr("Manage shift") : tr("Open shift")}
                </Button>
              )}
            </div>
          </div>
          <div className="shop-about-entry">
            <button onClick={() => M("demo")}>
              <Store size={16} />
              {tr("About this shop")}
              <ArrowUpRight size={14} />
            </button>
          </div>
          {active !== "Overview" && (
            <FeatureSpotlight page={tr(active)} {...props} />
          )}
          {active === "Profile" && <Profile {...props} />}
          {active === "Overview" && <Dashboard {...props} />}
          {active === "Point of sale" && (
            <POS {...props} cart={cart} setCart={C} />
          )}
          {active === "Sales" && <Sales {...props} />}
          {active === "Products" && (
            <Catalog {...props} initialCategory={catalogCategory} />
          )}
          {active === "Categories" && owner && (
            <section className="categories-page">
              <CategoryFields
                {...props}
                onSelect={(name) => {
                  setCatalogCategory(name);
                  go("Products");
                }}
              />
            </section>
          )}
          {active === "User Guide" && <UserGuide owner={owner} go={go} />}
          {active === "Inventory" && <Inventory {...props} />}
          {active === "Customers" && <Customers {...props} />}
          {active === "Reports" && <Reports {...props} />}
          {active === "Team" && (
            <section className="panel table-panel">
              <div className="panel-heading">
                <h2>
                  {tr("Your people ")}
                  <span className="count">{data.team.length}</span>
                </h2>
                <span className="muted">
                  {tr("Shop code: ")}
                  <strong>{data.shopCode || tr("main")}</strong>
                  {tr(" · Review member requests before approving access.")}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("Team member")}</th>
                      <th>{tr("Username")}</th>
                      <th>{tr("Role")}</th>
                      <th>{tr("Status")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="person">
                            <span className="avatar">{u.name[0]}</span>
                            <strong>{u.name}</strong>
                          </div>
                        </td>
                        <td>
                          {u.username}
                          {u.pending && (
                            <>
                              <small>{u.email}</small>
                              <small>{u.phone}</small>
                            </>
                          )}
                        </td>
                        <td>
                          {u.role === "OWNER" ? tr("Owner") : tr("Cashier")}
                        </td>
                        <td>
                          <Badge tone={u.active ? "green" : "neutral"}>
                            {u.pending
                              ? tr("Pending approval")
                              : u.active
                                ? tr("Active")
                                : u.requestStatus === "rejected"
                                  ? tr("Rejected")
                                  : tr("Disabled")}
                          </Badge>
                        </td>
                        <td>
                          {u.pending && (
                            <Button
                              onClick={async () => {
                                try {
                                  await act(
                                    "/team/" + u.id,
                                    { active: false, decision: "rejected" },
                                    "PATCH",
                                  );
                                  notify("Membership request rejected.");
                                } catch (e) {
                                  notify(e.message);
                                }
                              }}
                            >
                              {tr("Reject request")}
                            </Button>
                          )}
                          {u.role === "CASHIER" && (
                            <Button
                              onClick={async () => {
                                try {
                                  await act(
                                    "/team/" + u.id,
                                    { active: !u.active },
                                    "PATCH",
                                  );
                                  notify("Account access updated.");
                                } catch (e) {
                                  notify(e.message);
                                }
                              }}
                            >
                              {u.pending
                                ? tr("Approve member")
                                : u.active
                                  ? tr("Disable")
                                  : tr("Enable")}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {active === "Activity" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>{tr("Workspace activity")}</h2>
                <Badge tone="neutral">{tr("Latest 100 events")}</Badge>
              </div>
              <div className="timeline">
                {data.audit.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <span className="timeline-icon">
                      <History size={16} />
                    </span>
                    <div>
                      <strong>{tr(a.action)}</strong>
                      <p>
                        {a.actor} <span>·</span> {a.record}
                      </p>
                    </div>
                    <small>
                      {date(a.created, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}
          {active === "Settings" && <ShopSettings {...props} />}
          <footer className="workspace-footer">
            <span>
              {tr("Made for your everyday.")}{" "}
              <span className="footer-brand">{tr("SaYinn Hub")}</span>
            </span>
            <span>
              <span className="status-dot" />
              {tr("Workspace connected ")}
              <span className="footer-sep">·</span>
              {tr(" MMK / Yangon")}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{tr(toast)}</span>
          <button
            className="icon-btn"
            aria-label={tr("Dismiss notification")}
            onClick={() => T("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            typeof modal === "object"
              ? modal.title
              : tr(
                  {
                    product: "A new addition",
                    customer: "Meet your customer",
                    team: "Welcome to the team",
                    openShift: "Let’s open your shift",
                    closeShift: "Wrap up your shift",
                    notifications: "A little heads-up",
                    store: "Your shops",
                    demo: "About this shop",
                  }[modal],
                )
          }
          subtitle={typeof modal === "object" ? modal.subtitle : null}
          wide={modal === "store" || modal === "product" || modal?.wide}
          close={() => M(null)}
        >
          {modal === "product" && (
            <ProductForm
              data={data}
              act={act}
              notify={notify}
              close={() => M(null)}
            />
          )}
          {modal === "customer" && (
            <form onSubmit={(e) => formAction(e, "/customers")}>
              <Field label={tr("Full name")} name="name" required />
              <Field
                label={tr("Phone number")}
                name="phone"
                type="tel"
                required
              />
              <Field label={tr("A little note (optional)")} name="note" />
              <Button kind="primary full" disabled={working}>
                {tr("Add customer")}
              </Button>
            </form>
          )}
          {modal === "team" && (
            <form onSubmit={(e) => formAction(e, "/team")}>
              <Field label={tr("Cashier name")} name="name" required />
              <Field
                label={tr("Username")}
                name="username"
                required
                autoComplete="off"
              />
              <Field
                label={tr("Password (at least 10 characters)")}
                name="password"
                type="password"
                minLength="10"
                required
                autoComplete="new-password"
              />
              <Button kind="primary full" disabled={working}>
                {tr("Create cashier account")}
              </Button>
            </form>
          )}
          {modal === "openShift" && (
            <form
              onSubmit={(e) =>
                formAction(e, "/shifts/open", (d) => ({ opening: +d.opening }))
              }
            >
              <p className="modal-copy">
                {tr("Count the cash in your drawer before your first sale.")}
              </p>
              <Field
                label={tr("Opening cash (MMK)")}
                name="opening"
                type="number"
                min="0"
                defaultValue="50000"
                required
              />
              <Button kind="primary full" disabled={working}>
                {tr("Open shift ")}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {modal === "closeShift" && (
            <form
              onSubmit={(e) =>
                formAction(e, "/shifts/close", (d) => ({
                  ...d,
                  counted: +d.counted,
                }))
              }
            >
              <p className="modal-copy">
                {tr("Opened")}{" "}
                {date(data.shift.opened, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                {tr("with ")}
                {money(data.shift.opening)}
                {tr(
                  ". Count all cash in the drawer; we’ll record any variance.",
                )}
              </p>
              <Field
                label={tr("Counted cash (MMK)")}
                name="counted"
                type="number"
                min="0"
                required
              />
              <Field label={tr("Closing note")} name="note" />
              <Button kind="primary full" disabled={working}>
                {tr("Close shift")}
              </Button>
            </form>
          )}
          {modal === "notifications" && (
            <div className="notification-list">
              {low.length ? (
                low.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      M(null);
                      go("Inventory");
                    }}
                  >
                    <ProductImage product={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.stock}
                        {tr(" left · Time for a restock")}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <Empty icon={CheckCheck} title={tr("All caught up")}>
                  {tr("Your shelves are looking good.")}
                </Empty>
              )}
            </div>
          )}
          {modal === "store" && (
            <ShopSwitcher
              current={data.shopCode}
              onSwitch={switched}
              hasCart={cart.length > 0}
            />
          )}
          {modal === "demo" && (
            <ShopAbout
              data={data}
              navigate={(page) => {
                M(null);
                go(page);
              }}
            />
          )}
          {typeof modal === "object" &&
            modal.content({ close: () => M(null), formAction, working })}
        </Modal>
      )}
      {receipt && (
        <Modal
          title={tr("A lovely sale, all done.")}
          subtitle={receipt.receipt}
          close={() => R(null)}
        >
          <Receipt sale={receipt} settings={data.settings} />
          <div className="receipt-actions">
            <Button icon={Printer} onClick={printReceipt}>
              {tr("Print receipt")}
            </Button>
            <Button kind="primary" onClick={() => R(null)}>
              {tr("Done ")}
              <Check size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
