import { test } from "node:test";
import assert from "node:assert/strict";
import {
  variantDimensions,
  matchingVariants,
  changeOption,
  availableStock,
} from "../client/src/features/products/variantSelection.js";
const fields = [
  { id: "color", type: "select" },
  { id: "size", type: "select" },
];
const variants = [
  {
    id: "red",
    fields,
    customFields: { color: "Red", size: "Small" },
    price: 120,
    stock: 20,
  },
  {
    id: "blue",
    fields,
    customFields: { color: "Blue", size: "Large" },
    price: 135,
    stock: 8,
  },
];
test("option changes discard invalid combinations and resolve exact stock and price", () => {
  const dims = variantDimensions(variants);
  const next = changeOption(
    variants,
    dims,
    { color: "Red", size: "Small" },
    "color",
    "Blue",
  );
  assert.deepEqual(next, { color: "Blue" });
  assert.deepEqual(
    matchingVariants(variants, dims, next).map((v) => v.customFields.size),
    ["Large"],
  );
  const selected = matchingVariants(variants, dims, {
    ...next,
    size: "Large",
  })[0];
  assert.equal(selected.stock, 8);
  assert.equal(selected.price, 135);
  assert.equal(
    matchingVariants(variants, dims, { color: "Red", size: "Large" }).length,
    0,
  );
});
test("editing a cart item restores its quantity allowance and reserves other combinations", () => {
  const cart = [
    { id: "red", qty: 3 },
    { id: "blue", qty: 5 },
  ];
  assert.equal(availableStock(variants[0], cart, "red"), 20);
  assert.equal(availableStock(variants[1], cart, "red"), 3);
  assert.equal(availableStock(variants[1], cart), 3);
});
test("empty optional values remain selectable", () => {
  const v = [{ fields, customFields: { color: "Red" } }];
  const next = changeOption(v, fields, { color: "Red" }, "size", "");
  assert.equal(matchingVariants(v, fields, next).length, 1);
  assert.ok(Object.hasOwn(next, "size"));
});
