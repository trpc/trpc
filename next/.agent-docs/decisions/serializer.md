# danSON is the default serializer, set on the endpoint (agent)

- Q11.1 S-A: the danSON port is the default. It is configured on the endpoint: the handler and `httpLink` both take `serializer`.
- Q11.2: danSON's code is ported into `trpcdev/serializer` (Effect `Stream`s for the async format, [`../notes/danson-port-and-query-params.md`](../notes/danson-port-and-query-params.md)), not a dependency on the `danson` package; wire compatibility with standalone danSON isn't kept.
- Q11.3 QP-C: GET inputs are legible bracket-notation params with `$Type:value` scalars ([`wire-protocol.md`](./wire-protocol.md)).
- Deserialized objects have `Object.prototype`, not a null prototype. The deserializer already rejects `__proto__`, `constructor` and `prototype` keys, and query-param parsing only follows own keys.
- Lost: a data key named `constructor` can't round-trip.
- Lives in: `packages/trpcdev/src/serializer/`.
