export function clampQcReceivedQuantity(value, expectedQuantity) {
  const expected = Number(expectedQuantity);
  const quantity = Number(value);
  const maximum = Number.isFinite(expected) ? Math.max(0, expected) : 0;
  const received = Number.isFinite(quantity) ? quantity : 0;
  return Math.min(maximum, Math.max(0, received));
}

export function incrementQcReceivedQuantity(currentQuantity, expectedQuantity) {
  const expected = Number(expectedQuantity);
  const current = clampQcReceivedQuantity(currentQuantity, expectedQuantity);
  if (!Number.isFinite(expected) || expected <= current) return null;
  return Math.min(expected, current + 1);
}
