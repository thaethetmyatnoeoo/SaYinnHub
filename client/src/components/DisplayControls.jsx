import { useState } from "react";

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
