import {DurableObject} from 'cloudflare:workers';
import type {Subscription, SubscriptionInfo, TransportConnection} from './base';
import {getTrpcSubscriptionUtils} from './base';
import type {AnyRouter} from '../../@trpc/server';

const WS_TAG_PREFIX = 'ws-trpc-transport-id-';

function isWSTrpcTag(tag: string) {
    return tag.startsWith(WS_TAG_PREFIX);
}

function newWSTrpcTag() {
    return wsTrpcTagFromUuid(crypto.randomUUID());
}

function wsTrpcTagFromUuid(id: string) {
    return WS_TAG_PREFIX + id.replaceAll('-', '');
}

function wsTagAndSubIdFromWSTrpcStorageTag(tag: string) {
    const key = tag.replace(WS_TAG_PREFIX, '');
    const [wsTag, id] = key.split('-');
    if (!wsTag || !id) {
        throw new Error('Invalid subscription tag found in storage');
    }
    const numberId = parseInt(id);
    const subId = isNaN(numberId) ? id.toString() : numberId;
    return {
        wsTag: wsTrpcTagFromUuid(wsTag),
        subId
    };
}

function wsTrpcStorageTagFromTagAndSubId(
    wsTag: string,
    subId: number | string
) {
    return wsTag + '-' + subId;
}

export abstract class TrpcDurableObject<
    TRouter extends AnyRouter,
    TEnv = unknown,
