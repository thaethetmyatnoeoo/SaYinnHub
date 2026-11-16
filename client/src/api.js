import { getLanguage } from "./i18n";
let activeShop = "";
export function setActiveShop(code) {
  activeShop = code || "";
}
export function imageUrl(value, shop = activeShop) {
  if (value?.startsWith("/api/v1/images/"))
    return value.split("?")[0] + "?shop=" + encodeURIComponent(shop || "main");
  return value;
}
export async function api(path, body, method = body ? "POST" : "GET") {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(activeShop &&
      path !== "/workspace" &&
      !path.startsWith("/account/") &&
      !path.startsWith("/auth/")
        ? { "X-Shop-Code": activeShop }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server is unavailable. Please try again.");
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.error?.message || "Something went wrong. Please try again.",
      ),
      { status: response.status },
    );
  return data;
}
export const number = (n) =>
  new Intl.NumberFormat(getLanguage() === "my" ? "my-MM" : "en-US").format(
    n || 0,
  );
export const money = (n) =>
  number(n) + (getLanguage() === "my" ? " ကျပ်" : " Ks");
export const date = (d, options = { month: "short", day: "numeric" }) =>
  new Intl.DateTimeFormat(getLanguage() === "my" ? "my-MM" : "en-GB", {
    timeZone: "Asia/Yangon",
    ...options,
  }).format(new Date(d));
export const refunded = (s) => s.refunds.reduce((sum, r) => sum + r.amount, 0);
export function exportCSV(sales) {
  const rows = [
    [
      "Receipt",
      "Date",
      "Customer",
      "Cashier",
      "Total (MMK)",
      "Refunded (MMK)",
      "Payment",
    ],
    ...sales.map((s) => [
      s.receipt,
      s.created,
      s.customer || "Walk-in",
      s.cashier,
      s.total,
      refunded(s),
      s.payments.map((p) => p.method).join(" + "),
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map(
          (cell) =>
            '"' +
            String(cell)
              .replace(/^[=+@-]/, "'")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "sayinn-sales.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function printReceipt() {
  await document.fonts.ready;
  await Promise.allSettled(
    [...document.querySelectorAll(".receipt-paper img")].map((image) =>
      image.decode(),
    ),
  );
  window.print();
}
