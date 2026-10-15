# danSON is the default serializer, set on the endpoint (agent)

- 11 S-A: the danSON port is the default. It is configured on the endpoint: the handler and `httpLink` both take `serializer`.
- Deserialized objects have `Object.prototype`, not a null prototype. The deserializer already rejects `__proto__`, `constructor` and `prototype` keys, and query-param parsing only follows own keys.
- Lost: a data key named `constructor` can't round-trip.
- Lives in: `packages/trpcdev/src/serializer/`.
- 11 (f), Q11.6 input side (agent): `File` and `Blob` can sit anywhere in an input. They become `{ _: '$', type: 'File', value: { part, name, type, lastModified } }` markers, with the bytes in multipart parts `0`, `1`, … and the JSON in the `input` field. Only per-call serializers with `parts` know these types, so a JSON body can't claim a file, and links that can't send parts fail with `BAD_REQUEST`.
- A call with a file leaves the batch; batches stay JSON. The handler reads multipart bodies with a streaming `maxBodySize` check, which drains the rest instead of cancelling (Node drops the socket before the 413 otherwise). The OpenAPI handler uses the same reader for forms.
- Open: Q11.6 output side (root-only binary response, or nested blobs as stream chunks).