> extends DurableObject {
    // stores all currently live subscriptions
    private subscriptionRegister = new Map<
        string,
        Map<number | string, AbortController>
    >();
    protected router: TRouter;

    protected constructor(ctx: DurableObjectState, env: TEnv, router: TRouter) {
        super(ctx, env);
        this.router = router;
    }

    private async cloudflareTrpcUtils(ws: WebSocket | null) {
        const ctx = this.ctx;
        const subscriptionRegister = this.subscriptionRegister;

        function getWsTag(ws: WebSocket) {
            const tag = ctx.getTags(ws).find(isWSTrpcTag);
            if (!tag) {
                throw new Error('No subscription id tag found for websocket');
            }
            return tag;
        }

        function getSubscriptions(ws: WebSocket) {
            const tag = getWsTag(ws);
            return (subscriptionRegister.get(tag) ?? new Map<number | string, AbortController>());
        }

        function addSubscription(
            ws: WebSocket,
            id: number | string,
            sub: AbortController
        ) {
            const tag = getWsTag(ws);
            const subs = subscriptionRegister.get(tag) ?? new Map();
            subs.set(id, sub);
            subscriptionRegister.set(tag, subs);
        }

        async function getAllSubscriptionInfos() {
            const allSubscriptions = await ctx.storage.list({
                prefix: WS_TAG_PREFIX
            });

            return Array.from(allSubscriptions.entries())
                .map(([key, value]) => {
                    const {wsTag, subId} = wsTagAndSubIdFromWSTrpcStorageTag(key);
                    const data: SubscriptionInfo = value as SubscriptionInfo;
                    return {tag: wsTag, sub: {subId, data}};
                })
                .reduce<Map<string, Map<number | string, SubscriptionInfo>>>(
                    (acc, {tag, sub}) => {
                        const map = acc.get(tag) ?? new Map();
                        map.set(sub.subId, sub.data);
                        acc.set(tag, map);
                        return acc;
                    },
                    new Map<string, Map<number | string, SubscriptionInfo>>()
                );
        }

        async function getSubscriptionInfo(ws: WebSocket) {
            const storagePrefix = getWsTag(ws);
            const subscriptions = await ctx.storage.list({
                prefix: storagePrefix
            });
            return new Map(
                Array.from(subscriptions.entries()).map(([key, value]) => {
                    const {subId} = wsTagAndSubIdFromWSTrpcStorageTag(key);
                    const data: SubscriptionInfo = value as SubscriptionInfo;
                    return [subId, data];
                })
            );
        }

        async function addSubscriptionInfo(
            ws: WebSocket,
            id: number | string,
            data: SubscriptionInfo
        ) {
            const storageKey = wsTrpcStorageTagFromTagAndSubId(getWsTag(ws), id);
            await ctx.storage.put(storageKey, data);
        }

        async function getPersistentWithMergedSubs(
            ws: WebSocket | null
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
                            sub: liveSubs.get(key) ?? {
                                signal: new AbortSignal(),
                                abort: (): void => {
                                    throw new Error(
                                        'Unsubscribe called on non live subscription'
                                    );
                                }
                            },
                            subInfo: value
                        } satisfies Subscription
                    ];
                })
            );
        }

        async function addSub(ws: WebSocket | null, sub: Subscription) {
            if (!ws) {
                throw new Error(
                    'Cannot add subscription to null ws (should never happen)'
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

        async function deleteSub(ws: WebSocket | null, id: number | string) {
            if (!ws) {
                return;
            }
            const tag = getWsTag(ws);
            subscriptionRegister.get(tag)?.delete(id);
            await ctx.storage.delete(wsTrpcStorageTagFromTagAndSubId(tag, id));
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
                (await ctx.storage.list({prefix: tag})).entries()
            ).map(([key, _]) => key);
            for (const key of storageTags) {
                await ctx.storage.delete(key);
            }
        }

        function transportFromWs(ws: WebSocket | null): TransportConnection {
            return {
                send: (data) => {
                    ws?.send(data);
                },
                close: () => ws?.close(),
                isOpen: () => ws?.readyState === WebSocket.OPEN,
                subs: {
                    get: () => getPersistentWithMergedSubs(ws),
                    add: (sub) => addSub(ws, sub),
                    has: (id) => hasSub(ws, id),
                    delete: (id) => deleteSub(ws, id),
                    clear: () => clearSubs(ws)
                }
            };
        }

        //TODO: better req res typing
        const utils = await getTrpcSubscriptionUtils<TRouter>({
            createContext: async () => ({req: null, res: null, ctx}),
            router: this.router,
            req: null,
            res: null,
            currentTransport: transportFromWs(ws),
            getAllConnectedTransports: () => ctx.getWebSockets().map(transportFromWs)
        });

        const {reloadSubscriptionOnTransport} = utils;
        return {
            ...utils,
            reloadSubscriptionOnTransport: undefined,
            reloadSubscriptions: async () => {
                const subscriptions = await getAllSubscriptionInfos();
                for (const [tag, subs] of subscriptions.entries()) {
                    for (const [id, sub] of subs.entries()) {
                        if (
                            !this.subscriptionRegister.has(tag) ||
                            !this.subscriptionRegister.get(tag)?.has(id)
                        ) {
                            const websockets = ctx.getWebSockets(tag);
                            const websocket = websockets.at(0);
                            if (!websocket) {
                                // No websockets found for subscription, clear it
                                await ctx.storage.delete(
                                    wsTrpcStorageTagFromTagAndSubId(tag, id)
                                );
                                break;
                            }
                            if (websockets.length > 1) {
                                throw new Error(
                                    'More than one websocket found for subscription'
                                );
                            }
                            const transport = transportFromWs(websocket);
                            const unsub = await reloadSubscriptionOnTransport(
                                {id, subInfo: sub},
                                transport
                            );
                            addSubscription(websocket, id, unsub);
                        }
                    }
                }
            }
        };
    }

    override async fetch(_request: Request): Promise<Response> {
        // Creates two ends of a WebSocket connection.
        const [client, server] = Object.values(new WebSocketPair()) as [
            WebSocket,
            WebSocket,
        ];
        // Stores WS connection in hibernation api.
        const tag = newWSTrpcTag();
        this.ctx.acceptWebSocket(server, [tag]);
        // Returns the client end of the WebSocket connection to the client.
        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    override async webSocketMessage(
        ws: WebSocket,
        message: ArrayBuffer | string
    ) {
        const utils = await this.cloudflareTrpcUtils(ws);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        await utils.reloadSubscriptions();
        await utils.handleMessage(message);
    }

    override async webSocketError(ws: WebSocket, error: any) {
        const utils = await this.cloudflareTrpcUtils(ws);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        await utils.reloadSubscriptions();
        utils.handleError(error);
    }

    override async webSocketClose(ws: WebSocket) {
        const utils = await this.cloudflareTrpcUtils(ws);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        await utils.reloadSubscriptions();
        await utils.handleClose();
    }

    override async alarm() {
        const utils = await this.cloudflareTrpcUtils(null);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        await utils.reloadSubscriptions();
    }
}