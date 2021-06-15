---
id: subscriptions
title: Subscriptions & WebSockets
sidebar_label: Subscriptions & WebSockets
slug: /subscriptions
---

:::warning
Subscriptions & WebSockets are both experimental and might have breaking changes without a major version bump.
:::

## RPC flow for subscriptions

- For errors read https://www.jsonrpc.org/specification#error_object

## "Global" Notifications from Server to Client

- -> `{id: null, type: 'reconnect' }`

## Right now

1. -> `{id: 1, type: 'subscription', method: {input: x, path: y} }`

Responses:

1. <- `{id: 1, result: {data: x} }`  <-- data
2. <- `{id: 1, result: 'stopped' }`  <---

### Better

1. -> `{id: 1, type: 'subscription', method: {input: x, path: y} }`
2. <- `{id: 1, result: { type: 'started'  }}`
3. <- `{id: 1, result: { type: 'data', data: SubscriptionData }}`
4. <- `{id: 1, error: { code: JSONRPC_ERROR_CODE, message: string, data: any }}`
5. <- `{id: 1, result: { type: 'stopped', error: SubscriptionData }}`
