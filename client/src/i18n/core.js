import en from "./en.json" with { type: "json" };
import my from "./my.json" with { type: "json" };
let language = "en";
try {
  language = localStorage.getItem("sayinn-language") === "my" ? "my" : "en";
} catch {}
const listeners = new Set();
export const getLanguage = () => language;
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export function setLanguage(value) {
  language = value === "my" ? "my" : "en";
  try {
    localStorage.setItem("sayinn-language", language);
  } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = language;
  listeners.forEach((fn) => fn());
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.keys(my)
  .filter((k) => k.includes("{{"))
  .map((key) => {
    const names = [];
    const parts = key.split(/(\{\{\w+\}\})/g).map((part) => {
      if (part.startsWith("{{")) {
        names.push(part.slice(2, -2));
        return "(.+?)";
      }
      return escape(part);
    });
    return { key, names, re: new RegExp("^" + parts.join("") + "$") };
  });
export function t(key, values = {}) {
  if (typeof key !== "string") return key;
  const resource = language === "my" ? my : en;
  const trimmed = key.trim();
  let text = resource[key] ?? resource[trimmed];
  if (text === undefined && language === "my") {
    const match = patterns
      .map((p) => ({ p, m: trimmed.match(p.re) }))
      .find((v) => v.m);
    if (match) {
      text = my[match.p.key];
      values = {
        ...values,
        ...Object.fromEntries(match.p.names.map((n, i) => [n, match.m[i + 1]])),
      };
    } else if (key.includes("; "))
      return key
        .split("; ")
        .map((k) => t(k))
        .join("; ");
    else if (/^[a-zA-Z0-9_.]+: /.test(key)) {
      const i = key.indexOf(": ");
      return key.slice(0, i) + ": " + t(key.slice(i + 2));
    }
  }
  if (text === undefined) text = key;
  else if (resource[key] === undefined)
    text =
      (key.match(/^\s*/)?.[0] || "") + text + (key.match(/\s*$/)?.[0] || "");
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    String(values[name] ?? ""),
  );
}
if (typeof document !== "undefined") document.documentElement.lang = language;
