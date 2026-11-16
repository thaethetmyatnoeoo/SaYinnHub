// UI options are derived from saved inventory, never from unused template choices.
export function variantDimensions(variants) {
  const defs = variants[0]?.fields || [];
  return defs.filter(
    (f) =>
      f.type !== "image" &&
      variants.some((v) => v.customFields?.[f.id] !== undefined),
  );
}
export function matchingVariants(
  variants,
  dimensions,
  selection,
  before = dimensions.length,
) {
  return variants.filter((v) =>
    dimensions
      .slice(0, before)
      .every(
        (f) =>
          !Object.hasOwn(selection, f.id) ||
          String(v.customFields?.[f.id] ?? "") === selection[f.id],
      ),
  );
}
export function changeOption(variants, dimensions, selection, field, value) {
  const index = dimensions.findIndex((f) => f.id === field);
  const next = Object.fromEntries(
    dimensions
      .slice(0, index)
      .filter((f) => Object.hasOwn(selection, f.id))
      .map((f) => [f.id, selection[f.id]]),
  );
  if (value !== undefined) next[field] = value;
  // Retain later values only while their combination is still valid.
  for (const f of dimensions.slice(index + 1)) {
    if (
      Object.hasOwn(selection, f.id) &&
      matchingVariants(variants, dimensions, {
        ...next,
        [f.id]: selection[f.id],
      }).length
    )
      next[f.id] = selection[f.id];
  }
  return next;
}
export function availableStock(product, cart, editingId) {
  return Math.max(
    0,
    product.stock -
      cart
        .filter((l) => l.id === product.id && l.id !== editingId)
        .reduce((s, l) => s + l.qty, 0),
  );
}
