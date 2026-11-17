import { Languages } from "lucide-react";
import React, { useSyncExternalStore, useEffect } from "react";
import { getLanguage, setLanguage, subscribe, t } from "./core.js";
export { getLanguage, setLanguage, t } from "./core.js";
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}
export function LanguageSwitcher() {
  const lang = useLanguage();
  return (
    <div
      className="language-switch preference-control"
      role="group"
      aria-label="Language / ဘာသာစကား"
    >
      <Languages size={16} className="preference-icon" aria-hidden="true" />
      <div className="preference-options">
        <button
          type="button"
          lang="en"
          aria-label="English"
          aria-pressed={lang === "en"}
          onClick={() => setLanguage("en")}
        >
          EN
        </button>
        <button
          type="button"
          lang="my"
          aria-label="မြန်မာ"
          aria-pressed={lang === "my"}
          onClick={() => setLanguage("my")}
        >
          မြန်မာ
        </button>
      </div>
    </div>
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
