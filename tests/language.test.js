import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  t,
  setLanguage,
  getLanguage,
  subscribe,
} from "../client/src/i18n/core.js";
import my from "../client/src/i18n/my.json" with { type: "json" };
import { parsers } from "prettier/plugins/babel";
test("all guide steps have English and Myanmar translations", () => {
  const en = JSON.parse(readFileSync("client/src/i18n/en.json", "utf8"));
  const keys = Object.keys(en).filter((k) => k.startsWith("guide."));
  assert.equal(keys.length, 31);
  for (const key of keys) {
    assert.ok(en[key].length > 0);
    assert.match(my[key], /[\u1000-\u109f]/);
  }
});
test("language switching notifies the app, interpolates values and leaves unknown data intact", () => {
  let changed = 0;
  const stop = subscribe(() => changed++);
  setLanguage("my");
  assert.equal(getLanguage(), "my");
  assert.equal(t("Products"), "ကုန်ပစ္စည်းများ");
  assert.equal(
    t("Welcome, {{name}}", { name: "Aye Aye" }),
    "မင်္ဂလာပါ၊ Aye Aye",
  );
  assert.equal(t("Color is required."), "Color လိုအပ်သည်။");
  assert.equal(t("Aye Aye's hand-made shirt"), "Aye Aye's hand-made shirt");
  setLanguage("en");
  assert.equal(t("Products"), "Products");
  assert.equal(changed, 2);
  stop();
});
test("all explicit interface translation keys have Myanmar resources", () => {
  const missing = [];
  for (const f of readdirSync("client/src", { recursive: true }).filter((f) =>
    f.endsWith(".jsx"),
  )) {
    const ast = parsers.babel.parse(readFileSync("client/src/" + f, "utf8"));
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (
        n.type === "CallExpression" &&
        ["tr", "t"].includes(n.callee?.name) &&
        n.arguments[0]?.type === "StringLiteral"
      ) {
        const key = n.arguments[0].value;
        if (
          key.trim() &&
          !Object.hasOwn(my, key) &&
          !Object.hasOwn(my, key.trim())
        )
          missing.push(f + ": " + key);
      }
      for (const [k, v] of Object.entries(n)) {
        if (["loc", "comments", "tokens"].includes(k)) continue;
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") walk(v);
      }
    };
    walk(ast);
  }
  assert.deepEqual(missing, []);
});
