# danSON is the default serializer, set on the endpoint (agent)

- 11 S-A: the danSON port is the default. It is configured on the endpoint: the handler and `httpLink` both take `serializer`.
- Deserialized objects have `Object.prototype`, not a null prototype. The deserializer already rejects `__proto__`, `constructor` and `prototype` keys, and query-param parsing only follows own keys.
- Lost: a data key named `constructor` can't round-trip.
- Lives in: `packages/trpcdev/src/serializer/`.
