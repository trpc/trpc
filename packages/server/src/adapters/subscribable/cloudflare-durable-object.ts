import type {
  DurableObject,
  DurableObjectState,
} from '@cloudflare/workers-types';
import {
  Request,
  Response,
  WebSocket,
  WebSocketPair,
} from '@cloudflare/workers-types';
import { AnyRouter } from '../../index';
import { Unsubscribable } from '../../observable';
import {
  getTrpcSubscriptionUtils,
  Subscription,
  SubscriptionInfo,
  TransportConnection,
} from './base';

const WS_TAG_PREFIX = 'ws-trpc-transport-id-';

function isWSTrpcTag(tag: string) {
  return tag.startsWith(WS_TAG_PREFIX);
}

function newWSTrpcTag() {
  return WS_TAG_PREFIX + crypto.randomUUID().replaceAll('-', '');
}

function keyAndSubIdFromWSTrpcTag(tag: string) {
  const key = tag.replace(WS_TAG_PREFIX, '');
  const [wsTag, id] = key.split('-');
  if (!wsTag || !id) {
    throw new Error('Invalid subscription tag found in storage');
  }
  const numberId = parseInt(id);
  const parsedId = isNaN(numberId) ? id.toString() : numberId;
  return {
    wsTag,
    subId: parsedId,
  };
}

function wsTrpcTagFromStorageKey(wsTag: string, subId: number | string) {
  return WS_TAG_PREFIX + wsTag + '-' + subId;
}

// stores all currently live subscriptions
const subscriptionRegister = new Map<
  string,
  Map<number | string, Unsubscribable>
>();

