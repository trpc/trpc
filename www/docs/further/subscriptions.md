---
id: subscriptions
title: Subscriptions / WebSockets
sidebar_label: Subscriptions / WebSockets
slug: /subscriptions
---

:::info
- Subscriptions & WebSockets are in beta, but feel free to use them!
:::

:::tip
You can read more details by drilling into the TypeScript definitions in 

- [/packages/server/src/rpc/envelopes.ts](https://github.com/trpc/trpc/tree/main/packages/server/src/rpc/envelopes.ts)
- [/packages/server/src/rpc/codes.ts](https://github.com/trpc/trpc/tree/main/packages/server/src/rpc/codes.ts).
:::

## WebSockets RPC Specification


### `query` / `mutation`


#### Request

```ts
{
  id: number | string;
  jsonrpc?: '2.0';
  method: 'query' | 'mutation';
  params: {
    path: string;
    input?: unknown; // <-- pass input of procedure, serialized by transformer
  };
}
```

#### Response

_... below, or an error._

```ts
{
  id: number | string;
  jsonrpc: '2.0';
  result: {
    type: 'data'; // always 'data' for mutation / queries
    data: TOutput; // output from procedure
  };
}
```


### `subscription` / `subscription.stop`


#### Start a subscription

```ts
{
  id: number | string;
  jsonrpc?: '2.0';
  method: 'subscription';
  params: {
    path: string;
    input?: unknown; // <-- pass input of procedure, serialized by transformer
  };
}
```

#### To cancel a subscription, call `subscription.stop`

```ts
{
  id: number | string; // <-- id of your created subscription
  jsonrpc?: '2.0';
  method: 'subscription.stop';
}
```

#### Subscription response shape

_... below, or an error._

```ts
{
  id: number | string;
  jsonrpc: '2.0';
  result: (
    | {
      type: 'data';
        data: TData; // subscription emitted data
      }
    | {
        type: 'started'; // sub started
      }
    | {
        type: 'stopped'; // sub stopped
      }
  )
}
```

## Errors

> For errors read https://www.jsonrpc.org/specification#error_object or [Error Formatting](../server/error-formatting.md).


## Notifications from Server to Client


### `{id: null, type: 'reconnect' }`

Tells clients to reconnect before shutting down server. Invoked by `wssHandler.broadcastReconnectNotification()`.
