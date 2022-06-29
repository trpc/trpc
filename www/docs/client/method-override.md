---
id: method-override
title: Procedure Method Override
sidebar_label: Method Override
slug: /method-override
---

Sometimes you may wish to change the HTTP method of a tRPC procedure when making requests. Just add the `method?: 'GET' | 'POST'` property into the `ProcedureOptions` object.

:::info

- This is entirely optional and only if you want to override the default behaviour.
- Default HTTP method is `GET` for `queries` and `POST` for `mutations`.

:::

## Example

Make a `query` using `POST` HTTP transport method. This will cause tRPC to send your `input` in the request body and will therefore circumvent the URL length limits when sending large payloads to `query` procedures.

```ts title='client.ts'
const data = await client.query('getData', largeInputPayload, {
  method: 'POST',
});
```

#### Disable `methodOverride` on your server

You can opt-out of method overriding with the following option in your tRPC handler:

```ts title='pages/api/trpc/[trpc].ts'
export default trpcNext.createNextApiHandler({
  // [...]
  // 👇 disable methodOverride
  methodOverride: {
    enabled: false,
  },
});
```
