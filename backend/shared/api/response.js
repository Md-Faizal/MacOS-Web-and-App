function jsonEnvelope(statusCode, body, meta = {}) {
  const payload = {
    success: statusCode >= 200 && statusCode < 300,
    data: body && typeof body === 'object' && !Array.isArray(body) && body.success === undefined && body.error === undefined ? body : undefined,
    meta: {
      requestId: meta.requestId || null,
      generatedAt: meta.generatedAt || new Date().toISOString(),
      status: meta.status || (statusCode >= 200 && statusCode < 300 ? 'ok' : 'error')
    }
  };

  if (Array.isArray(body)) payload.data = body;
  if (body !== undefined && body !== null && typeof body === 'object' && (body.success !== undefined || body.error !== undefined)) {
    payload.data = body.data ?? body;
    if (body.error) payload.error = body.error;
    if (body.success !== undefined) payload.success = Boolean(body.success);
  }

  if (payload.success === false && !payload.error) {
    payload.error = {
      code: 'UNSPECIFIED_ERROR',
      message: 'Request failed',
      details: null,
      status: statusCode
    };
  }

  return { statusCode, payload };
}

function sendSuccess(res, data, meta = {}) {
  const { statusCode, payload } = jsonEnvelope(200, data, meta);
  return res.status(statusCode).json(payload);
}

function sendCreated(res, data, meta = {}) {
  const { statusCode, payload } = jsonEnvelope(201, data, meta);
  return res.status(statusCode).json(payload);
}

function sendError(res, code, message, details = null, statusCode = 500, meta = {}) {
  const payload = {
    success: false,
    error: {
      code,
      message,
      details,
      status: statusCode
    },
    data: null,
    meta: {
      requestId: meta.requestId || null,
      generatedAt: meta.generatedAt || new Date().toISOString(),
      status: 'error'
    }
  };

  return res.status(statusCode).json(payload);
}

function attachResponseHelpers(req, res, next) {
  res.api = {
    success: (data, meta) => sendSuccess(res, data, { ...meta, requestId: meta?.requestId || req.requestId }),
    created: (data, meta) => sendCreated(res, data, { ...meta, requestId: meta?.requestId || req.requestId }),
    error: (code, message, details, statusCode, meta) => sendError(
      res,
      code,
      message,
      details,
      statusCode || 500,
      { ...meta, requestId: meta?.requestId || req.requestId }
    )
  };

  next();
}

module.exports = {
  jsonEnvelope,
  sendSuccess,
  sendCreated,
  sendError,
  attachResponseHelpers
};
