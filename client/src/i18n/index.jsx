import React, { useSyncExternalStore, useEffect } from "react";
import { getLanguage, setLanguage, subscribe, t } from "./core.js";
export { getLanguage, setLanguage, t } from "./core.js";
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}
export function LanguageSwitcher() {
  const lang = useLanguage();
  return (
    <label className="language-switch">
      <span>{lang === "my" ? "ဘာသာစကား" : "Language"}</span>
      <select
        aria-label="Language / ဘာသာစကား"
        value={lang}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="en">English</option>
        <option value="my">မြန်မာ</option>
      </select>
    </label>
  );
}
export function LanguageValidation() {
  const language = useLanguage();
  useEffect(() => {
    const clear = (e) => {
      if (typeof e.target.setCustomValidity === "function")
        e.target.setCustomValidity("");
    };
    const invalid = (e) => {
      const el = e.target;
      if (typeof el.setCustomValidity !== "function") return;
      el.setCustomValidity("");
      if (language !== "my") return;
      const v = el.validity;
      el.setCustomValidity(
        t(
          v.valueMissing
            ? "Fill in this field."
            : v.rangeOverflow || v.rangeUnderflow
              ? "Value must be between {{min}} and {{max}}."
              : v.typeMismatch && el.type === "email"
                ? "Invalid email address"
                : "Enter a valid value.",
          { min: el.min || "−∞", max: el.max || "∞" },
        ),
      );
    };
    document
      .querySelectorAll("input,select,textarea")
      .forEach((el) => el.setCustomValidity(""));
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, [language]);
  return null;
}
