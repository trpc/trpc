import {DurableObject} from 'cloudflare:workers';
import {AnyRouter} from "../../@trpc/server";
import {getTrpcSubscriptionUtils, Subscription, SubscriptionInfo} from "./base";
import {Unsubscribable} from "../../observable";

const WS_TAG_PREFIX = 'ws-trpc-transport-id-';

function isWSTrpcTag(tag: string) {
    return tag.startsWith(WS_TAG_PREFIX)
}

function newWSTrpcTag() {
    return WS_TAG_PREFIX + crypto.randomUUID();
}

// stores all currently live subscriptions
const subscriptionRegister = new Map<string, Map<number | string, Unsubscribable>>();

async function cloudflareTrpcUtils<TRouter extends AnyRouter>(router: TRouter, ws: WebSocket | null, ctx: DurableObjectState) {
    function getWsTag(ws: WebSocket) {
        const tag = ctx.getTags(ws).find(isWSTrpcTag);
        if (!tag) {
            throw new Error('No subscription id tag found for websocket');
        }
        return tag;
    }

    function getSubscriptions(ws: WebSocket) {
        const tag = getWsTag(ws);
        return subscriptionRegister.get(tag) || new Map<number | string, Unsubscribable>();
    }

    function addSubscription(ws: WebSocket, id: number | string, sub: Unsubscribable) {
        const tag = getWsTag(ws);
        if (!subscriptionRegister.has(tag)) {
            subscriptionRegister.set(tag, new Map());
        }
        const subs = subscriptionRegister.get(tag)!;
        subs.set(id, sub);
        subscriptionRegister.set(tag, subs);
    }

    async function getSubscriptionInfo(ws: WebSocket) {
        const storagePrefix = getWsTag(ws);
        const subscriptions = await ctx.storage.list({
            prefix: storagePrefix
        })
        return new Map(
            Array.from(subscriptions.entries())
                .map(([key, value]) => {
                    const id = key.replace(storagePrefix, '').replace('-', '');
                    const numberId = parseInt(id)
                    const parsedId = isNaN(numberId) ? id : numberId;
                    // TODO: type check
                    const data: SubscriptionInfo = value as SubscriptionInfo
                    return [parsedId, data];
                })
        )
    }

    async function addSubscriptionInfo(ws: WebSocket, id: number | string, data: SubscriptionInfo) {
        const storageKey = getWsTag(ws) + '-' + id;
        await ctx.storage.put(storageKey, data);
    }

    async function getPersistentWithMergedSubs(ws: WebSocket | null): Promise<Map<string | number, Subscription>> {
        if (!ws) {
            return new Map();
        }
        const subscriptions = await getSubscriptionInfo(ws);
        const liveSubs = getSubscriptions(ws);
        return new Map(
            Array.from(subscriptions.entries())
                .map(([key, value]) => {
                    return [key, {
                        id: key,
                        sub: liveSubs.has(key) ?
                            liveSubs.get(key)! :
                            {
                                unsubscribe: (): void => {
                                    throw new Error('Unsubscribe called on non live subscription')
                                }
                            },
                        subInfo: value

                    } satisfies Subscription];
                })
        );
    }

    async function addSub(ws: WebSocket | null, sub: Subscription) {
        if (!ws) {
            throw new Error('Cannot add subscription to null ws (should never happen)');
        }
        // Persist sub info
        await addSubscriptionInfo(ws, sub.id, sub.subInfo);
        // Store sub in memory
        addSubscription(ws, sub.id, sub.sub);
    }


    const utils = await getTrpcSubscriptionUtils<TRouter, null>({
        createContext: async () => ({req: null, res: null, ctx}),
        router,
        req: null,
        currentTransport: {
            send: (data) => ws?.send(data),
            close: () => ws?.close(),
            isOpen: () => ws?.readyState === WebSocket.OPEN,
            subs: {
                get: () => getPersistentWithMergedSubs(ws),
                add: (sub) => addSub(ws, sub)

                //TODO
            }
        },
        getAllConnectedTransports: () => ctx.getWebSockets().map((ws) => ({
            send: (data) => ws.send(data),
            close: () => ws.close(),
            isOpen: () => ws.readyState === ws.OPEN,
            subs: {
                //TODO
            }
        }))
    });
    const {reloadSubscriptionOnTransport} = utils;
    return {
        ...utils,
        reloadSubscriptionOnTransport: undefined,
        reloadSubscriptions: () => {

        }
    }
}

export abstract class TrpcDurableObject<TRouter extends AnyRouter, Env = unknown> extends DurableObject {
    protected router: TRouter;

    constructor(state: DurableObjectState, env: Env, router: TRouter) {
        super(state, env);
        this.router = router;
    }

    override async fetch(_request: Request): Promise<Response> {
        const utils = await cloudflareTrpcUtils(this.router, null, this.ctx)
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        utils.reloadSubscriptions();

        // Creates two ends of a WebSocket connection.
        const [client, server] = Object.values(new WebSocketPair());
        // Stores WS connection in hibernation api.
        this.ctx.acceptWebSocket(server!, [newWSTrpcTag()]);
        // Returns the client end of the WebSocket connection to the client.
        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
        const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx)
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        utils.reloadSubscriptions();
        await utils.handleMessage(message);
    }

    override async webSocketError(ws: WebSocket, _error: any) {
        const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        utils.reloadSubscriptions();
        utils.handleClose();
    }

    override async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
        const utils = await cloudflareTrpcUtils(this.router, ws, this.ctx);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        utils.reloadSubscriptions();
        utils.handleClose();
    }

    override async alarm() {
        const utils = await cloudflareTrpcUtils(this.router, null, this.ctx);
        // Reload all existing subscriptions (ensures subscription behaviour to work as expected)
        utils.reloadSubscriptions();
    }
}

