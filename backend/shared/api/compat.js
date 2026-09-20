function toLegacyShape(payload, fallback = null) {
  if (payload === undefined || payload === null) return fallback;

  if (payload && typeof payload === 'object' && payload.success !== undefined) {
    if (payload.data !== undefined) return payload.data;
    if (payload.error) return payload.error;
    return payload;
  }

  return payload;
}

function canonicalizeObject(payload, aliases = {}) {
  if (!payload || typeof payload !== 'object') return payload;

  const normalized = { ...payload };
  for (const [legacyKey, canonicalKey] of Object.entries(aliases)) {
    if (normalized[legacyKey] !== undefined && normalized[canonicalKey] === undefined) {
      normalized[canonicalKey] = normalized[legacyKey];
    }
  }

  return normalized;
}

function compatListResponse(payload, meta = {}) {
  return {
    success: true,
    data: payload,
    meta: {
      generatedAt: meta.generatedAt || new Date().toISOString(),
      status: meta.status || 'ok'
    }
  };
}

module.exports = {
  toLegacyShape,
  canonicalizeObject,
  compatListResponse
};
