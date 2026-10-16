# Links declare the form results arrive in; `openApiLink` is JSON (agent)

- [`openapi.md`](./openapi.md) left Open: `openApiLink`'s client types showed server types (`createdAt: Date`) while REST sends JSON (a string). The JSON form already existed for routers with a JSON serializer (`JsonForm`, [`replaceable-serializers.md`](./replaceable-serializers.md)); it wasn't reachable from a link.
- (agent) `LinkDecl` gained `form?: OutputForm`, beside `errors`, `unsupported` and `batches` ([`client.md`](./client.md), Q16.6 "they should also be inferrable and affect what's available"). `openApiLink` declares `{ form: JsonForm }`, so its results are typed `JsonOf<Output>`. The first link in the array that declares a form wins, because a link in front can change results: `validationLink({ output: 'json' })` declares `DansonForm` (the schemas' types) since it decodes the JSON.
- (agent) Precedence: an explicit client form (`createRouterClient`'s by-reference values) wins, then the links' form, then the router's serializer. Both the Promise and Effect clients follow it.
- Why: the types match what arrives, with no runtime cost; restoring types is an explicit, Effect Schema-driven step.
- Lost: `openApiLink` results typed as the server's types without a decoder.
- Lives in: `packages/trpcdev/src/client/link.ts` (`LinkDecl.form`), `src/client/types.ts` (`ResultForm`, `LinksTypes.form`), `src/effect/index.ts`, `src/openapi/link.ts`, `src/client/links/validation.ts` (overload), `test/integration/client-validation.test.ts`, `docs/openapi.md` ("Calling REST from the client").
