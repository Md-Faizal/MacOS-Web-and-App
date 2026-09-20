# Authentication Providers

Provider adapters must return a normalized identity and must never decide account ownership themselves.

```js
{
  provider: 'google',
  providerUserId: 'stable-provider-subject',
  email: 'verified@example.com',
  emailVerified: true,
  name: 'Example User',
  picture: null
}
```

The identity service owns matching, conflict detection, linking, and account assignment. Email is metadata and a conflict signal; `(provider, providerUserId)` is the authoritative identity key.

Future adapters for Apple, Facebook, Microsoft, and GitHub must validate issuer, audience, signature, expiry, nonce, redirect binding, and provider-specific email verification before returning this shape.