---
id: RPC
title: Subscriptions / WebSockets / JSON-RPC 2.0
sidebar_label: Subscriptions / WebSockets / JSON-RPC 2.0
slug: /RPC
---

:::warning
- Subscriptions & WebSockets are both experimental and might have breaking changes without a major version bump.
:::

:::tip
You can read more details by drilling into the TypeScript definitions in [/packages/server/rpc](https://github.com/trpc/trpc/tree/feature/refactor-rpc/packages/server/src/rpc).
:::

## Client Request Methods


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

> :construction: For errors read https://www.jsonrpc.org/specification#error_object or [Error Formatting](../server/error-formatting.md).


## Notifications from Server to Client


### `{id: null, type: 'reconnect' }`

Tells clients to reconnect before shutting down server. Invoked by `wssHandler.broadcastReconnectNotification()`.