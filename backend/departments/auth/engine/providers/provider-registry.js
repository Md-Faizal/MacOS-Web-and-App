function normalizeIdentity(identity) {
  if (!identity || typeof identity !== 'object') throw new Error('Provider identity is invalid');
  const provider = String(identity.provider || '').trim().toLowerCase();
  const providerUserId = String(identity.providerUserId || '').trim();
  if (!provider || !providerUserId) throw new Error('Provider identity is incomplete');

  return {
    provider,
    providerUserId,
    email: typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : null,
    emailVerified: identity.emailVerified === true,
    name: typeof identity.name === 'string' ? identity.name.trim() : null,
    picture: typeof identity.picture === 'string' ? identity.picture : null
  };
}

function createProviderRegistry() {
  const adapters = new Map();

  const register = (provider, adapter) => {
    const key = String(provider || '').trim().toLowerCase();
    if (!key || !adapter || typeof adapter.authenticate !== 'function') {
      throw new Error('Provider adapter must expose authenticate()');
    }
    if (adapters.has(key)) throw new Error(`Provider adapter already registered: ${key}`);
    adapters.set(key, adapter);
  };

  const authenticate = async (provider, input, context) => {
    const adapter = adapters.get(String(provider || '').trim().toLowerCase());
    if (!adapter) throw new Error(`Unsupported authentication provider: ${provider}`);
    return normalizeIdentity(await adapter.authenticate(input, context));
  };

  return { register, authenticate, normalizeIdentity };
}

module.exports = { createProviderRegistry, normalizeIdentity };