async function cloudflareTrpcUtils<TRouter extends AnyRouter>(
  router: TRouter,
  ws: WebSocket | null,
  ctx: DurableObjectState,
) {
  function getWsTag(ws: WebSocket) {
    const tag = ctx.getTags(ws).find(isWSTrpcTag);
    if (!tag) {
      throw new Error('No subscription id tag found for websocket');
    }
    return tag;
  }

  function getSubscriptions(ws: WebSocket) {
    const tag = getWsTag(ws);
    return (
      subscriptionRegister.get(tag) ||
      new Map<number | string, Unsubscribable>()
    );
  }

  function addSubscription(
    ws: WebSocket,
    id: number | string,
    sub: Unsubscribable,
  ) {
    const tag = getWsTag(ws);
    if (!subscriptionRegister.has(tag)) {
      subscriptionRegister.set(tag, new Map());
    }
    const subs = subscriptionRegister.get(tag)!;
    subs.set(id, sub);
    subscriptionRegister.set(tag, subs);
  }

  async function getAllSubscriptionInfos() {
    const allSubscriptions = await ctx.storage.list({
      prefix: WS_TAG_PREFIX,
    });

    return Array.from(allSubscriptions.entries())
      .map(([key, value]) => {
        const { wsTag, subId } = keyAndSubIdFromWSTrpcTag(key);
        const data: SubscriptionInfo = value as SubscriptionInfo;
        return { tag: wsTag, sub: { subId, data } };
      })
      .reduce<Map<string, Map<number | string, SubscriptionInfo>>>(
        (acc, { tag, sub }) => {
          if (!acc.has(tag)) {
            acc.set(tag, new Map());
          }
          const map = acc.get(tag)!;
          map.set(sub.subId, sub.data);
          acc.set(tag, map);
          return acc;
        },
        new Map<string, Map<number | string, SubscriptionInfo>>(),
      );
  }

  async function getSubscriptionInfo(ws: WebSocket) {
    const storagePrefix = getWsTag(ws);
    const subscriptions = await ctx.storage.list({
      prefix: storagePrefix,
    });
    return new Map(
      Array.from(subscriptions.entries()).map(([key, value]) => {
        const { subId } = keyAndSubIdFromWSTrpcTag(key);
        const data: SubscriptionInfo = value as SubscriptionInfo;
        return [subId, data];
      }),
    );
  }

  async function addSubscriptionInfo(
    ws: WebSocket,
    id: number | string,
    data: SubscriptionInfo,
  ) {
    const storageKey = getWsTag(ws) + '-' + id;
    await ctx.storage.put(storageKey, data);
  }

  async function getPersistentWithMergedSubs(
    ws: WebSocket | null,
  ): Promise<Map<string | number, Subscription>> {
    if (!ws) {
      return new Map();
    }
    const subscriptions = await getSubscriptionInfo(ws);
    const liveSubs = getSubscriptions(ws);
    return new Map(
      Array.from(subscriptions.entries()).map(([key, value]) => {
        return [
          key,
          {
            id: key,
            sub: liveSubs.has(key)
              ? liveSubs.get(key)!
              : {
                  unsubscribe: (): void => {
                    throw new Error(
                      'Unsubscribe called on non live subscription',
                    );
                  },
                },
            subInfo: value,
          } satisfies Subscription,
        ];
      }),
    );
  }

  async function addSub(ws: WebSocket | null, sub: Subscription) {
    if (!ws) {
      throw new Error(
        'Cannot add subscription to null ws (should never happen)',
      );
    }
    // Persist sub info
    await addSubscriptionInfo(ws, sub.id, sub.subInfo);
    // Store sub in memory
    addSubscription(ws, sub.id, sub.sub);
  }

  async function hasSub(ws: WebSocket | null, id: number | string) {
    if (!ws) {
      return false;
    }
    return (await getSubscriptionInfo(ws)).has(id);
  }

  async function clearSubs(ws: WebSocket | null) {
    if (!ws) {
      return;
    }
    const tag = getWsTag(ws);
    // Clear subscriptions in memory
    subscriptionRegister.delete(tag);
    // Clear sub info in storage
    const storageTags = Array.from(
      (await ctx.storage.list({ prefix: tag })).entries(),
    ).map(([key, _]) => key);
    for (const key of storageTags) {
      await ctx.storage.delete(key);
    }
  }

  function transportFromWs(ws: WebSocket | null): TransportConnection {
    return {
      send: (data) => ws?.send(data),
      close: () => ws?.close(),
      isOpen: () => ws?.readyState === WebSocket.OPEN,
      subs: {
        get: () => getPersistentWithMergedSubs(ws),
        add: (sub) => addSub(ws, sub),
        has: (id) => hasSub(ws, id),
        clear: () => clearSubs(ws),
      },
    };
  }

  //TODO: better req res typing
  const utils = await getTrpcSubscriptionUtils<TRouter>({
    createContext: async () => ({ req: null, res: null, ctx }),
    router,
    req: null,
    res: null,
    currentTransport: transportFromWs(ws),
    getAllConnectedTransports: () => ctx.getWebSockets().map(transportFromWs),
  });

  const { reloadSubscriptionOnTransport } = utils;
  return {
    ...utils,
    reloadSubscriptionOnTransport: undefined,
    reloadSubscriptions: async () => {
      const subscriptions = await getAllSubscriptionInfos();
      for (const [tag, subs] of subscriptions.entries()) {
        for (const [id, sub] of subs.entries()) {
          if (
            !subscriptionRegister.has(tag) ||
            !subscriptionRegister.get(tag)!.has(id)
          ) {
            const websockets = ctx.getWebSockets(
              wsTrpcTagFromStorageKey(tag, id),
            );
            if (websockets.length == 0) {
              //TODO clean up subscription info in storage
              continue;
            }
            if (websockets.length > 1) {
              throw new Error('More than one websocket found for subscription');
            }
            const transport = transportFromWs(websockets[0]!);
            const unsubscribable = await reloadSubscriptionOnTransport(
              { id, subInfo: sub },
              transport,
            );
            addSubscription(websockets[0]!, id, unsubscribable);
          }
        }
      }
    },
  };
}

export abstract class TrpcDurableObject<
  TRouter extends AnyRouter,
  Env = unknown,
> implements DurableObject
{
  protected ctx: DurableObjectState;
  protected env: Env;
  protected router: TRouter;

  constructor(ctx: DurableObjectState, env: Env, router: TRouter) {
    this.ctx = ctx;
    this.env = env;
    this.router = router;
  }

  async fetch(_request: Request): Promise<Response> {
    const utils = await cloudflareTrpcUtils(this.router, null, this.ctx);
    // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
    await utils.reloadSubscriptions();

    // Creates two ends of a WebSocket connection.
    const [client, server] = Object.values(new WebSocketPair()) as [
      WebSocket,
      WebSocket,
    ];
    // Stores WS connection in hibernation api.
    this.ctx.acceptWebSocket(server, [newWSTrpcTag()]);
    // Returns the client end of the WebSocket connection to the client.
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx);
    // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
    await utils.reloadSubscriptions();
    await utils.handleMessage(message);
  }

  async webSocketError(ws: WebSocket, error: any) {
    const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx);
    // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
    await utils.reloadSubscriptions();
    utils.handleError(error);
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx);
    // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
    await utils.reloadSubscriptions();
    await utils.handleClose();
  }

  async alarm() {
    const utils = await cloudflareTrpcUtils(this.router, null, this.ctx);
    // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
    await utils.reloadSubscriptions();
  }
}
