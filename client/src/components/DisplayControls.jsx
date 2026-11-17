import React, { useEffect, useState } from "react";
import { Type } from "lucide-react";
import { t as tr } from "../i18n";
export function usePreference(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  };
  return [value, update];
}
export function FontControl() {
  const [size, setSize] = usePreference("sayinn-text-size", "standard");
  useEffect(() => {
    document.documentElement.dataset.textSize = [
      "standard",
      "large",
      "larger",
    ].includes(size)
      ? size
      : "standard";
  }, [size]);
  return (
    <label className="font-control">
      <Type size={18} />
      <span>{tr("Text size")}</span>
      <select
        aria-label={tr("Text size")}
        value={size}
        onChange={(e) => setSize(e.target.value)}
      >
        <option value="standard">{tr("Standard")}</option>
        <option value="large">{tr("Large")}</option>
        <option value="larger">{tr("Extra large")}</option>
      </select>
    </label>
  );
}
